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

/**
 * Render the Developer Profile + Ko-fi widget container
 */
export function renderDeveloperFooter(containerId = 'developer-footer') {
    const container = document.getElementById(containerId);
    if (!container) return;

    let kofiHtml = '';
    if (window.kofiwidget2) {
        try {
            window.kofiwidget2.init('Support me on Ko-fi', '#72a4f2', 'I2I81CDN0L');
            kofiHtml = window.kofiwidget2.getHTML();
        } catch (e) {
            console.error('Ko-fi widget error:', e);
        }
    }

    if (!kofiHtml) {
        // High-res fallback matching the exact Ko-fi style
        kofiHtml = `
            <div class="btn-container">
                <a title="Support me on ko-fi.com" class="kofi-button" style="box-shadow: 1px 1px 0px rgba(0,0,0,0.2); line-height: 34px !important; min-width: 150px; display: inline-flex !important; align-items: center; justify-content: center; gap: 6px; background-color: #72a4f2; padding: 2px 12px !important; text-align: center !important; border-radius: 7px; color: #fff; cursor: pointer; text-decoration: none; font-family: 'Quicksand', -apple-system, sans-serif !important; font-weight: 700 !important; font-size: 14px !important; transition: opacity 0.2s;" href="https://ko-fi.com/I2I81CDN0L" target="_blank" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">
                    <img src="https://storage.ko-fi.com/cdn/cup-border.png" alt="Ko-fi donations" style="height: 15px !important; width: 22px !important; vertical-align: middle;" />
                    <span style="color: #fff !important; vertical-align: middle;">Support me on Ko-fi</span>
                </a>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 2px;">
            <span style="font-size: 0.85rem; color: #555;">Developed by <strong>Amit Joshi</strong></span>
            <a href="https://github.com/amitjoshi2724" target="_blank"
                style="color: #0366d6; text-decoration: none; font-size: 0.8rem;">GitHub: @amitjoshi2724</a>
        </div>
        <div id="kofi-widget-container" style="display: flex; align-items: center;">
            ${kofiHtml}
        </div>
    `;
}

/**
 * Render the Number Visibility Toggle switch HTML into a container
 */
export function renderNumberToggle(containerId = 'toggle-container') {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
        <span>Show Numbers:</span>
        <label class="switch">
            <input type="checkbox" id="numberToggle" checked>
            <span class="slider round"></span>
        </label>
    `;
    initNumberToggle('numberToggle');
}

