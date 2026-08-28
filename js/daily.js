/**
 * Mastermindle Daily Puzzle & Archive Mode Controller
 */
import { 
    COLORS, 
    MAX_ROWS, 
    CODE_LENGTH, 
    generateDailyCode, 
    evaluateGuess, 
    getPuzzleNumber, 
    getDateForPuzzleNumber, 
    formatDate, 
    parseDate, 
    getTodayDateStr, 
    generateShareText 
} from './engine.js';
import { setupAuthUI } from './auth.js';
import { 
    getDailyStats, 
    getDailyHistory, 
    getDailyPuzzleResult, 
    saveDailyGameResult, 
    resetDailyGameResult,
    getDailyInProgress, 
    saveDailyInProgress, 
    onStorageChange 
} from './storage.js';
import { 
    initNumberToggle, 
    showToast, 
    setupModalListeners, 
    openModal, 
    closeModal, 
    getTimeUntilMidnightString 
} from './ui.js';

// State for active puzzle
let activeDateStr = getTodayDateStr();
let activePuzzleNumber = getPuzzleNumber(activeDateStr);
let secretCode = [];
let currentGuess = [];
let currentRow = 0;
let guessHistory = [];
let feedbackHistory = [];
let gameActive = true;
let isCompleted = false;

// High-contrast PNG data URIs
const WHITE_PEG_PNG = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=")';
const BLACK_PEG_PNG = 'url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")';

export function initDailyMode() {
    setupModalListeners();
    initNumberToggle('numberToggle');

    // Parse URL parameter if user navigated to a specific date or puzzle number
    const params = new URLSearchParams(window.location.search);
    const dateParam = params.get('date');
    const puzzleParam = params.get('puzzle');

    if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        activeDateStr = dateParam;
        activePuzzleNumber = getPuzzleNumber(dateParam);
    } else if (puzzleParam && !isNaN(parseInt(puzzleParam))) {
        activePuzzleNumber = Math.max(1, parseInt(puzzleParam));
        activeDateStr = getDateForPuzzleNumber(activePuzzleNumber);
    } else {
        activeDateStr = getTodayDateStr();
        activePuzzleNumber = getPuzzleNumber(activeDateStr);
    }

    // Auth UI
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

    // Button event listeners
    document.querySelectorAll('.button-cell').forEach((cell, index) => {
        cell.onclick = () => selectColor(index);
    });

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.onclick = () => undoColor();

    // Nav Bar modal buttons
    const archiveBtn = document.getElementById('open-archive-btn');
    if (archiveBtn) archiveBtn.onclick = () => openArchiveModal();

    const statsBtn = document.getElementById('open-stats-btn');
    if (statsBtn) statsBtn.onclick = () => openStatsModal();

    const helpBtn = document.getElementById('open-help-btn');
    if (helpBtn) helpBtn.onclick = () => openModal('help-modal');

    // Share button in stats modal
    const shareBtn = document.getElementById('share-score-btn');
    if (shareBtn) shareBtn.onclick = () => copyShareText();

    // Archive search & filters
    const searchInput = document.getElementById('archive-search');
    if (searchInput) searchInput.oninput = () => renderArchiveList(searchInput.value);

    document.querySelectorAll('.archive-filter-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelectorAll('.archive-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderArchiveList(searchInput ? searchInput.value : '');
        };
    });

    // Retry / Reset buttons
    const dailyRetryBtn = document.getElementById('daily-retry-btn');
    if (dailyRetryBtn) dailyRetryBtn.onclick = () => handleRetryDailyPuzzle();

    const statsRetryBtn = document.getElementById('stats-retry-btn');
    if (statsRetryBtn) statsRetryBtn.onclick = () => handleRetryDailyPuzzle();

    // Start live countdown timer
    startCountdownTimer();

    // Storage & Auth change listener
    let lastKnownResultKey = null;
    onStorageChange(({ dailyHistory }) => {
        updateStatsModalContent();
        renderArchiveList();
        renderCalendarView();

        // Only reload the board if the completion status of the active date changed
        // (e.g. Firestore just delivered a solved result we didn't have locally)
        const result = dailyHistory && dailyHistory[activeDateStr];
        const resultKey = result ? (result.completedAt + '_' + result.attempts) : 'none';
        if (resultKey !== lastKnownResultKey) {
            lastKnownResultKey = resultKey;
            loadDailyPuzzle(activeDateStr);
        }
    });

    // Initial load active puzzle
    loadDailyPuzzle(activeDateStr);
}

async function handleRetryDailyPuzzle() {
    const existingResult = getDailyPuzzleResult(activeDateStr);
    const inProg = getDailyInProgress(activeDateStr);
    const hasActivity = existingResult || (inProg && inProg.guesses && inProg.guesses.length > 0) || guessHistory.length > 0;

    if (!hasActivity) {
        showToast("Puzzle is already fresh!");
        return;
    }

    if (!confirm(`Reset Mastermindle #${activePuzzleNumber} (${activeDateStr})?\n\nThis will clear your previous attempt so you can try again with a clean board!`)) {
        return;
    }

    await resetDailyGameResult(activeDateStr);
    closeModal('stats-modal');
    loadDailyPuzzle(activeDateStr);
    renderCalendarView();
    renderArchiveList();
    showToast("🔄 Puzzle reset! Good luck on your new attempt!");
}

function updatePuzzleHeader() {
    const titleEl = document.getElementById('daily-puzzle-title');
    const todayStr = getTodayDateStr();
    const isToday = activeDateStr === todayStr;

    if (titleEl) {
        const formattedDate = parseDate(activeDateStr).toLocaleDateString(undefined, { 
            month: 'short', 
            day: 'numeric', 
            year: 'numeric' 
        });
        titleEl.textContent = `📅 Mastermindle #${activePuzzleNumber} (${formattedDate})${isToday ? ' — Today' : ''}`;
    }
}

export function loadDailyPuzzle(dateStr) {
    activeDateStr = dateStr;
    activePuzzleNumber = getPuzzleNumber(dateStr);
    updatePuzzleHeader();

    // Generate deterministic secret code
    secretCode = generateDailyCode(dateStr);
    currentGuess = [];
    guessHistory = [];
    feedbackHistory = [];
    currentRow = 0;
    gameActive = true;
    isCompleted = false;

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

    // Rebuild 10 game rows
    const holeBoard = document.getElementById('hole-board');
    while (holeBoard.children.length > 1) {
        holeBoard.removeChild(holeBoard.lastChild);
    }
    for (let i = 0; i < MAX_ROWS; i++) {
        createGameRow(i);
    }

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;

    // Check if previously completed
    const existingResult = getDailyPuzzleResult(dateStr);
    if (existingResult) {
        restoreCompletedGame(existingResult);
        return;
    }

    // Check if in-progress state exists
    const inProgress = getDailyInProgress(dateStr);
    if (inProgress && inProgress.guesses && inProgress.guesses.length > 0) {
        restoreInProgressGame(inProgress);
    } else {
        enableColorButtons(true);
    }
}

function createGameRow(rowIndex) {
    const row = document.createElement('div');
    row.className = 'game-row';

    for (let i = 0; i < CODE_LENGTH; i++) {
        const hole = document.createElement('div');
        hole.className = 'hole';
        row.appendChild(hole);
    }

    const checkBtn = document.createElement('button');
    checkBtn.className = 'check-button';
    checkBtn.textContent = 'Check';
    checkBtn.disabled = true;
    checkBtn.onclick = () => {
        checkGuess(rowIndex);
        checkBtn.disabled = true;
    };
    row.appendChild(checkBtn);

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

function restoreCompletedGame(result) {
    gameActive = false;
    isCompleted = true;
    guessHistory = result.guesses || [];
    feedbackHistory = result.feedbackHistory || [];
    currentRow = guessHistory.length;

    console.log('[Restore] restoreCompletedGame called:', {
        guessCount: guessHistory.length,
        firstGuess: guessHistory[0],
        firstGuessType: guessHistory[0] ? typeof guessHistory[0][0] : 'n/a',
        won: result.won,
        attempts: result.attempts
    });

    enableColorButtons(false);
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;

    // Fill each completed row on the board
    guessHistory.forEach((guess, rowIdx) => {
        renderRowGuess(rowIdx, guess);
        const fb = feedbackHistory[rowIdx];
        if (fb) renderRowFeedback(rowIdx, fb);
    });

    // Reveal answer
    revealAnswer(result.won);

    // Open completion stats modal after slight delay
    setTimeout(() => {
        openStatsModal();
    }, 400);
}

function restoreInProgressGame(inProgress) {
    guessHistory = inProgress.guesses || [];
    feedbackHistory = inProgress.feedbackHistory || [];
    currentRow = guessHistory.length;

    guessHistory.forEach((guess, rowIdx) => {
        renderRowGuess(rowIdx, guess);
        const fb = feedbackHistory[rowIdx];
        if (fb) renderRowFeedback(rowIdx, fb);
    });

    enableColorButtons(true);
}

function renderRowGuess(rowIdx, guess) {
    const rowElements = document.getElementsByClassName('game-row');
    const targetIndex = 1 + (MAX_ROWS - 1 - rowIdx);
    const rowEl = rowElements[targetIndex];
    console.log(`[Restore] renderRowGuess rowIdx=${rowIdx} targetIndex=${targetIndex} totalGameRows=${rowElements.length} rowEl=${rowEl ? 'found' : 'MISSING'} guess=`, guess);
    if (!rowEl) return;

    guess.forEach((colorId, colIdx) => {
        const colorObj = COLORS.find(c => c.id === colorId);
        console.log(`  col=${colIdx} colorId=${colorId} type=${typeof colorId} colorObj=`, colorObj ? colorObj.name : 'NOT FOUND');
        if (colorObj) {
            rowEl.children[colIdx].style.backgroundColor = colorObj.hex;
            rowEl.children[colIdx].textContent = colorObj.label;
        }
    });

    const checkBtn = rowEl.querySelector('.check-button');
    if (checkBtn) checkBtn.disabled = true;
}

function renderRowFeedback(rowIdx, fb) {
    const rowElements = document.getElementsByClassName('game-row');
    const rowEl = rowElements[1 + (MAX_ROWS - 1 - rowIdx)];
    if (!rowEl) return;

    const pegs = rowEl.querySelector('.feedback').children;
    let pegIndex = 0;
    for (let i = 0; i < fb.white; i++) {
        const peg = pegs[pegIndex++];
        peg.style.backgroundColor = 'white';
        peg.style.backgroundImage = WHITE_PEG_PNG;
        peg.style.backgroundSize = 'cover';
    }
    for (let i = 0; i < fb.black; i++) {
        const peg = pegs[pegIndex++];
        peg.style.backgroundColor = 'black';
        peg.style.backgroundImage = BLACK_PEG_PNG;
        peg.style.backgroundSize = 'cover';
    }
}

function selectColor(colorIndex) {
    if (!gameActive || isCompleted || currentGuess.length >= CODE_LENGTH) return;

    const colorObj = COLORS[colorIndex];
    currentGuess.push(colorObj.id);

    const rowElements = document.getElementsByClassName('game-row');
    const currentRowElement = rowElements[1 + (MAX_ROWS - 1 - currentRow)];
    if (!currentRowElement) return;

    const holeIndex = currentGuess.length - 1;
    const holeEl = currentRowElement.children[holeIndex];
    holeEl.style.backgroundColor = colorObj.hex;
    holeEl.textContent = colorObj.label;

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = false;

    const checkBtn = currentRowElement.querySelector('.check-button');
    if (checkBtn) {
        checkBtn.disabled = currentGuess.length !== CODE_LENGTH;
    }
}

function undoColor() {
    if (!gameActive || isCompleted || currentGuess.length === 0) return;

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

async function checkGuess(rowIndex) {
    if (currentGuess.length !== CODE_LENGTH) return;

    const result = evaluateGuess(secretCode, currentGuess);
    guessHistory.push([...currentGuess]);
    feedbackHistory.push({ white: result.white, black: result.black });

    renderRowFeedback(currentRow, { white: result.white, black: result.black });

    // Save in progress state
    saveDailyInProgress(activeDateStr, {
        guesses: guessHistory,
        feedbackHistory
    });

    if (result.isWin) {
        await handleGameComplete(true);
    } else if (currentRow === MAX_ROWS - 1) {
        await handleGameComplete(false);
    } else {
        currentRow++;
        currentGuess = [];
        const undoBtn = document.getElementById('undo-button');
        if (undoBtn) undoBtn.disabled = true;
    }
}

async function handleGameComplete(isWin) {
    gameActive = false;
    isCompleted = true;
    enableColorButtons(false);
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;

    revealAnswer(isWin);

    await saveDailyGameResult({
        dateStr: activeDateStr,
        puzzleNumber: activePuzzleNumber,
        won: isWin,
        attempts: guessHistory.length,
        guesses: guessHistory,
        feedbackHistory
    });

    if (isWin) {
        showToast("🎉 Brilliant! You solved today's Mastermindle!");
    } else {
        showToast("Game Over! Try again in the archive or tomorrow!");
    }

    setTimeout(() => {
        openStatsModal();
    }, 600);
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

function enableColorButtons(enabled) {
    document.querySelectorAll('.button-cell').forEach(cell => {
        cell.style.pointerEvents = enabled ? 'auto' : 'none';
        cell.style.opacity = enabled ? '1' : '0.7';
    });
}

// --- Modals Logic ---

export function openStatsModal() {
    updateStatsModalContent();
    openModal('stats-modal');
}

function updateStatsModalContent() {
    const stats = getDailyStats();
    const playedEl = document.getElementById('stat-played');
    const winPctEl = document.getElementById('stat-win-pct');
    const streakEl = document.getElementById('stat-streak');
    const maxStreakEl = document.getElementById('stat-max-streak');

    if (playedEl) playedEl.textContent = stats.played;
    if (winPctEl) winPctEl.textContent = stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0;
    if (streakEl) streakEl.textContent = stats.currentStreak;
    if (maxStreakEl) maxStreakEl.textContent = stats.maxStreak;

    // Guess distribution
    const distContainer = document.getElementById('guess-distribution-bars');
    if (distContainer) {
        let maxCount = 1;
        for (let i = 1; i <= 10; i++) {
            if ((stats.guessDistribution[i] || 0) > maxCount) {
                maxCount = stats.guessDistribution[i];
            }
        }

        distContainer.innerHTML = '';
        for (let i = 1; i <= 10; i++) {
            const count = stats.guessDistribution[i] || 0;
            const pct = Math.max(7, Math.round((count / maxCount) * 100));

            const row = document.createElement('div');
            row.className = 'dist-row';
            row.innerHTML = `
                <div class="dist-num">${i}</div>
                <div class="dist-bar-container">
                    <div class="dist-bar ${count === 0 ? 'zero' : ''}" style="width: ${pct}%;">${count}</div>
                </div>
            `;
            distContainer.appendChild(row);
        }
    }

    // Share Preview & Button visibility
    const previewSection = document.getElementById('share-preview-section');
    const previewBox = document.getElementById('share-preview-box');
    const activeResult = getDailyPuzzleResult(activeDateStr);

    if (activeResult && previewSection && previewBox) {
        const shareText = generateShareText(
            activePuzzleNumber,
            activeDateStr,
            activeResult.attempts,
            MAX_ROWS,
            activeResult.feedbackHistory,
            activeResult.won
        );
        previewBox.textContent = shareText;
        previewSection.style.display = 'block';
    } else if (previewSection) {
        previewSection.style.display = 'none';
    }
}

function copyShareText() {
    const activeResult = getDailyPuzzleResult(activeDateStr);
    if (!activeResult) {
        showToast("Complete the puzzle first to share your score!");
        return;
    }

    const shareText = generateShareText(
        activePuzzleNumber,
        activeDateStr,
        activeResult.attempts,
        MAX_ROWS,
        activeResult.feedbackHistory,
        activeResult.won
    );

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(shareText).then(() => {
            showToast("📋 Copied score to clipboard!");
        }).catch(() => {
            prompt("Copy your share score:", shareText);
        });
    } else {
        prompt("Copy your share score:", shareText);
    }
}

// --- Calendar & Archive Logic ---

const todayObj = parseDate(getTodayDateStr());
let calYear = todayObj.getFullYear();
let calMonth = todayObj.getMonth(); // 0-11

export function openArchiveModal() {
    // Reset calendar to active puzzle's month or today
    const activeObj = parseDate(activeDateStr);
    calYear = activeObj.getFullYear();
    calMonth = activeObj.getMonth();

    renderCalendarView();
    renderArchiveList();
    openModal('archive-modal');
}

function renderCalendarView() {
    const daysContainer = document.getElementById('calendar-days-container');
    const monthSelect = document.getElementById('cal-month-select');
    const yearSelect = document.getElementById('cal-year-select');
    const prevBtn = document.getElementById('cal-prev-month-btn');
    const nextBtn = document.getElementById('cal-next-month-btn');

    if (!daysContainer) return;

    const todayStr = getTodayDateStr();
    const todayDate = parseDate(todayStr);

    // Sync select dropdowns
    if (monthSelect) monthSelect.value = String(calMonth);
    if (yearSelect) yearSelect.value = String(calYear);

    // Prev / Next button state
    if (nextBtn) {
        const isCurrentOrFutureMonth = calYear > todayDate.getFullYear() || 
            (calYear === todayDate.getFullYear() && calMonth >= todayDate.getMonth());
        nextBtn.disabled = isCurrentOrFutureMonth;
    }
    if (prevBtn) {
        const isMinYear = calYear <= 2000 && calMonth <= 0;
        prevBtn.disabled = isMinYear;
    }

    // Days in Month calculation using native Gregorian rules
    const firstDayIndex = new Date(calYear, calMonth, 1).getDay(); // 0 = Sun
    const totalDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    const history = getDailyHistory();
    const cellsHtml = [];
    const TOTAL_SLOTS = 42; // Always 6 weeks (42 slots) for rock-solid layout stability

    // 1. Empty leading slots
    for (let i = 0; i < firstDayIndex; i++) {
        cellsHtml.push('<div class="calendar-day-cell is-empty"></div>');
    }

    // 2. Day cells for current month
    for (let day = 1; day <= totalDaysInMonth; day++) {
        const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const isFuture = dateStr > todayStr;
        const isToday = dateStr === todayStr;

        if (isFuture) {
            cellsHtml.push(`
                <div class="calendar-day-cell is-future">
                    <div class="cal-day-num">${day}</div>
                </div>
            `);
            continue;
        }

        const pNum = getPuzzleNumber(dateStr);
        const result = history[dateStr];
        const inProg = getDailyInProgress(dateStr);

        let statusClass = 'status-unplayed';
        let statusTag = '⚪';

        if (result) {
            if (result.won) {
                statusClass = 'status-won';
                statusTag = `⭐ ${result.attempts}`;
            } else {
                statusClass = 'status-lost';
                statusTag = '❌';
            }
        } else if (inProg && inProg.guesses && inProg.guesses.length > 0) {
            statusClass = 'status-in-progress';
            statusTag = `⏳ ${inProg.guesses.length}`;
        }

        cellsHtml.push(`
            <div class="calendar-day-cell ${statusClass} ${isToday ? 'is-today' : ''}" data-date="${dateStr}" title="Puzzle #${pNum} — ${dateStr}">
                <div class="cal-day-num">${day}</div>
                <div class="cal-puzzle-num">#${pNum}</div>
                <div class="cal-status-tag">${statusTag}</div>
            </div>
        `);
    }

    // 3. Trailing empty slots to always complete 42 cells (avoids height changes on rapid clicking)
    const filledCount = firstDayIndex + totalDaysInMonth;
    for (let i = filledCount; i < TOTAL_SLOTS; i++) {
        cellsHtml.push('<div class="calendar-day-cell is-empty"></div>');
    }

    daysContainer.innerHTML = cellsHtml.join('');

    // Attach click listeners to load clicked puzzle
    daysContainer.querySelectorAll('.calendar-day-cell:not(.is-empty):not(.is-future)').forEach(el => {
        el.onclick = () => {
            const selectedDate = el.dataset.date;
            closeModal('archive-modal');
            
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('date', selectedDate);
            window.history.pushState({}, '', newUrl);

            loadDailyPuzzle(selectedDate);
        };
    });
}

function renderArchiveList(searchFilter = '') {
    const listEl = document.getElementById('archive-list-container');
    if (!listEl) return;

    const history = getDailyHistory();
    const todayStr = getTodayDateStr();
    const todayNum = getPuzzleNumber(todayStr);

    const activeFilterBtn = document.querySelector('.archive-filter-btn.active');
    const filterMode = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';

    const items = [];
    const minPuzzle = 1;

    // Full history all the way to Puzzle #1
    for (let pNum = todayNum; pNum >= minPuzzle; pNum--) {
        const dateStr = getDateForPuzzleNumber(pNum);
        const result = history[dateStr];
        const inProg = getDailyInProgress(dateStr);

        let status = 'unplayed';
        let statusLabel = '⚪ Unplayed';
        let badgeClass = 'badge-unplayed';

        if (result) {
            if (result.won) {
                status = 'won';
                statusLabel = `⭐ Solved (${result.attempts}/10)`;
                badgeClass = 'badge-won';
            } else {
                status = 'lost';
                statusLabel = '❌ Failed';
                badgeClass = 'badge-lost';
            }
        } else if (inProg && inProg.guesses && inProg.guesses.length > 0) {
            status = 'in-progress';
            statusLabel = `⏳ ${inProg.guesses.length}/10`;
            badgeClass = 'badge-in-progress';
        }

        // Apply search filter
        if (searchFilter) {
            const query = searchFilter.toLowerCase();
            if (!dateStr.includes(query) && !String(pNum).includes(query)) {
                continue;
            }
        }

        // Apply category filter
        if (filterMode === 'solved' && status !== 'won') continue;
        if (filterMode === 'unplayed' && status !== 'unplayed' && status !== 'in-progress') continue;

        items.push({
            puzzleNumber: pNum,
            dateStr,
            isToday: dateStr === todayStr,
            status,
            statusLabel,
            badgeClass
        });
    }

    if (items.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: #666;">No puzzles match your filter.</div>';
        return;
    }

    listEl.innerHTML = items.map(item => {
        const dateFormatted = parseDate(item.dateStr).toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });

        return `
            <div class="archive-item ${item.isToday ? 'today' : ''}" data-date="${item.dateStr}">
                <div class="archive-info">
                    <div class="archive-puzzle-num">Mastermindle #${item.puzzleNumber}${item.isToday ? ' (Today)' : ''}</div>
                    <div class="archive-date">${dateFormatted} (${item.dateStr})</div>
                </div>
                <div class="archive-status-badge ${item.badgeClass}">${item.statusLabel}</div>
            </div>
        `;
    }).join('');

    // Attach click listeners to load clicked puzzle
    listEl.querySelectorAll('.archive-item').forEach(el => {
        el.onclick = () => {
            const selectedDate = el.dataset.date;
            closeModal('archive-modal');
            
            const newUrl = new URL(window.location);
            newUrl.searchParams.set('date', selectedDate);
            window.history.pushState({}, '', newUrl);

            loadDailyPuzzle(selectedDate);
        };
    });
}

function setupArchiveViewTabs() {
    const calTab = document.getElementById('archive-tab-calendar');
    const listTab = document.getElementById('archive-tab-list');
    const calView = document.getElementById('archive-calendar-view');
    const listView = document.getElementById('archive-list-view');

    if (calTab && listTab && calView && listView) {
        calTab.onclick = () => {
            calTab.classList.add('active');
            listTab.classList.remove('active');
            calView.style.display = 'block';
            listView.style.display = 'none';
            renderCalendarView();
        };

        listTab.onclick = () => {
            listTab.classList.add('active');
            calTab.classList.remove('active');
            listView.style.display = 'block';
            calView.style.display = 'none';
            renderArchiveList();
        };
    }

    // Populate Year Dropdown (e.g. from 2000 to currentYear)
    const yearSelect = document.getElementById('cal-year-select');
    const monthSelect = document.getElementById('cal-month-select');
    const todayYear = todayObj.getFullYear();

    if (yearSelect) {
        yearSelect.innerHTML = '';
        for (let y = todayYear; y >= 2000; y--) {
            const opt = document.createElement('option');
            opt.value = String(y);
            opt.textContent = String(y);
            yearSelect.appendChild(opt);
        }
        yearSelect.value = String(calYear);

        yearSelect.onchange = (e) => {
            calYear = Number(e.target.value);
            renderCalendarView();
        };
    }

    if (monthSelect) {
        monthSelect.value = String(calMonth);
        monthSelect.onchange = (e) => {
            calMonth = Number(e.target.value);
            renderCalendarView();
        };
    }

    // Calendar month nav buttons
    const prevBtn = document.getElementById('cal-prev-month-btn');
    const nextBtn = document.getElementById('cal-next-month-btn');
    const todayBtn = document.getElementById('cal-today-btn');

    if (prevBtn) {
        prevBtn.onclick = () => {
            calMonth--;
            if (calMonth < 0) {
                calMonth = 11;
                calYear--;
            }
            renderCalendarView();
        };
    }

    if (nextBtn) {
        nextBtn.onclick = () => {
            calMonth++;
            if (calMonth > 11) {
                calMonth = 0;
                calYear++;
            }
            renderCalendarView();
        };
    }

    if (todayBtn) {
        todayBtn.onclick = () => {
            const tObj = parseDate(getTodayDateStr());
            calYear = tObj.getFullYear();
            calMonth = tObj.getMonth();
            renderCalendarView();
        };
    }
}

function startCountdownTimer() {
    function updateTimer() {
        const timerEl = document.getElementById('daily-countdown-timer');
        if (timerEl) {
            timerEl.textContent = getTimeUntilMidnightString();
        }
    }
    updateTimer();
    setInterval(updateTimer, 1000);
}

// Auto-initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupArchiveViewTabs();
        initDailyMode();
    });
} else {
    setupArchiveViewTabs();
    initDailyMode();
}
