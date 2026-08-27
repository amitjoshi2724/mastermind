/**
 * Storage Layer: LocalStorage + Firebase Firestore Dual Sync
 * Ensures offline play for guests and real-time cloud synchronization for authenticated users.
 * Features:
 * - Intelligent Guest-to-User progress migration on sign-in
 * - Bidirectional union merge between local cache and Firestore cloud documents
 * - Strict multi-account isolation on sign-out and account switching
 * - Clear diagnostics for Firestore setup issues (rules / database creation)
 */
import { db } from './firebase-config.js';
import { onAuthChange, getCurrentUser } from './auth.js';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function getDefaultClassicStats() {
    return {
        wins: 0,
        total: 0,
        currentStreak: 0,
        longestStreak: 0
    };
}

function getDefaultDailyStats() {
    return {
        played: 0,
        won: 0,
        currentStreak: 0,
        maxStreak: 0,
        guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
    };
}

// In-memory state cache
let classicStats = getDefaultClassicStats();
let dailyStats = getDefaultDailyStats();
let dailyHistory = {};
let dailyInProgress = {};
let settings = { showNumbers: true };

const listeners = new Set();
let unsubscribeFirestore = null;
let currentSyncedUid = null;

function getScopedKey(key, uid = currentSyncedUid) {
    return uid ? `mastermind_user_${uid}_${key}` : `mastermind_guest_${key}`;
}

function loadFromLocal(key, defaultVal) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? { ...defaultVal, ...JSON.parse(raw) } : defaultVal;
    } catch (e) {
        console.warn(`Error reading localStorage for ${key}:`, e);
        return defaultVal;
    }
}

function saveToLocal(key, val) {
    try {
        localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
        console.warn(`Error saving localStorage for ${key}:`, e);
    }
}

function removeFromLocal(key) {
    try {
        localStorage.removeItem(key);
    } catch (e) {
        console.warn(`Error removing localStorage for ${key}:`, e);
    }
}

function notifyListeners() {
    listeners.forEach(fn => {
        try {
            fn({ classicStats, dailyStats, dailyHistory, dailyInProgress, settings });
        } catch (e) {
            console.error("Storage listener error:", e);
        }
    });
}

/**
 * Load local storage data for a specific user ID (or guest if null)
 */
function loadUserLocalState(uid) {
    classicStats = loadFromLocal(getScopedKey('classic_stats', uid), getDefaultClassicStats());
    dailyStats = loadFromLocal(getScopedKey('daily_stats', uid), getDefaultDailyStats());
    dailyHistory = loadFromLocal(getScopedKey('daily_history', uid), {});
    dailyInProgress = loadFromLocal(getScopedKey('daily_in_progress', uid), {});
    settings = loadFromLocal('mastermind_settings', { showNumbers: true });
}

/**
 * Save current memory state to local storage for current user ID
 */
function saveUserLocalState(uid = currentSyncedUid) {
    saveToLocal(getScopedKey('classic_stats', uid), classicStats);
    saveToLocal(getScopedKey('daily_stats', uid), dailyStats);
    saveToLocal(getScopedKey('daily_history', uid), dailyHistory);
    saveToLocal(getScopedKey('daily_in_progress', uid), dailyInProgress);
    saveToLocal('mastermind_settings', settings);
}

// Initialize guest state on startup
loadUserLocalState(null);

/**
 * Subscribe to storage updates (local or cloud)
 */
export function onStorageChange(callback) {
    listeners.add(callback);
    callback({ classicStats, dailyStats, dailyHistory, dailyInProgress, settings });
    return () => listeners.delete(callback);
}

// Set up Firebase Auth sync listener with clean account switching & guest migration
onAuthChange(async (user) => {
    if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
    }

    if (user) {
        currentSyncedUid = user.uid;
        console.log(`[Auth/Storage] Switched to user: ${user.displayName || user.email} (${user.uid})`);

        // Check if there is guest progress waiting to be migrated
        const guestHistory = loadFromLocal('mastermind_guest_daily_history', {});
        const guestClassic = loadFromLocal('mastermind_guest_classic_stats', null);
        const guestDaily = loadFromLocal('mastermind_guest_daily_stats', null);

        // Load this user's existing local cache
        loadUserLocalState(user.uid);

        // Migrate guest games into user's account if guest had played
        if (Object.keys(guestHistory).length > 0) {
            console.log("[Auth/Storage] Migrating guest progress to user account:", Object.keys(guestHistory));
            dailyHistory = { ...guestHistory, ...dailyHistory };
            if (guestDaily) {
                dailyStats.played = Math.max(dailyStats.played, guestDaily.played || 0);
                dailyStats.won = Math.max(dailyStats.won, guestDaily.won || 0);
                dailyStats.currentStreak = Math.max(dailyStats.currentStreak, guestDaily.currentStreak || 0);
                dailyStats.maxStreak = Math.max(dailyStats.maxStreak, guestDaily.maxStreak || 0);
                if (guestDaily.guessDistribution) {
                    for (let i = 1; i <= 10; i++) {
                        dailyStats.guessDistribution[i] = (dailyStats.guessDistribution[i] || 0) + (guestDaily.guessDistribution[i] || 0);
                    }
                }
            }
            if (guestClassic) {
                classicStats.wins = Math.max(classicStats.wins, guestClassic.wins || 0);
                classicStats.total = Math.max(classicStats.total, guestClassic.total || 0);
                classicStats.currentStreak = Math.max(classicStats.currentStreak, guestClassic.currentStreak || 0);
                classicStats.longestStreak = Math.max(classicStats.longestStreak, guestClassic.longestStreak || 0);
            }
            // Clear guest keys after migration
            removeFromLocal('mastermind_guest_daily_history');
            removeFromLocal('mastermind_guest_daily_stats');
            removeFromLocal('mastermind_guest_classic_stats');
            removeFromLocal('mastermind_guest_daily_in_progress');
            saveUserLocalState(user.uid);
        }

        notifyListeners();

        const userRef = doc(db, 'users', user.uid);

        // Fetch from Firestore and perform bidirectional union merge
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const cloudData = snap.data();
                console.log(`[Firestore] Loaded cloud profile for ${user.uid}:`, cloudData);
                mergeCloudData(cloudData, user.uid);
                // Write back unified union to cloud
                await syncAllToFirestore();
            } else {
                console.log(`[Firestore] Creating new cloud profile for ${user.uid}`);
                await syncAllToFirestore();
            }
        } catch (error) {
            handleFirestoreError(error, "Fetching user profile");
        }

        // Attach real-time snapshot listener
        try {
            unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    mergeCloudData(data, user.uid);
                }
            }, (error) => {
                handleFirestoreError(error, "Real-time snapshot listener");
            });
        } catch (err) {
            handleFirestoreError(err, "Attaching snapshot listener");
        }

    } else {
        console.log("[Auth/Storage] Signed out — switched back to guest context.");
        currentSyncedUid = null;
        loadUserLocalState(null);
        notifyListeners();
    }
});

/**
 * Bidirectional Union Merge: Combines cloud data with local data without losing any played games
 */
function mergeCloudData(cloud, uid = currentSyncedUid) {
    if (!cloud) return;

    // 1. Merge Classic Stats (take max / best)
    if (cloud.classicStats) {
        classicStats = {
            wins: Math.max(classicStats.wins || 0, cloud.classicStats.wins || 0),
            total: Math.max(classicStats.total || 0, cloud.classicStats.total || 0),
            currentStreak: Math.max(classicStats.currentStreak || 0, cloud.classicStats.currentStreak || 0),
            longestStreak: Math.max(classicStats.longestStreak || 0, cloud.classicStats.longestStreak || 0)
        };
    } else if (cloud.total !== undefined) {
        classicStats = {
            wins: Math.max(classicStats.wins || 0, cloud.wins || 0),
            total: Math.max(classicStats.total || 0, cloud.total || 0),
            currentStreak: Math.max(classicStats.currentStreak || 0, cloud.currentStreak || 0),
            longestStreak: Math.max(classicStats.longestStreak || 0, cloud.longestStreak || 0)
        };
    }

    // 2. Merge Daily History (Union of all dates from cloud + local)
    const mergedHistory = { ...(cloud.dailyHistory || {}), ...dailyHistory };
    dailyHistory = mergedHistory;

    // 3. Recalculate or merge Daily Stats
    const playedPuzzles = Object.values(dailyHistory);
    let wonCount = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };

    playedPuzzles.forEach(p => {
        if (p.won) {
            wonCount++;
            if (p.attempts >= 1 && p.attempts <= 10) {
                distribution[p.attempts] = (distribution[p.attempts] || 0) + 1;
            }
        }
    });

    const cloudPlayed = cloud.dailyStats?.played || 0;
    const cloudWon = cloud.dailyStats?.won || 0;
    const cloudCurrentStreak = cloud.dailyStats?.currentStreak || 0;
    const cloudMaxStreak = cloud.dailyStats?.maxStreak || 0;

    dailyStats = {
        played: Math.max(playedPuzzles.length, cloudPlayed, dailyStats.played || 0),
        won: Math.max(wonCount, cloudWon, dailyStats.won || 0),
        currentStreak: Math.max(cloudCurrentStreak, dailyStats.currentStreak || 0),
        maxStreak: Math.max(cloudMaxStreak, dailyStats.maxStreak || 0),
        guessDistribution: distribution
    };

    // 4. In-progress state
    if (cloud.dailyInProgress && Object.keys(cloud.dailyInProgress).length > 0) {
        dailyInProgress = { ...cloud.dailyInProgress, ...dailyInProgress };
    }

    saveUserLocalState(uid);
    notifyListeners();
}

async function syncAllToFirestore() {
    const user = getCurrentUser();
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    try {
        const payload = {
            displayName: user.displayName || '',
            email: user.email || '',
            wins: classicStats.wins,
            total: classicStats.total,
            currentStreak: classicStats.currentStreak,
            longestStreak: classicStats.longestStreak,
            classicStats,
            dailyStats,
            dailyHistory,
            dailyInProgress,
            lastSyncedAt: Date.now()
        };
        await setDoc(userRef, payload, { merge: true });
        console.log(`[Firestore] Successfully saved cloud state for user ${user.uid} (${Object.keys(dailyHistory).length} daily puzzles)`);
    } catch (e) {
        handleFirestoreError(e, "Saving state to Firestore");
    }
}

function handleFirestoreError(error, actionContext = "Firestore operation") {
    console.error(`[Firestore Error] during ${actionContext}:`, error);

    if (error.code === 'permission-denied') {
        const msg = `Firestore Security Rules Error: Permission denied.\n\n` +
            `Make sure your Firestore Security Rules allow authenticated users to read & write their own document: users/{userId}.\n` +
            `Check firestore.rules in your project or Firebase Console.`;
        console.warn(msg);
    } else if (error.code === 'not-found' || error.message?.includes('database') || error.message?.includes('does not exist')) {
        const msg = `Firestore Database Notice:\n\n` +
            `Cloud Firestore has not been created yet for Firebase project 'mastermind-amitjoshi2724'.\n\n` +
            `To enable cloud sync:\n` +
            `1. Open Firebase Console (https://console.firebase.google.com/project/mastermind-amitjoshi2724/firestore)\n` +
            `2. Click "Create database"\n` +
            `3. Choose a location and start in Test or Production mode.`;
        console.warn(msg);
    }
}

// --- Classic Stats API ---

export function getClassicStats() {
    return { ...classicStats };
}

export async function saveClassicGameResult(isWin) {
    classicStats.total++;
    if (isWin) {
        classicStats.wins++;
        classicStats.currentStreak++;
        classicStats.longestStreak = Math.max(classicStats.longestStreak, classicStats.currentStreak);
    } else {
        classicStats.currentStreak = 0;
    }
    saveUserLocalState();
    notifyListeners();
    await syncAllToFirestore();
}

// --- Daily Stats & History API ---

export function getDailyStats() {
    return { ...dailyStats };
}

export function getDailyHistory() {
    return { ...dailyHistory };
}

export function getDailyPuzzleResult(dateStr) {
    return dailyHistory[dateStr] || null;
}

export async function saveDailyGameResult({ dateStr, puzzleNumber, won, attempts, guesses, feedbackHistory }) {
    dailyHistory[dateStr] = {
        date: dateStr,
        puzzleNumber,
        won,
        attempts,
        guesses,
        feedbackHistory,
        completedAt: Date.now()
    };

    delete dailyInProgress[dateStr];

    dailyStats.played++;
    if (won) {
        dailyStats.won++;
        dailyStats.currentStreak++;
        dailyStats.maxStreak = Math.max(dailyStats.maxStreak, dailyStats.currentStreak);
        if (attempts >= 1 && attempts <= 10) {
            dailyStats.guessDistribution[attempts] = (dailyStats.guessDistribution[attempts] || 0) + 1;
        }
    } else {
        dailyStats.currentStreak = 0;
    }

    saveUserLocalState();
    notifyListeners();
    await syncAllToFirestore();
}

export async function resetDailyGameResult(dateStr) {
    const prevResult = dailyHistory[dateStr];
    if (prevResult) {
        dailyStats.played = Math.max(0, (dailyStats.played || 1) - 1);
        if (prevResult.won) {
            dailyStats.won = Math.max(0, (dailyStats.won || 1) - 1);
            if (prevResult.attempts && dailyStats.guessDistribution && dailyStats.guessDistribution[prevResult.attempts]) {
                dailyStats.guessDistribution[prevResult.attempts] = Math.max(0, dailyStats.guessDistribution[prevResult.attempts] - 1);
            }
        }
        delete dailyHistory[dateStr];
    }

    delete dailyInProgress[dateStr];

    saveUserLocalState();
    notifyListeners();
    await syncAllToFirestore();
}

export function getDailyInProgress(dateStr) {
    return dailyInProgress[dateStr] || null;
}

export function saveDailyInProgress(dateStr, state) {
    if (!state) {
        delete dailyInProgress[dateStr];
    } else {
        dailyInProgress[dateStr] = state;
    }
    saveUserLocalState();
}

// --- Settings API ---

export function getSettings() {
    return { ...settings };
}

export function saveSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    saveToLocal('mastermind_settings', settings);
    notifyListeners();
}
