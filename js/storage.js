/**
 * Storage Layer: LocalStorage + Firebase Firestore Dual Sync
 * Ensures offline play for guests and real-time cloud synchronization for authenticated users.
 * Supports multi-account switching with clean user isolation.
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

// Set up Firebase Auth sync listener with clean account switching
onAuthChange(async (user) => {
    if (unsubscribeFirestore) {
        unsubscribeFirestore();
        unsubscribeFirestore = null;
    }

    if (user) {
        currentSyncedUid = user.uid;
        console.log(`[Auth/Storage] Switched to user: ${user.displayName || user.email} (${user.uid})`);

        // Load this user's local cache first
        loadUserLocalState(user.uid);
        notifyListeners();

        const userRef = doc(db, 'users', user.uid);

        // Fetch from Firestore
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const cloudData = snap.data();
                console.log(`[Firestore] Loaded cloud profile for ${user.uid}:`, cloudData);
                applyCloudData(cloudData, user.uid);
            } else {
                console.log(`[Firestore] New user document created for ${user.uid}`);
                await syncAllToFirestore();
            }
        } catch (error) {
            console.error("[Firestore] Error fetching user data:", error);
            if (error.code === 'permission-denied') {
                console.warn("Firestore permission denied. Check that Firestore Security Rules allow read/write for request.auth.uid == userId.");
            }
        }

        // Attach real-time snapshot listener
        unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                applyCloudData(data, user.uid);
            }
        }, (error) => {
            console.warn("[Firestore] Snapshot listener notice:", error.message);
        });

    } else {
        console.log("[Auth/Storage] Signed out — switched back to guest context.");
        currentSyncedUid = null;
        loadUserLocalState(null);
        notifyListeners();
    }
});

function applyCloudData(cloud, uid = currentSyncedUid) {
    if (!cloud) return;

    // Classic Stats
    if (cloud.classicStats) {
        classicStats = { ...getDefaultClassicStats(), ...cloud.classicStats };
    } else if (cloud.total !== undefined) {
        classicStats = {
            wins: cloud.wins || 0,
            total: cloud.total || 0,
            currentStreak: cloud.currentStreak || 0,
            longestStreak: cloud.longestStreak || 0
        };
    }

    // Daily Stats
    if (cloud.dailyStats) {
        dailyStats = {
            ...getDefaultDailyStats(),
            ...cloud.dailyStats,
            guessDistribution: {
                ...getDefaultDailyStats().guessDistribution,
                ...(cloud.dailyStats.guessDistribution || {})
            }
        };
    }

    // Daily History
    if (cloud.dailyHistory) {
        dailyHistory = { ...cloud.dailyHistory };
    }

    // In Progress
    if (cloud.dailyInProgress) {
        dailyInProgress = { ...cloud.dailyInProgress };
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
            // Legacy classic stats keys
            wins: classicStats.wins,
            total: classicStats.total,
            currentStreak: classicStats.currentStreak,
            longestStreak: classicStats.longestStreak,
            // Modular structured stats
            classicStats,
            dailyStats,
            dailyHistory,
            dailyInProgress,
            lastSyncedAt: Date.now()
        };
        await setDoc(userRef, payload, { merge: true });
        console.log(`[Firestore] Successfully saved cloud state for user ${user.uid}`);
    } catch (e) {
        console.error("[Firestore] Error syncing stats to Firestore:", e);
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
