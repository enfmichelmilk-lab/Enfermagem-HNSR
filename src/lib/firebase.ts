/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  deleteDoc, 
  collection, 
  getDocs, 
  onSnapshot, 
  getDocFromServer
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Detect whether valid Firebase configuration has been supplied
export const isFirebaseConfigured = !!(firebaseConfig && firebaseConfig.apiKey);

let firebaseApp;
let firestoreDb: any = null;

if (isFirebaseConfigured) {
  try {
    firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    firestoreDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId || undefined);
    
    // Validate Connection to Firestore on startup as mandated by Firebase skill
    const testConnection = async () => {
      try {
        await getDocFromServer(doc(firestoreDb, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('client is offline')) {
          console.warn("Please check your Firebase configuration: Firestore client is offline.");
        }
      }
    };
    testConnection();
  } catch (err) {
    console.error("Failed to initialize Firebase:", err);
  }
}

export const db = firestoreDb;

// 1. Mandated Error Handling Implementation
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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errMsg = error instanceof Error ? error.message : String(error);
  const errInfo: FirestoreErrorInfo = {
    error: errMsg,
    authInfo: {
      userId: 'anonymous_hospital_client',
      email: 'unauthenticated_system_user',
      emailVerified: false,
      isAnonymous: true,
    },
    operationType,
    path
  };
  console.error('Firestore Error Detailed Payload:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// 2. Real-time Subscription Synchronizers with localStorage backups
export function subscribeCollection<T>(
  collectionName: string,
  onData: (data: T[]) => void,
  fallbackLocalStorageKey: string,
  initialMockData: T[]
): () => void {
  // If Firebase is not configured or fails, use localStorage client-side
  if (!db) {
    const cached = localStorage.getItem(fallbackLocalStorageKey);
    const localList = cached ? JSON.parse(cached) : initialMockData;
    onData(localList);
    
    // Provide a mock unsubscribe that does nothing can be used
    return () => {};
  }

  const colRef = collection(db, collectionName);
  
  const unsubscribe = onSnapshot(colRef, (snapshot) => {
    const list: any[] = [];
    snapshot.forEach((d) => {
      list.push({ ...d.data(), id: d.id });
    });
    
    // If the snapshot collected is empty, first seed it with our initial mock standard data
    if (list.length === 0 && initialMockData.length > 0) {
      console.log(`Seeding initial database content to Firestore for: ${collectionName}`);
      initialMockData.forEach(async (item: any) => {
        try {
          const docId = item.id || item.matricula || item.email;
          if (docId) {
            const cleanItem = JSON.parse(JSON.stringify(item));
            await setDoc(doc(db, collectionName, docId), cleanItem);
          }
        } catch (err) {
          console.error(`Error seeding ${collectionName}:`, err);
        }
      });
      onData(initialMockData);
      localStorage.setItem(fallbackLocalStorageKey, JSON.stringify(initialMockData));
    } else {
      onData(list);
      localStorage.setItem(fallbackLocalStorageKey, JSON.stringify(list));
    }
  }, (error) => {
    console.error(`[Firestore Subscription Error] on ${collectionName}:`, error);
    // Graceful fallback to localStorage
    const cached = localStorage.getItem(fallbackLocalStorageKey);
    const localList = cached ? JSON.parse(cached) : initialMockData;
    onData(localList);
  });

  return unsubscribe;
}

// 3. Document Writer Helpers
const getStorageKey = (colName: string) => {
  if (colName === 'dynamic_selos') return 'hnsr_dynamic_selos';
  return `hnsr_${colName}_db`;
};

export async function saveDocument(collectionName: string, docId: string, data: any): Promise<void> {
  const cleanId = String(docId).trim(); // Keep ID exactly as provided (e.g. emails with dots)
  if (!cleanId) {
    console.warn(`[Firebase] Action ignored: Attempted to save document in "${collectionName}" with an empty ID.`);
    return;
  }

  // Always update local storage for robust instant backup
  try {
    const backupKey = getStorageKey(collectionName);
    const cached = localStorage.getItem(backupKey);
    let items = cached ? JSON.parse(cached) : [];
    if (Array.isArray(items)) {
      const idx = items.findIndex((i: any) => (i.id === docId || i.matricula === docId || i.email === docId));
      if (idx > -1) {
        items[idx] = { ...items[idx], ...data };
      } else {
        items.push({ id: docId, ...data });
      }
      localStorage.setItem(backupKey, JSON.stringify(items));
    } else {
      // Map structures
      items[docId] = data;
      localStorage.setItem(backupKey, JSON.stringify(items));
    }
  } catch (err) {
    console.warn("Failed to write backup to localStorage:", err);
  }

  if (!db) return;

  try {
    const docRef = doc(db, collectionName, cleanId);
    // Remove undefined values recursively to prevent Firestore SDK from throwing errors
    const serializedData = JSON.parse(JSON.stringify(data));
    await setDoc(docRef, serializedData, { merge: true });
  } catch (error) {
    console.error(`[Firebase Write Error] Failed saving ${collectionName}/${cleanId}:`, error);
  }
}

export async function removeDocument(collectionName: string, docId: string): Promise<void> {
  const cleanId = String(docId).trim();
  if (!cleanId) {
    console.warn(`[Firebase] Action ignored: Attempted to remove document from "${collectionName}" with an empty ID.`);
    return;
  }

  // Always update local storage for robust instant backup
  try {
    const backupKey = getStorageKey(collectionName);
    const cached = localStorage.getItem(backupKey);
    let items = cached ? JSON.parse(cached) : [];
    if (Array.isArray(items)) {
      items = items.filter((i: any) => (i.id !== docId && i.matricula !== docId && i.email !== docId));
      localStorage.setItem(backupKey, JSON.stringify(items));
    } else {
      delete items[docId];
      localStorage.setItem(backupKey, JSON.stringify(items));
    }
  } catch (err) {
    console.warn("Failed to remove backup from localStorage:", err);
  }

  if (!db) return;

  try {
    const docRef = doc(db, collectionName, cleanId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error(`[Firebase Delete Error] Failed removing ${collectionName}/${cleanId}:`, error);
  }
}
