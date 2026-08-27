/**
 * Firebase Modular Configuration
 * Imports Firebase v10.12.0 SDK via official gstatic CDN ES modules.
 */
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDnI0nEq0Km3GGWQDTwWYa7kbPLID3pYzU",
    authDomain: "mastermind-amitjoshi2724.firebaseapp.com",
    projectId: "mastermind-amitjoshi2724",
    storageBucket: "mastermind-amitjoshi2724.firebasestorage.app",
    messagingSenderId: "790815043624",
    appId: "1:790815043624:web:66f0dc2d1d4dbda06bc51d",
    measurementId: "G-JQP8CHKRGR"
};

// Initialize Firebase App singleton
export const app = getApps().length > 0 ? getApp() : initializeApp(FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Authentication Provider: Google
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });
