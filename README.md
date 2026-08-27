# 🧠 Mastermind & Mastermindle 📅

A web implementation of the classic Mastermind codebreaking board game, featuring both an **Unlimited Classic Mode** and a daily Wordle/Semantle-style challenge called **Mastermindle** with a complete past-puzzles archive.

🌐 **Live Game:** [https://amitjoshi2724.github.io/mastermind](https://amitjoshi2724.github.io/mastermind)  
📅 **Daily Mastermindle:** [https://amitjoshi2724.github.io/mastermind/mastermindle/](https://amitjoshi2724.github.io/mastermind/mastermindle/)

---

## 🎮 Game Modes

### 1. Classic Mastermind (`/index.html`)
- **Unlimited Play:** Generates a random 4-color code each round.
- **Rules:** 6 colors available (can be repeated). You have 10 attempts to crack the code.
- **Feedback Pegs:**
  - ⚪ **White Peg:** Correct color in the correct position.
  - ⚫ **Black Peg:** Correct color in the wrong position.
- **Scoreboard:** Tracks wins, win rate, and win streaks.

### 2. Mastermindle — Daily Puzzle Challenge (`/mastermindle/`)
- **Daily Global Puzzle:** Uses a deterministic pseudo-random number generator (PRNG) seeded by the date (`YYYY-MM-DD`). Everyone worldwide gets the exact same secret code on any given day.
- **📅 Semantle-Style Archive Modal:** Browse and play any past daily puzzle (by Date or Puzzle #). Filter by All, Solved, or Unplayed.
- **📊 Wordle-Style Statistics Modal:** Tracks games played, win %, current streak, max streak, and a guess distribution histogram (1 to 10 attempts).
- **📋 Share Result:** Generates and copies an emoji-grid summary to your clipboard.
- **⏳ Countdown Timer:** Real-time countdown to the next daily puzzle at midnight.

---

## 🏗️ Project Architecture

```
/
├── index.html                   # Classic Unlimited Mode
├── mastermindle.html            # Redirect alias for /mastermindle/
├── mastermindle/
│   └── index.html               # Daily Mastermindle & Archive UI
├── css/
│   └── modals.css               # Shared modal styles (Archive, Stats, How-To-Play, Auth)
├── js/
│   ├── firebase-config.js       # Firebase v10+ Modular initialization
│   ├── auth.js                  # Modular Authentication (Google Sign-In popup, Sign-Out, state listener)
│   ├── storage.js               # Dual-layer storage (localStorage + real-time Firestore sync)
│   ├── engine.js                # Core game engine: seeded PRNG, code evaluation, feedback pegs, share text
│   ├── ui.js                    # UI utilities: toast notifications, modals, countdown timer, number toggle
│   ├── classic.js               # Classic Mode game loop & controller
│   └── daily.js                 # Daily Mastermindle game loop & archive controller
├── firestore.rules              # Firestore security rules for user records & puzzle history
└── firebase.json                # Firebase configuration
```

---

## 🔐 Firebase Authentication & Cloud Sync

The app uses the **Firebase v10+ Modular SDK** via official ES Module CDN imports.

- **Offline-First:** Works 100% offline using `localStorage` for guests.
- **Cloud Sync:** When signed in with Google or GitHub, your Classic stats, Daily stats, win streaks, and solved daily archive history automatically sync in real-time to Cloud Firestore under your `uid`.

### ⚠️ Firebase Console Configuration Checklist
To ensure Google Authentication works on GitHub Pages and local development:
1. Open the [Firebase Console](https://console.firebase.google.com/) for project `mastermind-amitjoshi2724`.
2. Navigate to **Authentication > Settings > Authorized Domains**.
3. Add the following authorized domains:
   - `localhost`
   - `amitjoshi2724.github.io`

---

## ☕ Support

If you enjoy the game and want to support its development:  
👉 **[Support Amit on Ko-fi](https://ko-fi.com/amitjoshi2724)**
