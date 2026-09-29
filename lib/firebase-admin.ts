import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { requireEnv } from './env';

/** Firestore with admin rights. Server-only: the client never talks to Firestore directly. */
export function db() {
  const app =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: requireEnv('FIREBASE_PROJECT_ID'),
        clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
        // Env vars store the key's newlines as "\n".
        privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
      }),
    });
  return getFirestore(app);
}
