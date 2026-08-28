/**
 * Classic Unlimited Mastermind Mode Controller
 *
 * All board DOM logic lives in board.js — this file only handles
 * Classic-specific game state (random code, win/loss tracking, scoreboard).
 */
import { COLORS, MAX_ROWS, CODE_LENGTH, generateRandomCode, evaluateGuess } from './engine.js';
import { setupAuthUI } from './auth.js';
import { getClassicStats, saveClassicGameResult, onStorageChange } from './storage.js';
import { renderNumberToggle, showToast, setupModalListeners } from './ui.js';
import {
    resetBoard,
    resetAnswerRow,
    renderColorButtons,
    renderRowFeedback,
    revealAnswer,
    enableColorButtons,
    applyColorToRow,
    clearLastColorFromRow,
    getRowElement
} from './board.js';

let secretCode = [];
let currentGuess = [];
let currentRow = 0;
let gameActive = true;

export function initClassicMode() {
    setupModalListeners();
    renderNumberToggle('toggle-container');
    setupAuthUI('auth-container');
    renderColorButtons('color-buttons', selectColor);

    // Undo button
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.onclick = () => undoColor();

    // Reset button
    const resetBtn = document.querySelector('.reset-button');
    if (resetBtn) resetBtn.onclick = () => initGame();

    // Keep scoreboard in sync with storage (cross-device cloud updates)
    onStorageChange(({ classicStats }) => {
        updateScoreboard(classicStats);
    });

    initGame();
}

function initGame() {
    secretCode = generateRandomCode();
    currentGuess = [];
    currentRow = 0;
    gameActive = true;

    resetAnswerRow();
    resetBoard(checkGuess);

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;

    enableColorButtons(true);
}

function selectColor(colorIndex) {
    if (!gameActive || currentGuess.length >= CODE_LENGTH) return;

    const colorObj = COLORS[colorIndex];
    currentGuess.push(colorObj.id);

    applyColorToRow(currentRow, currentGuess.length, colorObj);

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = false;
}

function undoColor() {
    if (!gameActive || currentGuess.length === 0) return;

    const prevLength = currentGuess.length;
    currentGuess.pop();

    clearLastColorFromRow(currentRow, prevLength - 1);

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = currentGuess.length === 0;
}

function checkGuess(rowIndex) {
    if (currentGuess.length !== CODE_LENGTH) return;

    const result = evaluateGuess(secretCode, currentGuess);
    renderRowFeedback(currentRow, { white: result.white, black: result.black });

    if (result.isWin) {
        gameWon();
    } else if (currentRow === MAX_ROWS - 1) {
        gameLost();
    } else {
        currentRow++;
        currentGuess = [];
        const undoBtn = document.getElementById('undo-button');
        if (undoBtn) undoBtn.disabled = true;
    }
}

async function gameWon() {
    gameActive = false;
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;
    enableColorButtons(false);

    revealAnswer(secretCode, true);
    await saveClassicGameResult(true);
    showToast('🎉 Congratulations! You cracked the code!');
}

async function gameLost() {
    gameActive = false;
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;
    enableColorButtons(false);

    revealAnswer(secretCode, false);
    await saveClassicGameResult(false);
    showToast('Game Over! Better luck next time.');
}

function updateScoreboard(stats = getClassicStats()) {
    const scoreboardEl = document.getElementById('scoreboard');
    if (!scoreboardEl) return;

    const winPercentage = stats.total > 0 ? ((stats.wins / stats.total) * 100).toFixed(2) : '0.00';
    scoreboardEl.innerHTML = `
        <div>Wins: ${stats.wins}/${stats.total} (${winPercentage}%)</div>
        <div>Current Streak: ${stats.currentStreak}</div>
        <div>Longest Streak: ${stats.longestStreak}</div>
    `;
}

// Auto-initialize when loaded as a module
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClassicMode);
} else {
    initClassicMode();
}
