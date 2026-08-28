/**
 * Storage Layer: LocalStorage + Firebase Firestore Dual Sync
 * Ensures offline play for guests and real-time cloud synchronization for authenticated users.
 * Features:
 * - Intelligent Legacy & Guest-to-User progress migration on sign-in
 * - Bidirectional union merge between local cache and Firestore cloud documents
 * - Automatic recalculation of guess distribution and streaks from history
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
 * Recomputes guess distribution and basic stats from dailyHistory dictionary
 */
function recalculateDailyStatsFromHistory(history, currentStats = {}) {
    const playedPuzzles = Object.values(history || {});
    let wonCount = 0;
    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 };

    playedPuzzles.forEach(p => {
        if (p && p.won) {
            wonCount++;
            if (p.attempts >= 1 && p.attempts <= 10) {
                distribution[p.attempts] = (distribution[p.attempts] || 0) + 1;
            }
        }
    });

    const played = Math.max(playedPuzzles.length, currentStats.played || 0);
    const won = Math.max(wonCount, currentStats.won || 0);
    const currentStreak = currentStats.currentStreak || (wonCount > 0 ? 1 : 0);
    const maxStreak = Math.max(currentStats.maxStreak || 0, currentStreak, wonCount > 0 ? 1 : 0);

    return {
        played,
        won,
        currentStreak,
        maxStreak,
        guessDistribution: distribution
    };
}

/**
 * Normalize a dailyHistory object to ensure all guess rows are number arrays,
 * regardless of whether they were stored as strings ('6,6,2,2') or arrays ([6,6,2,2]).
 * This handles corrupt/legacy local storage as well as Firestore-serialized data.
 */
function normalizeHistory(history) {
    const out = {};
    for (const [date, result] of Object.entries(history || {})) {
        if (!result) continue;
        out[date] = {
            ...result,
            guesses: (result.guesses || []).map(row => {
                if (Array.isArray(row)) return row.map(Number);
                if (typeof row === 'string') return row.split(',').map(Number);
                return [];
            })
        };
    }
    return out;
}

/**
 * Load local storage data for a specific user ID (or guest if null)
 */
function loadUserLocalState(uid) {
    classicStats = loadFromLocal(getScopedKey('classic_stats', uid), getDefaultClassicStats());
    dailyStats = loadFromLocal(getScopedKey('daily_stats', uid), getDefaultDailyStats());
    // Always normalize when loading from localStorage — handles any corrupt/legacy string guesses
    dailyHistory = normalizeHistory(loadFromLocal(getScopedKey('daily_history', uid), {}));
    dailyInProgress = loadFromLocal(getScopedKey('daily_in_progress', uid), {});
    settings = loadFromLocal('mastermind_settings', { showNumbers: true });

    // Recalculate stats from history to ensure consistency
    if (Object.keys(dailyHistory).length > 0) {
        dailyStats = recalculateDailyStatsFromHistory(dailyHistory, dailyStats);
    }
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

// Initial bootstrap from local storage (including check for legacy keys)
loadUserLocalState(null);
const bootLegacyHistory = loadFromLocal('mastermind_daily_history', {});
if (Object.keys(bootLegacyHistory).length > 0) {
    dailyHistory = { ...bootLegacyHistory, ...dailyHistory };
    dailyStats = recalculateDailyStatsFromHistory(dailyHistory, dailyStats);
    saveUserLocalState(null);
}

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

        // Check for any legacy un-scoped or guest progress to migrate into user account
        const legacyHistory = loadFromLocal('mastermind_daily_history', {});
        const legacyClassic = loadFromLocal('mastermind_classic_stats', null);
        const guestHistory = loadFromLocal('mastermind_guest_daily_history', {});
        const guestClassic = loadFromLocal('mastermind_guest_classic_stats', null);

        // Load this user's existing local cache
        loadUserLocalState(user.uid);

        // Merge legacy and guest games into this account so nothing is lost
        dailyHistory = { ...legacyHistory, ...guestHistory, ...dailyHistory };

        if (legacyClassic || guestClassic) {
            classicStats.wins = Math.max(classicStats.wins, legacyClassic?.wins || 0, guestClassic?.wins || 0);
            classicStats.total = Math.max(classicStats.total, legacyClassic?.total || 0, guestClassic?.total || 0);
            classicStats.currentStreak = Math.max(classicStats.currentStreak, legacyClassic?.currentStreak || 0, guestClassic?.currentStreak || 0);
            classicStats.longestStreak = Math.max(classicStats.longestStreak, legacyClassic?.longestStreak || 0, guestClassic?.longestStreak || 0);
        }

        dailyStats = recalculateDailyStatsFromHistory(dailyHistory, dailyStats);
        saveUserLocalState(user.uid);
        notifyListeners();

        const userRef = doc(db, 'users', user.uid);

        // Fetch from Firestore and perform bidirectional union merge
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const cloudData = snap.data();
                console.log(`[Firestore] Loaded cloud profile for ${user.uid}:`, cloudData);
                mergeCloudData(cloudData, user.uid);
            }
            // Always push the complete unified state to Firestore
            await syncAllToFirestore();
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

    // 2. Merge Daily History: normalize both cloud and local, then union them.
    // Cloud takes precedence for completed puzzles (local may have corrupt string guesses)
    const cloudHistory = normalizeHistory(cloud.dailyHistory || {});
    const localHistory = normalizeHistory(dailyHistory);
    dailyHistory = { ...localHistory, ...cloudHistory };

    // 3. Recalculate Daily Stats and Guess Distribution from complete history
    dailyStats = recalculateDailyStatsFromHistory(dailyHistory, {
        played: cloud.dailyStats?.played || dailyStats.played,
        won: cloud.dailyStats?.won || dailyStats.won,
        currentStreak: cloud.dailyStats?.currentStreak || dailyStats.currentStreak,
        maxStreak: cloud.dailyStats?.maxStreak || dailyStats.maxStreak
    });

    // 4. In-progress state
    if (cloud.dailyInProgress && Object.keys(cloud.dailyInProgress).length > 0) {
        const cloudInProgress = deserializeInProgress(cloud.dailyInProgress);
        dailyInProgress = { ...cloudInProgress, ...dailyInProgress };
    }

    saveUserLocalState(uid);
    notifyListeners();
}

/**
 * Firestore does NOT support nested arrays (e.g. guesses: [[1,2,3,4], ...]).
 * Serialize each guess row to a comma-separated string before writing.
 */
function serializeDailyHistory(history) {
    const out = {};
    for (const [date, result] of Object.entries(history || {})) {
        if (!result) continue;
        out[date] = {
            ...result,
            guesses: (result.guesses || []).map(row =>
                Array.isArray(row) ? row.join(',') : row
            )
        };
    }
    return out;
}

/**
 * Deserialize guess rows back from strings to number arrays after reading from Firestore.
 */
function deserializeDailyHistory(history) {
    const out = {};
    for (const [date, result] of Object.entries(history || {})) {
        if (!result) continue;
        out[date] = {
            ...result,
            guesses: (result.guesses || []).map(row =>
                typeof row === 'string' ? row.split(',').map(Number) : row
            )
        };
    }
    return out;
}

function serializeInProgress(inProgress) {
    const out = {};
    for (const [date, state] of Object.entries(inProgress || {})) {
        if (!state) continue;
        out[date] = {
            ...state,
            guesses: (state.guesses || []).map(row =>
                Array.isArray(row) ? row.join(',') : row
            )
        };
    }
    return out;
}

function deserializeInProgress(inProgress) {
    const out = {};
    for (const [date, state] of Object.entries(inProgress || {})) {
        if (!state) continue;
        out[date] = {
            ...state,
            guesses: (state.guesses || []).map(row =>
                typeof row === 'string' ? row.split(',').map(Number) : row
            )
        };
    }
    return out;
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
            dailyHistory: serializeDailyHistory(dailyHistory),
            dailyInProgress: serializeInProgress(dailyInProgress),
            lastSyncedAt: Date.now()
        };
        await setDoc(userRef, payload, { merge: true });
        console.log(`[Firestore] ✅ Saved ${Object.keys(dailyHistory).length} daily puzzles & stats for ${user.email} (${user.uid})`);
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

    // Recalculate stats and guess distribution directly from updated history
    dailyStats = recalculateDailyStatsFromHistory(dailyHistory, {
        played: dailyStats.played + 1,
        won: won ? dailyStats.won + 1 : dailyStats.won,
        currentStreak: won ? dailyStats.currentStreak + 1 : 0,
        maxStreak: won ? Math.max(dailyStats.maxStreak, dailyStats.currentStreak + 1) : dailyStats.maxStreak
    });

    saveUserLocalState();
    notifyListeners();
    await syncAllToFirestore();
}

export async function resetDailyGameResult(dateStr) {
    delete dailyHistory[dateStr];
    delete dailyInProgress[dateStr];

    // Recompute stats from remaining history
    dailyStats = recalculateDailyStatsFromHistory(dailyHistory, {
        played: Math.max(0, (dailyStats.played || 1) - 1),
        won: Math.max(0, (dailyStats.won || 1) - 1),
        currentStreak: dailyStats.currentStreak,
        maxStreak: dailyStats.maxStreak
    });

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
