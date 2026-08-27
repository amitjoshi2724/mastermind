/**
 * Classic Unlimited Mastermind Mode Controller
 */
import { COLORS, MAX_ROWS, CODE_LENGTH, generateRandomCode, evaluateGuess } from './engine.js';
import { setupAuthUI } from './auth.js';
import { getClassicStats, saveClassicGameResult, onStorageChange } from './storage.js';
import { initNumberToggle, showToast, setupModalListeners, openModal, closeModal } from './ui.js';

let secretCode = [];
let currentGuess = [];
let currentRow = 0;
let gameActive = true;

// Data URI PNGs for high-contrast, dark-mode-resistant feedback pegs
const WHITE_PEG_PNG = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=")';
const BLACK_PEG_PNG = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")';

export function initClassicMode() {
    // Setup Modal Listeners
    setupModalListeners();

    // Initialize Number Visibility Toggle
    initNumberToggle('numberToggle');

    // Setup Auth UI
    setupAuthUI({
        loginBtn: document.getElementById('login-btn'),
        loginDropdown: document.getElementById('login-dropdown'),
        googleLoginBtn: document.getElementById('google-login-btn'),
        logoutBtn: document.getElementById('logout-btn'),
        userInfoBtn: document.getElementById('user-info'),
        userDisplayNameEl: document.getElementById('user-display-name'),
        userAvatarEl: document.getElementById('user-avatar'),
        identityDropdown: document.getElementById('identity-dropdown'),
        identityList: document.getElementById('identity-list')
    });

    // Color buttons event listeners
    document.querySelectorAll('.button-cell').forEach((cell, index) => {
        cell.onclick = () => selectColor(index);
    });

    // Undo button
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) {
        undoBtn.onclick = () => undoColor();
    }

    // Reset button
    const resetBtn = document.querySelector('.reset-button');
    if (resetBtn) {
        resetBtn.onclick = () => initGame();
    }

    // Listen to storage changes to keep Scoreboard updated
    onStorageChange(({ classicStats }) => {
        updateScoreboard(classicStats);
    });

    // Start game
    initGame();
}

function initGame() {
    // Generate new random secret code
    secretCode = generateRandomCode();
    currentGuess = [];
    currentRow = 0;
    gameActive = true;

    // Reset Answer Row
    const answerRow = document.getElementById('answer-row');
    if (answerRow) {
        answerRow.querySelectorAll('.hole').forEach(h => {
            h.style.backgroundColor = "#d2d2dc";
            h.textContent = "";
        });
        const seqLabel = answerRow.querySelector('.sequence-label');
        if (seqLabel) seqLabel.textContent = '🧠 Correct Sequence';
    }

    // Clear and rebuild Game Board rows
    const holeBoard = document.getElementById('hole-board');
    while (holeBoard.children.length > 1) {
        holeBoard.removeChild(holeBoard.lastChild);
    }

    for (let i = 0; i < MAX_ROWS; i++) {
        createGameRow(i);
    }

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;

    enableColorButtons(true);
}

function createGameRow(rowIndex) {
    const row = document.createElement('div');
    row.className = 'game-row';

    // 4 Holes
    for (let i = 0; i < CODE_LENGTH; i++) {
        const hole = document.createElement('div');
        hole.className = 'hole';
        row.appendChild(hole);
    }

    // Check button
    const checkBtn = document.createElement('button');
    checkBtn.className = 'check-button';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    checkBtn.onclick = () => {
        checkGuess(rowIndex);
        checkBtn.disabled = true;
    };
    row.appendChild(checkBtn);

    // Feedback column
    const feedbackColumn = document.createElement('div');
    feedbackColumn.className = 'feedback-column';

    const feedback = document.createElement('div');
    feedback.className = 'feedback';
    for (let i = 0; i < CODE_LENGTH; i++) {
        const peg = document.createElement('div');
        peg.className = 'peg';
        feedback.appendChild(peg);
    }
    feedbackColumn.appendChild(feedback);
    row.appendChild(feedbackColumn);

    document.getElementById('hole-board').appendChild(row);
}

function selectColor(colorIndex) {
    if (!gameActive || currentGuess.length >= CODE_LENGTH) return;

    const colorObj = COLORS[colorIndex];
    currentGuess.push(colorObj.id);

    // Visual update in current row (rows render from bottom to top: index 1 + (MAX_ROWS - 1 - currentRow))
    const rowElements = document.getElementsByClassName('game-row');
    const currentRowElement = rowElements[1 + (MAX_ROWS - 1 - currentRow)];
    if (!currentRowElement) return;

    const holeIndex = currentGuess.length - 1;
    const holeEl = currentRowElement.children[holeIndex];
    holeEl.style.backgroundColor = colorObj.hex;
    holeEl.textContent = colorObj.label;

    // Enable undo
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = false;

    // Enable check button if row is full
    const checkBtn = currentRowElement.querySelector('.check-button');
    if (checkBtn) {
        checkBtn.disabled = currentGuess.length !== CODE_LENGTH;
    }
}

function undoColor() {
    if (!gameActive || currentGuess.length === 0) return;

    const rowElements = document.getElementsByClassName('game-row');
    const currentRowElement = rowElements[1 + (MAX_ROWS - 1 - currentRow)];
    if (!currentRowElement) return;

    const holeIndex = currentGuess.length - 1;
    const holeEl = currentRowElement.children[holeIndex];
    holeEl.style.backgroundColor = '#d2d2dc';
    holeEl.textContent = '';
    currentGuess.pop();

    const checkBtn = currentRowElement.querySelector('.check-button');
    if (checkBtn) checkBtn.disabled = true;

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = currentGuess.length === 0;
}

function checkGuess(rowIndex) {
    if (currentGuess.length !== CODE_LENGTH) return;

    const result = evaluateGuess(secretCode, currentGuess);
    const rowElements = document.getElementsByClassName('game-row');
    const currentRowElement = rowElements[1 + (MAX_ROWS - 1 - currentRow)];
    const pegs = currentRowElement.querySelector('.feedback').children;

    let pegIndex = 0;
    for (let i = 0; i < result.white; i++) {
        const peg = pegs[pegIndex++];
        peg.style.backgroundColor = 'white';
        peg.style.backgroundImage = WHITE_PEG_PNG;
        peg.style.backgroundSize = 'cover';
    }
    for (let i = 0; i < result.black; i++) {
        const peg = pegs[pegIndex++];
        peg.style.backgroundColor = 'black';
        peg.style.backgroundImage = BLACK_PEG_PNG;
        peg.style.backgroundSize = 'cover';
    }

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

    revealAnswer(true);
    await saveClassicGameResult(true);
    showToast("🎉 Congratulations! You cracked the code!");
}

async function gameLost() {
    gameActive = false;
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;
    enableColorButtons(false);

    revealAnswer(false);
    await saveClassicGameResult(false);
    showToast("Game Over! Better luck next time.");
}

function revealAnswer(isWin) {
    const answerRow = document.getElementById('answer-row');
    if (!answerRow) return;

    secretCode.forEach((colorId, index) => {
        const colorObj = COLORS.find(c => c.id === colorId);
        if (colorObj) {
            answerRow.children[index].style.backgroundColor = colorObj.hex;
            answerRow.children[index].textContent = colorObj.label;
        }
    });

    const label = answerRow.querySelector('.sequence-label');
    if (label) {
        label.textContent = isWin ? '🧠 Correct Sequence - You Win' : 'Correct Sequence - You Lose';
    }
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

function enableColorButtons(enabled) {
    document.querySelectorAll('.button-cell').forEach(cell => {
        cell.style.pointerEvents = enabled ? 'auto' : 'none';
        cell.style.opacity = enabled ? '1' : '0.7';
    });
}

// Auto-initialize when loaded as module
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClassicMode);
} else {
    initClassicMode();
}
