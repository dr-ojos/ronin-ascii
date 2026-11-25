// The Firebase project the accounts live in (account.ts). Firebase console → Project settings → General →
// "Your apps" → the web app's `firebaseConfig`. These values are not secret: they only name the project, and
// the Firestore rules (firestore.rules) are what keep each ronin's save to its owner.
// While apiKey is empty the game runs without accounts, saving only in the browser.
export const firebaseConfig = {
  apiKey: 'AIzaSyAq5PFkhdVvDfHLYrdxzwN8pWUbdkBylyc',
  authDomain: 'ronin-ascii.firebaseapp.com',
  projectId: 'ronin-ascii',
  storageBucket: 'ronin-ascii.firebasestorage.app',
  messagingSenderId: '1097813750264',
  appId: '1:1097813750264:web:3225e07372ba3e7b2c260d'
};
/** for now accounts are off on local servers (npm run dev, vite preview): the title screen goes straight to the
 *  warriors and Firebase is never loaded. Set it to false to try accounts locally. */
const LOCAL_WITHOUT_ACCOUNTS = true;
const local = import.meta.env.DEV || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const cloudEnabled = () => !!firebaseConfig.apiKey && !!firebaseConfig.projectId && !(LOCAL_WITHOUT_ACCOUNTS && local);
