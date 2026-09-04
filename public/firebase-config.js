// ── Firebase web config ────────────────────────────────────────────────────
// Firebase console → Project settings → Your apps → SDK setup and configuration.
// This is a client config, not a secret — it ships to every phone by design.
// Access is controlled by database.rules.json, not by hiding these values.
//
// You also need a Realtime Database created, with rules that allow read/write
// for the camp day (see database.rules.json in the repo root).
//
// Leave databaseURL empty and the game runs in LOCAL mode instead:
// all tabs/windows on ONE machine stay in sync, no network needed.

export default {
  apiKey: "AIzaSyD9LMtQDpVrPty6076pPrLRPF5Z1oKNPHE",
  authDomain: "sau-siu-brother-daycamp.firebaseapp.com",
  databaseURL: "https://sau-siu-brother-daycamp-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "sau-siu-brother-daycamp",
  storageBucket: "sau-siu-brother-daycamp.firebasestorage.app",
  messagingSenderId: "985405815836",
  appId: "1:985405815836:web:5e379e222e3bd1e0c7b3d9"
};
