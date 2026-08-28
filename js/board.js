/**
 * board.js — Shared Game Board Renderer
 *
 * Centralises every piece of DOM logic that is identical between
 * Classic Mode (classic.js) and Daily Mode (daily.js):
 *   • Building / resetting the 10-row hole board
 *   • Rendering a guess into a row
 *   • Rendering white/black feedback pegs into a row
 *   • Revealing the answer row
 *   • Enabling / disabling color-select buttons
 *   • Getting the DOM element for the current active row
 *
 * Both classic.js and daily.js import these helpers instead of
 * maintaining their own identical copies.
 */
import { COLORS, MAX_ROWS, CODE_LENGTH } from './engine.js';

// High-contrast data-URI PNGs for white and black feedback pegs.
// Using data URIs avoids external network requests and guarantees
// the peg colour is visible in both light and dark themes.
const WHITE_PEG = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=")';
const BLACK_PEG = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")';

// ---------------------------------------------------------------------------
// Board lifecycle
// ---------------------------------------------------------------------------

/**
 * Wipe all dynamic game rows and append MAX_ROWS fresh empty rows.
 * Leaves the answer-row (first child of hole-board) untouched.
 * @param {Function} onCheckGuess  Called with rowIndex when a Check button is pressed.
 */
export function resetBoard(onCheckGuess) {
    const holeBoard = document.getElementById('hole-board');
    if (!holeBoard) return;

    // Remove every child after the answer-row
    while (holeBoard.children.length > 1) {
        holeBoard.removeChild(holeBoard.lastChild);
    }

    for (let i = 0; i < MAX_ROWS; i++) {
        holeBoard.appendChild(createGameRow(i, onCheckGuess));
    }
}

/**
 * Reset the answer row to its blank "🧠 Correct Sequence" state.
 */
export function resetAnswerRow() {
    const answerRow = document.getElementById('answer-row');
    if (!answerRow) return;

    answerRow.querySelectorAll('.hole').forEach(h => {
        h.style.backgroundColor = '#d2d2dc';
        h.textContent = '';
    });

    const label = answerRow.querySelector('.sequence-label');
    if (label) label.textContent = '🧠 Correct Sequence';
}

// ---------------------------------------------------------------------------
// Internal row factory (not exported — call resetBoard instead)
// ---------------------------------------------------------------------------

function createGameRow(rowIndex, onCheckGuess) {
    const row = document.createElement('div');
    row.className = 'game-row';

    // 4 colour holes
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
        onCheckGuess(rowIndex);
        checkBtn.disabled = true;
    };
    row.appendChild(checkBtn);

    // Feedback column (4 pegs)
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

    return row;
}

// ---------------------------------------------------------------------------
// Row helpers
// ---------------------------------------------------------------------------

/**
 * Return the DOM element for the row at the given guess index.
 * Rows are displayed bottom-up: rowIdx=0 → bottommost game row.
 * @param {number} rowIdx  0-based guess index.
 * @returns {Element|null}
 */
export function getRowElement(rowIdx) {
    const holeBoard = document.getElementById('hole-board');
    if (!holeBoard) return null;
    // holeBoard.children[0] = answer-row
    // holeBoard.children[1] = topmost game row  (created first)
    // holeBoard.children[MAX_ROWS] = bottommost game row (created last)
    // For bottom-up display: rowIdx 0 → last child
    return holeBoard.children[MAX_ROWS - rowIdx] || null;
}

/**
 * Paint a completed guess into the correct board row.
 * @param {number}   rowIdx  0-based guess index.
 * @param {number[]} guess   Array of colour IDs (e.g. [1, 3, 6, 2]).
 */
export function renderRowGuess(rowIdx, guess) {
    const rowEl = getRowElement(rowIdx);
    if (!rowEl) return;

    guess.forEach((colorId, colIdx) => {
        const colorObj = COLORS.find(c => c.id === colorId);
        if (colorObj) {
            rowEl.children[colIdx].style.backgroundColor = colorObj.hex;
            rowEl.children[colIdx].textContent = colorObj.label;
        }
    });

    const checkBtn = rowEl.querySelector('.check-button');
    if (checkBtn) checkBtn.disabled = true;
}

/**
 * Paint white and black feedback pegs for a given row.
 * @param {number} rowIdx
 * @param {{ white: number, black: number }} fb
 */
export function renderRowFeedback(rowIdx, fb) {
    const rowEl = getRowElement(rowIdx);
    if (!rowEl) return;

    const pegs = rowEl.querySelector('.feedback')?.children;
    if (!pegs) return;

    let pegIndex = 0;
    for (let i = 0; i < fb.white; i++) {
        const peg = pegs[pegIndex++];
        if (!peg) break;
        peg.style.backgroundColor = 'white';
        peg.style.backgroundImage = WHITE_PEG;
        peg.style.backgroundSize = 'cover';
    }
    for (let i = 0; i < fb.black; i++) {
        const peg = pegs[pegIndex++];
        if (!peg) break;
        peg.style.backgroundColor = 'black';
        peg.style.backgroundImage = BLACK_PEG;
        peg.style.backgroundSize = 'cover';
    }
}

// ---------------------------------------------------------------------------
// Answer row reveal
// ---------------------------------------------------------------------------

/**
 * Reveal the secret code in the answer row and update its label.
 * @param {number[]} secretCode  Array of colour IDs.
 * @param {boolean}  isWin
 */
export function revealAnswer(secretCode, isWin) {
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

// ---------------------------------------------------------------------------
// Color-button lock / unlock
// ---------------------------------------------------------------------------

/**
 * Enable or disable the colour-picker buttons.
 * @param {boolean} enabled
 */
export function enableColorButtons(enabled) {
    document.querySelectorAll('.button-cell').forEach(cell => {
        cell.style.pointerEvents = enabled ? 'auto' : 'none';
        cell.style.opacity = enabled ? '1' : '0.7';
    });
}

// ---------------------------------------------------------------------------
// Colour selection / undo helpers
// ---------------------------------------------------------------------------

/**
 * Apply a colour selection to the current guess row in the DOM.
 * @param {number}   currentRow   0-based row index.
 * @param {number}   guessLength  Length of current partial guess AFTER push.
 * @param {Object}   colorObj     The COLORS entry that was selected.
 */
export function applyColorToRow(currentRow, guessLength, colorObj) {
    const rowEl = getRowElement(currentRow);
    if (!rowEl) return;

    const holeIndex = guessLength - 1;
    const holeEl = rowEl.children[holeIndex];
    if (holeEl) {
        holeEl.style.backgroundColor = colorObj.hex;
        holeEl.textContent = colorObj.label;
    }

    // Enable Check button only when the row is full
    const checkBtn = rowEl.querySelector('.check-button');
    if (checkBtn) checkBtn.disabled = guessLength !== CODE_LENGTH;
}

/**
 * Clear the last colour from the current guess row in the DOM.
 * @param {number} currentRow   0-based row index.
 * @param {number} guessLength  Length of current partial guess AFTER pop (i.e. the index to clear).
 */
export function clearLastColorFromRow(currentRow, guessLength) {
    const rowEl = getRowElement(currentRow);
    if (!rowEl) return;

    const holeEl = rowEl.children[guessLength];
    if (holeEl) {
        holeEl.style.backgroundColor = '#d2d2dc';
        holeEl.textContent = '';
    }

    const checkBtn = rowEl.querySelector('.check-button');
    if (checkBtn) checkBtn.disabled = true;
}
