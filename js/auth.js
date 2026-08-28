/**
 * Firebase Authentication Module
 * Handles Google Sign-In, Sign-Out, and Auth State subscriptions.
 */
import { auth, googleProvider } from './firebase-config.js';
import { 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const authListeners = new Set();
let currentAuthUser = null;
let isInitialized = false;

// Track Auth State changes
onAuthStateChanged(auth, (user) => {
    currentAuthUser = user;
    isInitialized = true;
    authListeners.forEach(listener => {
        try {
            listener(user);
        } catch (err) {
            console.error("Error in auth state listener:", err);
        }
    });
});

/**
 * Register a listener for authentication state changes.
 * @param {Function} callback - Called with (user | null)
 * @returns {Function} Unsubscribe function
 */
export function onAuthChange(callback) {
    authListeners.add(callback);
    if (isInitialized) {
        try {
            callback(currentAuthUser);
        } catch (err) {
            console.error("Error in immediate auth callback:", err);
        }
    }
    return () => authListeners.delete(callback);
}

/**
 * Get the currently logged-in user
 */
export function getCurrentUser() {
    return currentAuthUser || auth.currentUser;
}

/**
 * Get formatted user profile info
 */
export function getUserProfile(user = getCurrentUser()) {
    if (!user) return null;
    return {
        uid: user.uid,
        displayName: user.displayName || user.email?.split('@')[0] || 'Player',
        email: user.email || '',
        photoURL: user.photoURL || ''
    };
}

/**
 * Sign in with Google Popup
 */
export async function signInWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user;
    } catch (error) {
        handleAuthError(error);
        throw error;
    }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("Error signing out:", error);
        throw error;
    }
}

/**
 * Centralized Auth Error Handler
 */
function handleAuthError(error) {
    if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
        console.log("Google sign-in popup was closed by the user.");
        return;
    }
    
    if (error.code === 'auth/unauthorized-domain') {
        const hostname = window.location.hostname;
        const msg = `Firebase Auth Error: Domain "${hostname}" is not authorized.\n\n` +
            `To fix this:\n` +
            `1. Open Firebase Console (https://console.firebase.google.com)\n` +
            `2. Go to Authentication > Settings > Authorized Domains\n` +
            `3. Add "${hostname}" to the list.\n` +
            `(Also ensure "localhost" and "amitjoshi2724.github.io" are added).`;
        console.error(msg);
        alert(msg);
        return;
    }

    if (error.code === 'auth/popup-blocked') {
        alert("The sign-in popup was blocked by your browser. Please allow popups for this site and try again.");
        return;
    }

    console.error("Firebase Google Sign-In Error:", error.code, error.message);
    alert(`Sign-in failed: ${error.message}`);
}

/**
 * Centralized Auth Container Template
 */
const AUTH_CONTAINER_HTML = `
    <div id="user-info">
        <img id="user-avatar" src="" alt="Avatar">
        <span id="user-display-name"></span>
        <span style="font-size: 0.8em; margin-left: 5px; flex-shrink: 0;">▼</span>
        <div id="identity-dropdown">
            <div style="font-weight: bold; margin-bottom: 8px; border-bottom: 1px solid black; padding-bottom: 5px; white-space: nowrap;">Current Account</div>
            <div id="identity-list" class="identity-email" style="white-space: nowrap;"></div>
        </div>
    </div>
    <div id="login-wrapper">
        <button id="login-btn">Sign in</button>
        <div id="login-dropdown">
            <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 12px; color: #333; text-align: center;">Sign in with</div>
            <button id="google-login-btn" class="sso-btn google-btn">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
                <span>Google</span>
            </button>
        </div>
    </div>
    <button id="logout-btn">Sign Out</button>
`;

/**
 * Initializes and binds UI authentication controls.
 * If container is empty, automatically injects the standard Auth markup.
 */
export function setupAuthUI(containerId = 'auth-container') {
    const container = typeof containerId === 'string' ? document.getElementById(containerId) : null;
    if (container && container.children.length === 0) {
        container.innerHTML = AUTH_CONTAINER_HTML;
    }

    const loginBtn = document.getElementById('login-btn');
    const loginDropdown = document.getElementById('login-dropdown');
    const googleLoginBtn = document.getElementById('google-login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfoBtn = document.getElementById('user-info');
    const userDisplayNameEl = document.getElementById('user-display-name');
    const userAvatarEl = document.getElementById('user-avatar');
    const identityDropdown = document.getElementById('identity-dropdown');
    const identityList = document.getElementById('identity-list');

    // Toggle Login Dropdown
    if (loginBtn && loginDropdown) {
        loginBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (identityDropdown) identityDropdown.classList.remove('active');
            loginDropdown.classList.toggle('active');
        });
    }

    // Google Login button inside dropdown
    if (googleLoginBtn) {
        googleLoginBtn.addEventListener('click', async () => {
            if (loginDropdown) loginDropdown.classList.remove('active');
            try {
                await signInWithGoogle();
            } catch (e) {
                // Handled in auth module
            }
        });
    }

    // Toggle user identity dropdown
    if (userInfoBtn && identityDropdown) {
        userInfoBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (loginDropdown) loginDropdown.classList.remove('active');
            identityDropdown.classList.toggle('active');
        });
    }

    // Sign out button
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            if (identityDropdown) identityDropdown.classList.remove('active');
            try {
                await signOutUser();
            } catch (e) {
                console.error("Sign out error:", e);
            }
        });
    }

    // Click outside to close dropdowns
    document.addEventListener('click', (e) => {
        if (loginDropdown && loginDropdown.classList.contains('active')) {
            if (!loginDropdown.contains(e.target) && (!loginBtn || !loginBtn.contains(e.target))) {
                loginDropdown.classList.remove('active');
            }
        }
        if (identityDropdown && identityDropdown.classList.contains('active')) {
            if (!identityDropdown.contains(e.target) && (!userInfoBtn || !userInfoBtn.contains(e.target))) {
                identityDropdown.classList.remove('active');
            }
        }
    });

    // Update UI on Auth State Change
    onAuthChange((user) => {
        if (user) {
            const profile = getUserProfile(user);
            if (loginBtn) loginBtn.style.display = 'none';
            if (loginDropdown) loginDropdown.classList.remove('active');
            if (logoutBtn) logoutBtn.style.display = 'inline-flex';
            if (userInfoBtn) userInfoBtn.style.display = 'inline-flex';
            if (userDisplayNameEl) userDisplayNameEl.textContent = profile.displayName;
            if (userAvatarEl) {
                if (profile.photoURL) {
                    userAvatarEl.src = profile.photoURL;
                    userAvatarEl.style.display = 'inline-block';
                } else {
                    userAvatarEl.style.display = 'none';
                }
            }
            if (identityList) {
                identityList.innerHTML = `<div class="identity-item"><strong>Google:</strong> <span>${profile.email || profile.displayName}</span></div>`;
            }
        } else {
            if (loginBtn) loginBtn.style.display = 'inline-flex';
            if (logoutBtn) logoutBtn.style.display = 'none';
            if (userInfoBtn) userInfoBtn.style.display = 'none';
            if (identityDropdown) identityDropdown.classList.remove('active');
        }
    });
}

