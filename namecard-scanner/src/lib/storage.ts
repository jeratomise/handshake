import type { CtaId, SenderProfile, Tone } from './draft';
import { guessCountryIso } from './countries';

const PROFILE_KEY = 'handshake.profile.v1';
const LOG_KEY = 'handshake.log.v1';
const SOURCE_BAR_KEY = 'handshake.sourcebar.v1';

export interface LogEntry {
  id: string;
  name: string;
  company: string;
  phone: string;
  context: string;
  sentAt: number;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as object) } as T;
  } catch {
    // Private browsing, disabled storage or corrupt JSON — never fatal.
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Storage is a convenience here, not a requirement. */
  }
}

/**
 * The company this deployment is for.
 *
 * Everyone using this build introduces themselves as AMD Inc., so pre-filling
 * it removes a field from the only screen standing between a new BDE and their
 * first scan. It is a default, not a constant: the setup sheet still edits it,
 * and a saved profile always wins over this — including a deliberately blank
 * one, since `readJson` merges the stored value over the fallback.
 */
const DEFAULT_COMPANY = 'AMD Inc.';

export function defaultProfile(): SenderProfile {
  return {
    name: '',
    company: DEFAULT_COMPANY,
    role: '',
    defaultCountry: guessCountryIso(typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language]),
    defaultTone: 'warm' as Tone,
    defaultCta: 'none' as CtaId,
  };
}

export function loadProfile(): SenderProfile {
  return readJson<SenderProfile>(PROFILE_KEY, defaultProfile());
}

export function saveProfile(profile: SenderProfile): void {
  writeJson(PROFILE_KEY, profile);
}

export function profileIsComplete(profile: SenderProfile): boolean {
  return profile.name.trim().length > 0;
}

/**
 * Whether the "open source" bar at the top has been closed.
 *
 * Dismissal is permanent from the user's point of view: it survives reloads and
 * new sessions, and only comes back if they clear the site's data. A banner
 * that reappears every visit is an ad, and this one is a pointer to the
 * documentation.
 *
 * Read defensively — a browser with storage blocked should show the bar rather
 * than throw on the first render.
 */
export function sourceBarDismissed(): boolean {
  try {
    return localStorage.getItem(SOURCE_BAR_KEY) === 'dismissed';
  } catch {
    return false;
  }
}

export function dismissSourceBar(): void {
  try {
    localStorage.setItem(SOURCE_BAR_KEY, 'dismissed');
  } catch {
    /* Storage blocked: the bar closes for this session and returns next time. */
  }
}

export function loadLog(): LogEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LogEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendLog(entry: LogEntry): LogEntry[] {
  const next = [entry, ...loadLog()].slice(0, 200);
  writeJson(LOG_KEY, next);
  return next;
}

export function countToday(log: readonly LogEntry[]): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return log.filter((entry) => entry.sentAt >= startOfDay.getTime()).length;
}

/**
 * Wipes the on-device cache.
 *
 * Called on sign-out: this device may be handed to a colleague, and the cache
 * holds third-party contact details from every card that was scanned.
 */
export function clearLocalData(): void {
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(LOG_KEY);
  } catch {
    /* Nothing to clear if storage is unavailable. */
  }
}
