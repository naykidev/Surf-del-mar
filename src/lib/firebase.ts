/**
 * Firebase client for reading schedule and image overrides.
 * Set PUBLIC_FIREBASE_* in .env and Netlify for this to work.
 */
import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, getDocs, query, orderBy } from 'firebase/firestore';
import type { SiteConfigDoc } from './site-config-types';

const firebaseConfig = {
  apiKey: import.meta.env.PUBLIC_FIREBASE_API_KEY,
  authDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.PUBLIC_FIREBASE_STORAGE_BUCKET,
  appId: import.meta.env.PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp {
  if (getApps().length === 0) return initializeApp(firebaseConfig);
  return getApp();
}

/** New schedule format: flat events with audit fields */
export interface ScheduleEvent {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  venue: string;
  category: string;
  description?: string;
  advocacy?: boolean;
}

export interface ScheduleDoc {
  events: ScheduleEvent[];
  lastUpdated?: string;
  updatedBy?: string;
  version?: number;
}

/** Legacy format (day-based) for backward compatibility */
export type LegacySchedule = { day: string; events: { title: string; venue: string; time: string; advocacy?: boolean }[] }[];

export type GetScheduleResult = { events: ScheduleEvent[]; lastUpdated?: string; version?: number } | { legacy: LegacySchedule } | null;

export async function getSchedule(): Promise<GetScheduleResult> {
  if (!import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) return null;
  try {
    const db = getFirestore(getFirebaseApp());
    const snap = await getDoc(doc(db, 'content', 'schedule'));
    const data = snap.data();
    if (!data) return null;
    if (Array.isArray(data.events)) {
      return { events: data.events, lastUpdated: data.lastUpdated, version: data.version };
    }
    if (Array.isArray(data.data)) return { legacy: data.data };
    return null;
  } catch {
    return null;
  }
}

export async function getMaintenanceMode(): Promise<boolean> {
  if (!import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) return false;
  try {
    const db = getFirestore(getFirebaseApp());
    const snap = await getDoc(doc(db, 'content', 'maintenanceMode'));
    const data = snap.data();
    return !!(data?.enabled);
  } catch {
    return false;
  }
}

export async function getImageOverrides(): Promise<Record<string, string> | null> {
  if (!import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) return null;
  try {
    const db = getFirestore(getFirebaseApp());
    const snap = await getDoc(doc(db, 'content', 'imageOverrides'));
    const data = snap.data();
    return (data?.overrides as Record<string, string>) ?? null;
  } catch {
    return null;
  }
}

/** Site-wide config: backgrounds, dynamic blocks, CMS pages (content/siteConfig). */
export async function getSiteConfig(): Promise<SiteConfigDoc | null> {
  if (!import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) return null;
  try {
    const db = getFirestore(getFirebaseApp());
    const snap = await getDoc(doc(db, 'content', 'siteConfig'));
    if (!snap.exists()) return null;
    return snap.data() as SiteConfigDoc;
  } catch {
    return null;
  }
}

/** Editable page text overrides (key → string) for admin "edit any text" feature. */
export async function getEditableText(): Promise<Record<string, string> | null> {
  if (!import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) return null;
  try {
    const db = getFirestore(getFirebaseApp());
    const snap = await getDoc(doc(db, 'content', 'pageText'));
    const data = snap.data();
    return (data?.text as Record<string, string>) ?? null;
  } catch {
    return null;
  }
}

export interface SharedMemory {
  id: string;
  imageUrl: string;
  caption: string;
  name: string;
  submittedAt: { seconds: number } | null;
  likes: number;
  /** If false, hidden from public; missing or true = shown */
  approved?: boolean;
}

export interface MemoryComment {
  id: string;
  text: string;
  name: string;
  submittedAt: { seconds: number } | null;
}

export async function getMemoryComments(memoryId: string): Promise<MemoryComment[]> {
  if (!import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) return [];
  try {
    const db = getFirestore(getFirebaseApp());
    const col = collection(db, 'sharedMemories', memoryId, 'comments');
    const snap = await getDocs(query(col, orderBy('submittedAt', 'asc')));
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        id: d.id,
        text: String(data.text ?? ''),
        name: String(data.name ?? ''),
        submittedAt: data.submittedAt ?? null,
      };
    });
  } catch { return []; }
}

export type GetSharedMemoriesResult =
  | { ok: true; memories: SharedMemory[] }
  | { ok: false; error: string };

export async function getSharedMemories(): Promise<GetSharedMemoriesResult> {
  if (!import.meta.env.PUBLIC_FIREBASE_PROJECT_ID) {
    return { ok: false, error: 'Firebase not configured (missing PUBLIC_FIREBASE_PROJECT_ID)' };
  }
  try {
    const db = getFirestore(getFirebaseApp());
    const col = collection(db, 'sharedMemories');
    const snap = await getDocs(col);
    const list = snap.docs.map((d) => {
      const data = d.data();
      const submittedAt = data.submittedAt ?? null;
      return {
        id: d.id,
        imageUrl: String(data.imageUrl ?? ''),
        caption: String(data.caption ?? ''),
        name: String(data.name ?? ''),
        submittedAt,
        likes: Number(data.likes ?? 0),
        approved: data.approved === false ? false : true,
      };
    });
    list.sort((a, b) => {
      const sa = (a.submittedAt && typeof (a.submittedAt as { seconds?: number }).seconds === 'number') ? (a.submittedAt as { seconds: number }).seconds : 0;
      const sb = (b.submittedAt && typeof (b.submittedAt as { seconds?: number }).seconds === 'number') ? (b.submittedAt as { seconds: number }).seconds : 0;
      return sb - sa;
    });
    return { ok: true, memories: list };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('getSharedMemories failed:', e);
    return { ok: false, error: message };
  }
}
