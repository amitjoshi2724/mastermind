/**
 * Mastermindle Daily Puzzle & Archive Mode Controller
 *
 * All board DOM logic lives in board.js — this file only handles
 * Daily-specific concerns: date routing, archive/calendar, stats modal,
 * in-progress persistence, and cloud restore.
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
    renderNumberToggle,
    showToast,
    setupModalListeners,
    openModal,
    closeModal,
    getTimeUntilMidnightString
} from './ui.js';
import {
    resetBoard,
    resetAnswerRow,
    renderColorButtons,
    renderRowGuess,
    renderRowFeedback,
    revealAnswer,
    enableColorButtons,
    applyColorToRow,
    clearLastColorFromRow
} from './board.js';

// ---------------------------------------------------------------------------
// Module-level state
// ---------------------------------------------------------------------------

let activeDateStr = getTodayDateStr();
let activePuzzleNumber = getPuzzleNumber(activeDateStr);
let secretCode = [];
let currentGuess = [];
let currentRow = 0;
let guessHistory = [];
let feedbackHistory = [];
let gameActive = true;
let isCompleted = false;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------

export function initDailyMode() {
    setupModalListeners();
    renderNumberToggle('toggle-container');
    setupAuthUI('auth-container');
    renderColorButtons('color-buttons', selectColor);

    // Parse optional URL params (?date=YYYY-MM-DD or ?puzzle=N)
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

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.onclick = () => undoColor();


    // Nav-bar modal buttons
    const archiveBtn = document.getElementById('open-archive-btn');
    if (archiveBtn) archiveBtn.onclick = () => openArchiveModal();

    const statsBtn = document.getElementById('open-stats-btn');
    if (statsBtn) statsBtn.onclick = () => openStatsModal();

    const helpBtn = document.getElementById('open-help-btn');
    if (helpBtn) helpBtn.onclick = () => openModal('help-modal');

    // Share button inside stats modal
    const shareBtn = document.getElementById('share-score-btn');
    if (shareBtn) shareBtn.onclick = () => copyShareText();

    // Archive search & filters
    const searchInput = document.getElementById('archive-search');
    if (searchInput) searchInput.oninput = () => renderArchiveList(searchInput.value);

    document.querySelectorAll('.archive-filter-btn').forEach(btn => {
        btn.onclick = () => {
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

    // Live countdown timer
    startCountdownTimer();

    // React to storage changes (local saves + Firestore cloud sync).
    // Only reload the board when the active date's result actually changes —
    // prevents unnecessary wipes when stats/calendar-only data updates arrive.
    let lastKnownResultKey = null;
    onStorageChange(({ dailyHistory }) => {
        updateStatsModalContent();
        renderArchiveList();
        renderCalendarView();

        const result = dailyHistory && dailyHistory[activeDateStr];
        const resultKey = result ? (result.completedAt + '_' + result.attempts) : 'none';
        if (resultKey !== lastKnownResultKey) {
            lastKnownResultKey = resultKey;
            loadDailyPuzzle(activeDateStr);
        }
    });

    // Initial board load
    loadDailyPuzzle(activeDateStr);
}

// ---------------------------------------------------------------------------
// Puzzle loading & restoration
// ---------------------------------------------------------------------------

export function loadDailyPuzzle(dateStr) {
    activeDateStr = dateStr;
    activePuzzleNumber = getPuzzleNumber(dateStr);
    updatePuzzleHeader();

    secretCode = generateDailyCode(dateStr);
    currentGuess = [];
    guessHistory = [];
    feedbackHistory = [];
    currentRow = 0;
    gameActive = true;
    isCompleted = false;

    resetAnswerRow();
    resetBoard(checkGuess);

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;

    // Restore previously completed game
    const existingResult = getDailyPuzzleResult(dateStr);
    if (existingResult) {
        restoreCompletedGame(existingResult);
        return;
    }

    // Restore in-progress game
    const inProgress = getDailyInProgress(dateStr);
    if (inProgress && inProgress.guesses && inProgress.guesses.length > 0) {
        restoreInProgressGame(inProgress);
    } else {
        enableColorButtons(true);
    }
}

function restoreCompletedGame(result) {
    gameActive = false;
    isCompleted = true;
    guessHistory = result.guesses || [];
    feedbackHistory = result.feedbackHistory || [];
    currentRow = guessHistory.length;

    enableColorButtons(false);
    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = true;

    guessHistory.forEach((guess, rowIdx) => {
        renderRowGuess(rowIdx, guess);
        const fb = feedbackHistory[rowIdx];
        if (fb) renderRowFeedback(rowIdx, fb);
    });

    revealAnswer(secretCode, result.won);

    setTimeout(() => openStatsModal(), 400);
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

// ---------------------------------------------------------------------------
// Game input: select colour, undo, check guess
// ---------------------------------------------------------------------------

function selectColor(colorIndex) {
    if (!gameActive || isCompleted || currentGuess.length >= CODE_LENGTH) return;

    const colorObj = COLORS[colorIndex];
    currentGuess.push(colorObj.id);

    applyColorToRow(currentRow, currentGuess.length, colorObj);

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = false;
}

function undoColor() {
    if (!gameActive || isCompleted || currentGuess.length === 0) return;

    const prevLength = currentGuess.length;
    currentGuess.pop();

    clearLastColorFromRow(currentRow, prevLength - 1);

    const undoBtn = document.getElementById('undo-button');
    if (undoBtn) undoBtn.disabled = currentGuess.length === 0;
}

async function checkGuess(rowIndex) {
    if (currentGuess.length !== CODE_LENGTH) return;

    const result = evaluateGuess(secretCode, currentGuess);
    guessHistory.push([...currentGuess]);
    feedbackHistory.push({ white: result.white, black: result.black });

    renderRowFeedback(currentRow, { white: result.white, black: result.black });

    // Persist in-progress state so a page refresh restores the board
    saveDailyInProgress(activeDateStr, { guesses: guessHistory, feedbackHistory });

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

    revealAnswer(secretCode, isWin);

    await saveDailyGameResult({
        dateStr: activeDateStr,
        puzzleNumber: activePuzzleNumber,
        won: isWin,
        attempts: guessHistory.length,
        guesses: guessHistory,
        feedbackHistory
    });

    showToast(isWin
        ? "🎉 Brilliant! You solved today's Mastermindle!"
        : 'Game Over! Try again in the archive or tomorrow!');

    setTimeout(() => openStatsModal(), 600);
}

async function handleRetryDailyPuzzle() {
    const existingResult = getDailyPuzzleResult(activeDateStr);
    const inProg = getDailyInProgress(activeDateStr);
    const hasActivity =
        existingResult ||
        (inProg && inProg.guesses && inProg.guesses.length > 0) ||
        guessHistory.length > 0;

    if (!hasActivity) {
        showToast('Puzzle is already fresh!');
        return;
    }

    if (!confirm(
        `Reset Mastermindle #${activePuzzleNumber} (${activeDateStr})?\n\n` +
        'This will clear your previous attempt so you can try again with a clean board!'
    )) return;

    await resetDailyGameResult(activeDateStr);
    closeModal('stats-modal');
    loadDailyPuzzle(activeDateStr);
    renderCalendarView();
    renderArchiveList();
    showToast('🔄 Puzzle reset! Good luck on your new attempt!');
}

// ---------------------------------------------------------------------------
// Puzzle header
// ---------------------------------------------------------------------------

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
        titleEl.textContent =
            `📅 Mastermindle #${activePuzzleNumber} (${formattedDate})${isToday ? ' — Today' : ''}`;
    }
}

// ---------------------------------------------------------------------------
// Stats Modal
// ---------------------------------------------------------------------------

export function openStatsModal() {
    updateStatsModalContent();
    openModal('stats-modal');
}

function updateStatsModalContent() {
    const stats = getDailyStats();

    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    set('stat-played', stats.played);
    set('stat-win-pct', stats.played > 0 ? Math.round((stats.won / stats.played) * 100) : 0);
    set('stat-streak', stats.currentStreak);
    set('stat-max-streak', stats.maxStreak);

    // Guess distribution bars
    const distContainer = document.getElementById('guess-distribution-bars');
    if (distContainer) {
        let maxCount = 1;
        for (let i = 1; i <= 10; i++) {
            if ((stats.guessDistribution[i] || 0) > maxCount) maxCount = stats.guessDistribution[i];
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

    // Share preview section
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
        showToast('Complete the puzzle first to share your score!');
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
        navigator.clipboard.writeText(shareText)
            .then(() => showToast('📋 Copied score to clipboard!'))
            .catch(() => prompt('Copy your share score:', shareText));
    } else {
        prompt('Copy your share score:', shareText);
    }
}

// ---------------------------------------------------------------------------
// Archive Modal: Calendar + List views
// ---------------------------------------------------------------------------

const todayObj = parseDate(getTodayDateStr());
let calYear = todayObj.getFullYear();
let calMonth = todayObj.getMonth(); // 0-based

export function openArchiveModal() {
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

    if (monthSelect) monthSelect.value = String(calMonth);
    if (yearSelect) yearSelect.value = String(calYear);

    // Disable Next when already at today's month
    if (nextBtn) {
        const isCurrentOrFuture =
            calYear > todayDate.getFullYear() ||
            (calYear === todayDate.getFullYear() && calMonth >= todayDate.getMonth());
        nextBtn.disabled = isCurrentOrFuture;
    }
    if (prevBtn) {
        prevBtn.disabled = calYear <= 2000 && calMonth <= 0;
    }

    const firstDayIndex = new Date(calYear, calMonth, 1).getDay(); // 0 = Sunday
    const totalDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

    const history = getDailyHistory();
    const cellsHtml = [];
    const TOTAL_SLOTS = 42; // Always 6 weeks → stable layout regardless of month length

    // Leading empty cells
    for (let i = 0; i < firstDayIndex; i++) {
        cellsHtml.push('<div class="calendar-day-cell is-empty"></div>');
    }

    // Day cells
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
            statusClass = result.won ? 'status-won' : 'status-lost';
            statusTag = result.won ? `⭐ ${result.attempts}` : '❌';
        } else if (inProg && inProg.guesses && inProg.guesses.length > 0) {
            statusClass = 'status-in-progress';
            statusTag = `⏳ ${inProg.guesses.length}`;
        }

        cellsHtml.push(`
            <div class="calendar-day-cell ${statusClass} ${isToday ? 'is-today' : ''}"
                 data-date="${dateStr}" title="Puzzle #${pNum} — ${dateStr}">
                <div class="cal-day-num">${day}</div>
                <div class="cal-puzzle-num">#${pNum}</div>
                <div class="cal-status-tag">${statusTag}</div>
            </div>
        `);
    }

    // Trailing empty cells (always pad to 42)
    const filled = firstDayIndex + totalDaysInMonth;
    for (let i = filled; i < TOTAL_SLOTS; i++) {
        cellsHtml.push('<div class="calendar-day-cell is-empty"></div>');
    }

    daysContainer.innerHTML = cellsHtml.join('');

    // Click → load puzzle
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

    for (let pNum = todayNum; pNum >= 1; pNum--) {
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

        // Search filter
        if (searchFilter) {
            const query = searchFilter.toLowerCase();
            if (!dateStr.includes(query) && !String(pNum).includes(query)) continue;
        }

        // Category filter
        if (filterMode === 'solved' && status !== 'won') continue;
        if (filterMode === 'unplayed' && status !== 'unplayed' && status !== 'in-progress') continue;

        items.push({ puzzleNumber: pNum, dateStr, isToday: dateStr === todayStr, status, statusLabel, badgeClass });
    }

    if (items.length === 0) {
        listEl.innerHTML = '<div style="text-align:center; padding: 20px; color: #666;">No puzzles match your filter.</div>';
        return;
    }

    listEl.innerHTML = items.map(item => {
        const dateFormatted = parseDate(item.dateStr).toLocaleDateString(undefined, {
            month: 'short', day: 'numeric', year: 'numeric'
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

    // Populate Year dropdown
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
        yearSelect.onchange = e => { calYear = Number(e.target.value); renderCalendarView(); };
    }

    if (monthSelect) {
        monthSelect.value = String(calMonth);
        monthSelect.onchange = e => { calMonth = Number(e.target.value); renderCalendarView(); };
    }

    // Month nav buttons
    const prevBtn = document.getElementById('cal-prev-month-btn');
    const nextBtn = document.getElementById('cal-next-month-btn');
    const todayBtn = document.getElementById('cal-today-btn');

    if (prevBtn) {
        prevBtn.onclick = () => {
            calMonth--;
            if (calMonth < 0) { calMonth = 11; calYear--; }
            renderCalendarView();
        };
    }
    if (nextBtn) {
        nextBtn.onclick = () => {
            calMonth++;
            if (calMonth > 11) { calMonth = 0; calYear++; }
            renderCalendarView();
        };
    }
    if (todayBtn) {
        todayBtn.onclick = () => {
            const t = parseDate(getTodayDateStr());
            calYear = t.getFullYear();
            calMonth = t.getMonth();
            renderCalendarView();
        };
    }
}

// ---------------------------------------------------------------------------
// Countdown Timer
// ---------------------------------------------------------------------------

function startCountdownTimer() {
    function updateTimer() {
        const timerEl = document.getElementById('daily-countdown-timer');
        if (timerEl) timerEl.textContent = getTimeUntilMidnightString();
    }
    updateTimer();
    setInterval(updateTimer, 1000);
}

// ---------------------------------------------------------------------------
// Auto-initialize
// ---------------------------------------------------------------------------

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setupArchiveViewTabs();
        initDailyMode();
    });
} else {
    setupArchiveViewTabs();
    initDailyMode();
}
