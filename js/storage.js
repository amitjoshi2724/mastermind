/**
 * Storage Layer: LocalStorage + Firebase Firestore Dual Sync
 * Ensures offline play for guests and real-time cloud synchronization for authenticated users.
 */
import { db } from './firebase-config.js';
import { onAuthChange, getCurrentUser } from './auth.js';
import { doc, getDoc, setDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const STORAGE_KEYS = {
    CLASSIC_STATS: 'mastermind_classic_stats',
    DAILY_STATS: 'mastermind_daily_stats',
    DAILY_HISTORY: 'mastermind_daily_history',
    DAILY_IN_PROGRESS: 'mastermind_daily_in_progress',
    SETTINGS: 'mastermind_settings'
};

// In-memory state cache
let classicStats = loadFromLocal(STORAGE_KEYS.CLASSIC_STATS, {
    wins: 0,
    total: 0,
    currentStreak: 0,
    longestStreak: 0
});

let dailyStats = loadFromLocal(STORAGE_KEYS.DAILY_STATS, {
    played: 0,
    won: 0,
    currentStreak: 0,
    maxStreak: 0,
    guessDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0 }
});

let dailyHistory = loadFromLocal(STORAGE_KEYS.DAILY_HISTORY, {});
let dailyInProgress = loadFromLocal(STORAGE_KEYS.DAILY_IN_PROGRESS, {});
let settings = loadFromLocal(STORAGE_KEYS.SETTINGS, { showNumbers: true });

const listeners = new Set();
let unsubscribeFirestore = null;
let currentSyncedUid = null;

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
 * Subscribe to storage updates (local or cloud)
 */
export function onStorageChange(callback) {
    listeners.add(callback);
    callback({ classicStats, dailyStats, dailyHistory, dailyInProgress, settings });
    return () => listeners.delete(callback);
}

// Set up Firebase Auth sync listener
onAuthChange(async (user) => {
    if (user) {
        if (currentSyncedUid === user.uid) return;
        currentSyncedUid = user.uid;

        if (unsubscribeFirestore) {
            unsubscribeFirestore();
            unsubscribeFirestore = null;
        }

        const userRef = doc(db, 'users', user.uid);

        // Listen for real-time changes
        unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                mergeCloudData(data);
            }
        }, (error) => {
            console.warn("Firestore snapshot listener notice (check firestore.rules):", error.message);
        });

        // Initial fetch and merge
        try {
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                mergeCloudData(snap.data());
            } else {
                // First-time user document creation: upload local progress
                await syncAllToFirestore();
            }
        } catch (error) {
            console.warn("Firestore initial sync notice:", error.message);
        }
    } else {
        currentSyncedUid = null;
        if (unsubscribeFirestore) {
            unsubscribeFirestore();
            unsubscribeFirestore = null;
        }
        notifyListeners();
    }
});

function mergeCloudData(cloud) {
    if (!cloud) return;

    // Classic Stats
    if (cloud.classicStats || cloud.total !== undefined) {
        const c = cloud.classicStats || {
            wins: cloud.wins || 0,
            total: cloud.total || 0,
            currentStreak: cloud.currentStreak || 0,
            longestStreak: cloud.longestStreak || 0
        };
        // Merge max
        classicStats = {
            wins: Math.max(classicStats.wins, c.wins || 0),
            total: Math.max(classicStats.total, c.total || 0),
            currentStreak: Math.max(classicStats.currentStreak, c.currentStreak || 0),
            longestStreak: Math.max(classicStats.longestStreak, c.longestStreak || 0)
        };
        saveToLocal(STORAGE_KEYS.CLASSIC_STATS, classicStats);
    }

    // Daily Stats
    if (cloud.dailyStats) {
        const d = cloud.dailyStats;
        const mergedDistribution = { ...dailyStats.guessDistribution };
        if (d.guessDistribution) {
            for (let i = 1; i <= 10; i++) {
                mergedDistribution[i] = Math.max(mergedDistribution[i] || 0, d.guessDistribution[i] || 0);
            }
        }
        dailyStats = {
            played: Math.max(dailyStats.played, d.played || 0),
            won: Math.max(dailyStats.won, d.won || 0),
            currentStreak: Math.max(dailyStats.currentStreak, d.currentStreak || 0),
            maxStreak: Math.max(dailyStats.maxStreak, d.maxStreak || 0),
            guessDistribution: mergedDistribution
        };
        saveToLocal(STORAGE_KEYS.DAILY_STATS, dailyStats);
    }

    // Daily History
    if (cloud.dailyHistory) {
        dailyHistory = { ...dailyHistory, ...cloud.dailyHistory };
        saveToLocal(STORAGE_KEYS.DAILY_HISTORY, dailyHistory);
    }

    notifyListeners();
}

async function syncAllToFirestore() {
    const user = getCurrentUser();
    if (!user) return;

    const userRef = doc(db, 'users', user.uid);
    try {
        await setDoc(userRef, {
            displayName: user.displayName || '',
            email: user.email || '',
            // Legacy classic stats keys for backward compatibility
            wins: classicStats.wins,
            total: classicStats.total,
            currentStreak: classicStats.currentStreak,
            longestStreak: classicStats.longestStreak,
            // Modular structured stats
            classicStats,
            dailyStats,
            dailyHistory,
            lastSyncedAt: Date.now()
        }, { merge: true });
    } catch (e) {
        console.warn("Error syncing stats to Firestore:", e.message);
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
    saveToLocal(STORAGE_KEYS.CLASSIC_STATS, classicStats);
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
    // Record history entry
    dailyHistory[dateStr] = {
        date: dateStr,
        puzzleNumber,
        won,
        attempts,
        guesses,
        feedbackHistory,
        completedAt: Date.now()
    };
    saveToLocal(STORAGE_KEYS.DAILY_HISTORY, dailyHistory);

    // Clear any in-progress state for this date
    delete dailyInProgress[dateStr];
    saveToLocal(STORAGE_KEYS.DAILY_IN_PROGRESS, dailyInProgress);

    // Update Daily Stats
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
    saveToLocal(STORAGE_KEYS.DAILY_STATS, dailyStats);

    notifyListeners();
    await syncAllToFirestore();
}

export async function resetDailyGameResult(dateStr) {
    const prevResult = dailyHistory[dateStr];
    if (prevResult) {
        // Rollback stats from the previous attempt
        dailyStats.played = Math.max(0, (dailyStats.played || 1) - 1);
        if (prevResult.won) {
            dailyStats.won = Math.max(0, (dailyStats.won || 1) - 1);
            if (prevResult.attempts && dailyStats.guessDistribution && dailyStats.guessDistribution[prevResult.attempts]) {
                dailyStats.guessDistribution[prevResult.attempts] = Math.max(0, dailyStats.guessDistribution[prevResult.attempts] - 1);
            }
        }
        delete dailyHistory[dateStr];
        saveToLocal(STORAGE_KEYS.DAILY_HISTORY, dailyHistory);
        saveToLocal(STORAGE_KEYS.DAILY_STATS, dailyStats);
    }

    // Clear any in-progress state
    delete dailyInProgress[dateStr];
    saveToLocal(STORAGE_KEYS.DAILY_IN_PROGRESS, dailyInProgress);

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
    saveToLocal(STORAGE_KEYS.DAILY_IN_PROGRESS, dailyInProgress);
}

// --- Settings API ---

export function getSettings() {
    return { ...settings };
}

export function saveSettings(newSettings) {
    settings = { ...settings, ...newSettings };
    saveToLocal(STORAGE_KEYS.SETTINGS, settings);
    notifyListeners();
}
