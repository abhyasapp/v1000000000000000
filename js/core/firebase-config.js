/* ═══════════════════════════════════════════════════════════════════════
   FIREBASE-CONFIG.JS — Firebase Cloud Messaging credentials.

   Loaded by user.html (early, before app.js) and by sw.js via
   importScripts(). Defines three globals that both files read:

     FIREBASE_CONFIG      — the standard Firebase web app config object
     FIREBASE_VAPID_KEY   — Web Push certificate public key (FCM uses
                            this to identify the app to the browser)
     FIREBASE_CONFIGURED  — sentinel boolean; false until real values
                            are pasted in below

   How to fill this in:
     1. Firebase console → Project settings → General → "Your apps"
        → Web app → "SDK setup and configuration" → Config. Copy the
        values into FIREBASE_CONFIG below.
     2. Firebase console → Project settings → Cloud Messaging →
        "Web Push certificates" → Generate key pair (if not already
        done). Copy the public key into FIREBASE_VAPID_KEY.
     3. Set FIREBASE_CONFIGURED = true.

   What's a "public" credential?
     Everything in this file ships to the browser, so none of it is a
     secret in the traditional sense. The apiKey + VAPID key are safe
     to commit to a public repo — Google designed them that way, and
     the Firebase security model relies on Firestore/Storage rules
     rather than these values being hidden. Still, the rules on your
     Firebase project should be locked down regardless of who can see
     this file.

   While FIREBASE_CONFIGURED is false:
     • app.js's PUSH.supported() returns false → the "Enable
       Notifications" button in Progress is hidden and the status text
       reads "not set up for this deployment yet".
     • sw.js's FCM import block is skipped entirely (the try/catch
       around the importScripts call short-circuits before touching
       Firebase).
     • Nothing breaks. Push is simply disabled.
   ═══════════════════════════════════════════════════════════════════════ */

/* ── Firebase web app config ──
   Every value below is a placeholder. Replace each one with the
   corresponding value from the Firebase console. If you leave any
   placeholder in place AND flip FIREBASE_CONFIGURED to true, the
   Firebase SDK will throw on initializeApp() — which is exactly why
   the sentinel exists. */
const FIREBASE_CONFIG = {
  apiKey:            "REPLACE_WITH_FIREBASE_API_KEY",
  authDomain:        "REPLACE_WITH_PROJECT_ID.firebaseapp.com",
  projectId:         "REPLACE_WITH_PROJECT_ID",
  storageBucket:     "REPLACE_WITH_PROJECT_ID.appspot.com",
  messagingSenderId: "REPLACE_WITH_SENDER_ID",
  appId:             "REPLACE_WITH_APP_ID",
  measurementId:     "REPLACE_WITH_MEASUREMENT_ID"   // optional; only used by Analytics
};

/* ── Web Push VAPID public key ──
   Used by getToken({ vapidKey }) in app.js's PUSH.enable() and
   PUSH.silentRefresh(). Without this, the browser refuses to issue an
   FCM token. From Firebase console → Cloud Messaging → Web Push
   certificates. */
const FIREBASE_VAPID_KEY = "REPLACE_WITH_VAPID_PUBLIC_KEY";

/* ── Sentinel ──
   Flipped to true only when every placeholder above has been replaced.
   Both loaders (app.js and sw.js) read this to decide whether to even
   attempt Firebase initialization. Kept as an explicit constant rather
   than a runtime check of the config values so a typo in one field
   can't accidentally enable a half-configured SDK. */
const FIREBASE_CONFIGURED = false;

/* ── Sanity check (defensive) ──
   If someone sets FIREBASE_CONFIGURED = true but forgets to replace a
   placeholder, fail loudly in the console rather than letting the SDK
   throw an opaque error later. Doesn't throw — just warns — so the
   rest of the page still boots and every other feature works. */
(function () {
  if (!FIREBASE_CONFIGURED) return;
  const stillPlaceholder = [];
  if (FIREBASE_CONFIG.apiKey.startsWith("REPLACE_WITH_")) stillPlaceholder.push("apiKey");
  if (FIREBASE_CONFIG.projectId.startsWith("REPLACE_WITH_")) stillPlaceholder.push("projectId");
  if (FIREBASE_CONFIG.messagingSenderId.startsWith("REPLACE_WITH_")) stillPlaceholder.push("messagingSenderId");
  if (FIREBASE_CONFIG.appId.startsWith("REPLACE_WITH_")) stillPlaceholder.push("appId");
  if (FIREBASE_VAPID_KEY.startsWith("REPLACE_WITH_")) stillPlaceholder.push("FIREBASE_VAPID_KEY");
  if (stillPlaceholder.length) {
    console.warn(
      "[firebase-config.js] FIREBASE_CONFIGURED is true, but these values are still placeholders: " +
      stillPlaceholder.join(", ") +
      ". Push notifications will fail until they're replaced. Set FIREBASE_CONFIGURED = false to silence this warning."
    );
  }
})();