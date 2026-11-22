import { initializeApp, getApps, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  type Auth,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  type Firestore,
} from 'firebase/firestore';
import { getStorage, type FirebaseStorage } from 'firebase/storage';
import firebaseAppletConfig from '../../firebase-applet-config.json';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

interface ResolvedFirebaseConfig extends FirebaseOptions {
  firestoreDatabaseId?: string;
}

export const resolvedFirebaseConfig: ResolvedFirebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey,
  authDomain: firebaseAppletConfig.authDomain,
  projectId: firebaseAppletConfig.projectId,
  storageBucket: firebaseAppletConfig.storageBucket,
  messagingSenderId: firebaseAppletConfig.messagingSenderId,
  appId: firebaseAppletConfig.appId,
  firestoreDatabaseId: firebaseAppletConfig.firestoreDatabaseId,
};

export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(resolvedFirebaseConfig) : getApps()[0];

export const firebaseApp: FirebaseApp = app;

export const auth: Auth = getAuth(app);
export const firebaseAuth: Auth = auth;

if (typeof window !== 'undefined' && typeof indexedDB !== 'undefined') {
  void setPersistence(auth, browserLocalPersistence).catch(() => {
    // Non-fatal in private browsing / headless test runners
  });
}

// Named database configured by firebase-applet-config.json (critical for production reads/writes)
export const firestore: Firestore = resolvedFirebaseConfig.firestoreDatabaseId
  ? getFirestore(app, resolvedFirebaseConfig.firestoreDatabaseId)
  : getFirestore(app);

export const firestoreDb: Firestore = firestore;

export const storage: FirebaseStorage = getStorage(app);

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentUser = auth.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      tenantId: currentUser?.tenantId,
      providerInfo:
        currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testFirestoreConnection(): Promise<{
  reachable: boolean;
  offline: boolean;
}> {
  try {
    await getDocFromServer(doc(firestore, 'test', 'connection'));
    return { reachable: true, offline: false };
  } catch (error) {
    if (error instanceof Error && error.message.toLowerCase().includes('the client is offline')) {
      console.error('Firestore client is offline. Verify Firebase configuration and network state.');
      return { reachable: false, offline: true };
    }
    // Permission denied or missing test doc still confirms server reachability
    return { reachable: true, offline: false };
  }
}
