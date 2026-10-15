import { redactSensitiveLog } from './utils/redaction';
import { initializeApp, getApps } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  User as FirebaseUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  onSnapshot,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App
const configuredKey = import.meta.env.VITE_FIREBASE_API_KEY;
const app = configuredKey ? (getApps()[0] || initializeApp({...firebaseConfig,apiKey:configuredKey})) : null;

// CRITICAL: getFirestore must pass firestoreDatabaseId as required by AI Studio
export const db = app ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : null;
export const auth = app ? getAuth(app) : null;
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Test connection on boot
export async function testFirestoreConnection() {
  if (!db) return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase Firestore: Please check your Firebase configuration or internet connection.');
    }
  }
}
testFirestoreConnection();

// Error handler conforming to FirestoreErrorInfo
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
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.error('Firestore Error: ', redactSensitiveLog(error));
  throw new Error(redactSensitiveLog(error));
}

// Google Sign-In with Popup
export async function signInWithGoogle() {
  if (!auth) throw new Error('Google Sign-In chưa được cấu hình. Vui lòng dùng đăng nhập email.');
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    // Sync to Firestore user profile
    await syncUserProfile(user);
    return user;
  } catch (error) {
    console.error('Google Sign-In Error:', redactSensitiveLog(error));
    throw error;
  }
}

// Sign Out
export async function logOutFirebase() {
  if (auth) await firebaseSignOut(auth);
}

// Sync user profile to Firestore
export async function syncUserProfile(user: FirebaseUser, extra?: { branch?: string; roleTitle?: string }) {
  if (!db || !user || !user.uid) return;
  const userRef = doc(db, 'users', user.uid);
  try {
    const existing = await getDoc(userRef);
    const data = {
      userId: user.uid,
      email: user.email || '',
      displayName: user.displayName || user.email?.split('@')[0] || 'Chuyên viên VeriFin',
      photoURL: user.photoURL || '',
      branch: extra?.branch || existing.data()?.branch || 'all',
      roleTitle: extra?.roleTitle || existing.data()?.roleTitle || 'Chuyên viên Tài Chính & Kế Toán',
      updatedAt: new Date().toISOString(),
      createdAt: existing.data()?.createdAt || new Date().toISOString(),
    };
    await setDoc(userRef, data, { merge: true });
    return data;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${user.uid}`);
  }
}

// Bank Account Config persistence in Firestore
export async function saveUserBankConfig(userId: string, config: any) {
  if (!db) return null;
  const docRef = doc(db, 'users', userId, 'settings', 'bankAccount');
  try {
    await setDoc(docRef, { ...config, updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}/settings/bankAccount`);
  }
}

export async function getUserBankConfig(userId: string) {
  if (!db) return null;
  const docRef = doc(db, 'users', userId, 'settings', 'bankAccount');
  try {
    const snap = await getDoc(docRef);
    return snap.exists() ? snap.data() : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${userId}/settings/bankAccount`);
  }
}

// Chat Session persistence in Firestore
export interface FirestoreChatSession {
  sessionId: string;
  title: string;
  role: 'credit_expert' | 'accounting_advisor' | 'quick_assistant';
  modelUsed: 'gemini-2.5-flash' | 'gemini-4-argon' | 'gemini-3.8-flash' | 'gemini-3.1-flash-lite';
  createdAt: string;
  updatedAt: string;
}

export interface FirestoreChatMessage {
  id?: string;
  role: 'user' | 'model';
  content: string;
  timestamp: string;
  modelUsed?: string;
}

export async function saveChatSession(userId: string, session: FirestoreChatSession) {
  if (!db) return;
  const sessionRef = doc(db, 'users', userId, 'chatSessions', session.sessionId);
  try {
    await setDoc(sessionRef, session, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}/chatSessions/${session.sessionId}`);
  }
}

export async function addChatMessage(userId: string, sessionId: string, message: FirestoreChatMessage) {
  if (!db) return;
  const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const msgRef = doc(db, 'users', userId, 'chatSessions', sessionId, 'messages', msgId);
  try {
    await setDoc(msgRef, message);
    // update parent session timestamp
    const sessionRef = doc(db, 'users', userId, 'chatSessions', sessionId);
    await setDoc(sessionRef, { updatedAt: new Date().toISOString() }, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${userId}/chatSessions/${sessionId}/messages/${msgId}`);
  }
}

export async function getChatSessions(userId: string): Promise<FirestoreChatSession[]> {
  if (!db) return [];
  const colRef = collection(db, 'users', userId, 'chatSessions');
  try {
    const snap = await getDocs(colRef);
    const sessions: FirestoreChatSession[] = [];
    snap.forEach((d) => sessions.push(d.data() as FirestoreChatSession));
    sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return sessions;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${userId}/chatSessions`);
    return [];
  }
}

export async function getSessionMessages(userId: string, sessionId: string): Promise<FirestoreChatMessage[]> {
  if (!db) return [];
  const colRef = collection(db, 'users', userId, 'chatSessions', sessionId, 'messages');
  try {
    const snap = await getDocs(colRef);
    const messages: FirestoreChatMessage[] = [];
    snap.forEach((d) => messages.push({ id: d.id, ...d.data() } as FirestoreChatMessage));
    messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return messages;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${userId}/chatSessions/${sessionId}/messages`);
    return [];
  }
}
