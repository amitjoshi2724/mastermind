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
 * Binds UI authentication controls (Login button, dropdown, Google button, Logout button, User profile badge)
 */
export function setupAuthUI({
    loginBtn,
    loginDropdown,
    googleLoginBtn,
    logoutBtn,
    userInfoBtn,
    userDisplayNameEl,
    userAvatarEl,
    identityDropdown,
    identityList
}) {
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
