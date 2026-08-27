/**
 * UI Utilities: Modals, Toasts, Countdown Timer & Number Visibility
 */
import { getSettings, saveSettings } from './storage.js';

/**
 * Show a toast notification
 */
export function showToast(message, duration = 2500) {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
        background-color: #333;
        color: #fff;
        padding: 10px 20px;
        border-radius: 6px;
        font-family: Arial, sans-serif;
        font-size: 0.95rem;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        opacity: 0;
        transform: translateY(-10px);
        transition: all 0.25s ease;
        pointer-events: auto;
    `;
    container.appendChild(toast);

    // Fade in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });

    // Fade out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

/**
 * Open a modal by element ID
 */
export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        modal.setAttribute('aria-hidden', 'false');
    }
}

/**
 * Close a modal by element ID
 */
export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Setup modal close listeners (close buttons, backdrop click, Escape key)
 */
export function setupModalListeners() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        // Backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });

        // Close button
        const closeBtn = modal.querySelector('.modal-close-btn');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                closeModal(modal.id);
            });
        }
    });

    // Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(m => closeModal(m.id));
        }
    });
}

/**
 * Initialize Number Visibility Toggle
 */
export function initNumberToggle(toggleInputId = 'numberToggle') {
    const toggle = document.getElementById(toggleInputId);
    const settings = getSettings();

    function applyState(show) {
        if (show) {
            document.body.classList.remove('hide-numbers');
        } else {
            document.body.classList.add('hide-numbers');
        }
        if (toggle) toggle.checked = show;
    }

    applyState(settings.showNumbers !== false);

    if (toggle) {
        toggle.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            saveSettings({ showNumbers: isChecked });
            applyState(isChecked);
        });
    }
}

/**
 * Get formatted countdown time until the next local midnight
 */
export function getTimeUntilMidnightString() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);

    const diffMs = midnight.getTime() - now.getTime();
    if (diffMs <= 0) return '00:00:00';

    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
