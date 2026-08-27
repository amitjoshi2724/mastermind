/**
 * Mastermind Core Game Engine
 * Shared between Classic Unlimited Mode and Daily Mastermindle Mode.
 */

// Mastermind Standard 6-Color Palette
export const COLORS = [
    { id: 1, name: 'Red', hex: '#e53935', bgClass: 'peg-red', label: '1', emoji: '🔴' },
    { id: 2, name: 'Blue', hex: '#1e88e5', bgClass: 'peg-blue', label: '2', emoji: '🔵' },
    { id: 3, name: 'Green', hex: '#43a047', bgClass: 'peg-green', label: '3', emoji: '🟢' },
    { id: 4, name: 'Yellow', hex: '#fdd835', bgClass: 'peg-yellow', label: '4', emoji: '🟡' },
    { id: 5, name: 'Orange', hex: '#fb8c00', bgClass: 'peg-orange', label: '5', emoji: '🟠' },
    { id: 6, name: 'Purple', hex: '#8e24aa', bgClass: 'peg-purple', label: '6', emoji: '🟣' }
];

export const MAX_ROWS = 10;
export const CODE_LENGTH = 4;
export const EPOCH_START_DATE = '2024-01-01'; // Mastermindle Puzzle #1

/**
 * 32-bit integer hash function for strings (cyrb53-inspired)
 */
function hashString(str) {
    let h1 = 0xdeadbeef ^ 0;
    let h2 = 0x41c6ce57 ^ 0;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Mulberry32 deterministic pseudo-random number generator
 * Given a seed, returns a function that produces floats in [0, 1)
 */
export function createPRNG(seed) {
    let s = typeof seed === 'string' ? hashString(seed) : seed;
    return function () {
        s |= 0;
        s = s + 0x6D2B79F5 | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * Generates a non-seeded random 4-color secret code for Classic Mode
 */
export function generateRandomCode(length = CODE_LENGTH, colors = COLORS) {
    const code = [];
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * colors.length);
        code.push(colors[randomIndex].id);
    }
    return code;
}

/**
 * Generates a deterministic 4-color secret code for a given date string (YYYY-MM-DD)
 */
export function generateDailyCode(dateStr, length = CODE_LENGTH, colors = COLORS) {
    const prng = createPRNG(`mastermindle-${dateStr}`);
    const code = [];
    for (let i = 0; i < length; i++) {
        const index = Math.floor(prng() * colors.length);
        code.push(colors[index].id);
    }
    return code;
}

/**
 * Evaluates a guess against the secret code.
 * Follows exact Mastermind feedback peg rules:
 * - White peg: Correct color and correct position
 * - Black peg: Correct color, but wrong position (1-to-1 matching)
 * 
 * @param {Array<number>} secretCode - Array of color IDs, e.g. [1, 2, 3, 4]
 * @param {Array<number>} guess - Array of color IDs, e.g. [1, 3, 2, 4]
 * @returns {{ white: number, black: number, isWin: boolean, pegs: Array<string> }}
 */
export function evaluateGuess(secretCode, guess) {
    if (!Array.isArray(secretCode) || !Array.isArray(guess) || secretCode.length !== guess.length) {
        throw new Error('Secret code and guess must be arrays of the same length');
    }

    const length = secretCode.length;
    let white = 0;
    let black = 0;

    const secretCopy = [...secretCode];
    const guessCopy = [...guess];

    // Step 1: Count exact matches (White pegs: correct color + position)
    for (let i = 0; i < length; i++) {
        if (guessCopy[i] === secretCopy[i]) {
            white++;
            secretCopy[i] = null;
            guessCopy[i] = null;
        }
    }

    // Step 2: Count color matches at different positions (Black pegs)
    for (let i = 0; i < length; i++) {
        if (guessCopy[i] === null) continue;
        const foundIndex = secretCopy.indexOf(guessCopy[i]);
        if (foundIndex !== -1) {
            black++;
            secretCopy[foundIndex] = null;
        }
    }

    // Generate ordered feedback peg list (whites first, then blacks)
    const pegs = [];
    for (let i = 0; i < white; i++) pegs.push('white');
    for (let i = 0; i < black; i++) pegs.push('black');

    return {
        white,
        black,
        isWin: white === length,
        pegs
    };
}

/**
 * Get Color object by ID
 */
export function getColorById(id) {
    return COLORS.find(c => c.id === id) || null;
}

/**
 * Format Date object to YYYY-MM-DD string in local timezone
 */
export function formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Get today's local date string
 */
export function getTodayDateStr() {
    return formatDate(new Date());
}

/**
 * Parse YYYY-MM-DD string into a local Date object at noon (prevents DST midnight shift)
 */
export function parseDate(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d, 12, 0, 0);
}

/**
 * Calculate Mastermindle Puzzle Number from date string
 */
export function getPuzzleNumber(dateStr, epochStr = EPOCH_START_DATE) {
    const targetDate = parseDate(dateStr);
    const epochDate = parseDate(epochStr);
    const diffTime = targetDate.getTime() - epochDate.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    return diffDays + 1;
}

/**
 * Calculate Date string for a given Mastermindle Puzzle Number
 */
export function getDateForPuzzleNumber(puzzleNumber, epochStr = EPOCH_START_DATE) {
    const epochDate = parseDate(epochStr);
    const targetDate = new Date(epochDate);
    targetDate.setDate(epochDate.getDate() + (puzzleNumber - 1));
    return formatDate(targetDate);
}

/**
 * Generate Wordle-style Share Text
 * 
 * @param {number} puzzleNum - e.g. 42
 * @param {string} dateStr - e.g. "2026-08-27"
 * @param {number} attempts - Number of attempts used (1-10) or 'X' if lost
 * @param {number} maxAttempts - Max attempts (10)
 * @param {Array<{white: number, black: number}>} feedbackHistory - List of feedback per guess
 * @param {boolean} isWin - Whether player won
 * @param {string} url - Game URL
 */
export function generateShareText(puzzleNum, dateStr, attempts, maxAttempts = MAX_ROWS, feedbackHistory = [], isWin = false) {
    const scoreStr = isWin ? `Solved in ${attempts}` : `X/${maxAttempts}`;
    let result = `Mastermindle #${puzzleNum} — ${scoreStr}\n📅 ${dateStr}\n\n`;

    // Reverse history so latest/winning guess appears at top, matching visual bottom-up game board
    const rowsToRender = [...feedbackHistory].reverse();

    rowsToRender.forEach(fb => {
        let rowStr = '';
        // ⚪ White peg (exact color & position)
        for (let i = 0; i < fb.white; i++) rowStr += '⚪';
        // ⚫ Black peg (color in wrong position)
        for (let i = 0; i < fb.black; i++) rowStr += '⚫';
        // 🔘 Gray circle for blank / no peg
        const emptyCount = CODE_LENGTH - (fb.white + fb.black);
        for (let i = 0; i < emptyCount; i++) rowStr += '🔘';

        result += `${rowStr}\n`;
    });

    return result.trimEnd();
}
