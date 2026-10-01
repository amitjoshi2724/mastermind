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

---

## 📲 Install as an App & Play Offline (Mac, iOS & Android)

**Mastermind** is built as a full **Progressive Web App (PWA)** powered by a dedicated **Service Worker (`sw.js`)** and Web App Manifest (`manifest.json`). 

Once installed to your desktop or smartphone:
- ✈️ **100% Offline Playable:** All game logic, codebreaking algorithms, color board assets, and stats management are pre-cached directly to persistent device storage via the **Cache Storage API**. You can play in Airplane Mode with zero Wi-Fi or cellular data anytime, anywhere.
- 🖥️ **Native Standalone Window:** Launches in its own dedicated window without browser address bars, URL fields, or tabs.
- 🔄 **Zero-Hassle Background Updates:** When you connect to Wi-Fi, the Service Worker automatically fetches and updates any new changes pushed to GitHub.

### 🍎 Mac (macOS Desktop App)

You can install **Mastermind** directly as a native macOS desktop application with its own dedicated window, Dock icon, and full offline support:

#### Method A: Safari (macOS Sonoma / Sequoia or newer)
1. Open **[https://amitjoshi2724.github.io/mastermind/](https://amitjoshi2724.github.io/mastermind/)** in **Safari**.
2. In the top menu bar, click **File** > **Add to Dock...** (or click the **Share** button in the Safari toolbar and select **Add to Dock**).
3. Name it **Mastermind** and click **Add**.
4. The game is saved to your `Applications` folder and pinned to your **macOS Dock**.
5. Launch it like any native Mac app—it runs in its own window without browser tabs or address bars, supports full mouse/touch controls, and is 100% playable offline!

#### Method B: Google Chrome, Brave, or Microsoft Edge
1. Open **[https://amitjoshi2724.github.io/mastermind/](https://amitjoshi2724.github.io/mastermind/)** in **Chrome**, **Brave**, or **Edge**.
2. Click the **Install Mastermind** icon in the right side of the address/URL bar (or go to **Settings (⋮)** > **Save and share** > **Install Mastermind...**).
3. Click **Install**.
4. The game opens in its own standalone desktop window and is added to your Mac's **Launchpad**, **Spotlight**, and `~/Applications/Chrome Apps` folder.

### 🍏 iPhone & iPad (iOS Safari)
1. Open **[https://amitjoshi2724.github.io/mastermind/](https://amitjoshi2724.github.io/mastermind/)** in **Safari**.
2. Tap the **Share** button at the bottom of the screen (the square with an arrow pointing upward).
3. Scroll down the share sheet and tap **"Add to Home Screen"**.
4. Tap **Add** in the top-right corner. A dedicated Mastermind icon will appear on your home screen.
5. Tap the new icon once while online to let the Service Worker cache all assets—after that, it is permanently playable offline!

### 🤖 Android (Google Chrome)
1. Open **[https://amitjoshi2724.github.io/mastermind/](https://amitjoshi2724.github.io/mastermind/)** in **Google Chrome**.
2. Tap the **three-dots menu (⋮)** in the top-right corner.
3. Tap **"Install app"** (or **"Add to Home screen"**).
4. Tap **Install** on the prompt. The game will install directly to your home screen and app drawer as an offline-ready arcade app.

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
│   ├── board.js                 # Shared board renderer: row creation, peg rendering, colour selection DOM
│   ├── ui.js                    # UI utilities: toast notifications, modals, countdown timer, number toggle
│   ├── classic.js               # Classic Mode game loop & controller
│   └── daily.js                 # Daily Mastermindle game loop & archive controller
├── firestore.rules              # Firestore security rules for user records & puzzle history
└── firebase.json                # Firebase configuration
```

---

## ☕ Java Version (Original)

The original implementation of this game was built as a **Java Applet / Swing application**.

The Java source files are included in the repository root:

| File | Description |
| :--- | :--- |
| `Program.java` | Application entry point |
| `Applet16.java` | Java Applet wrapper |
| `UpToYou.java` | Core game logic |
| `Panel16.java` | Main game panel (Swing) |
| `HoleBoard16.java` | The peg hole board component |
| `ButtonBoard16.java` | Colour selection button board |
| `Scoreboard16.java` | Win/loss scoreboard |
| `AmitButton.java` | Custom styled button component |
| `AmitLabel.java` | Custom styled label |
| `mastermindApplication.jar` | Runnable JAR (application) |
| `mastermindApplet.jar` | Runnable JAR (applet) |

To run the Java version locally:
```bash
java -jar mastermindApplication.jar
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
