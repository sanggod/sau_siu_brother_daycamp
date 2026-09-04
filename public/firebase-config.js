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
  apiKey: "",
  authDomain: "",
  databaseURL: "",          // e.g. https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
