import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  FALLBACK_SETTINGS,
  cacheSettings,
  loadCachedSettings,
  rowToSettings,
  withTimeout,
} from '../src/lib/settings';

// jsdom is not in play for the node test env, so provide the minimum surface
// the cache helpers touch.
const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe('withTimeout', () => {
  it('resolves the promise when it wins', async () => {
    await expect(withTimeout(Promise.resolve('value'), 50, 'fallback')).resolves.toBe('value');
  });

  it('resolves the fallback when the promise hangs', async () => {
    // A hung request is not a rejection, so a plain catch never fires — this is
    // the case that used to leave the app on its loading screen forever.
    const hangs = new Promise<string>(() => {});
    await expect(withTimeout(hangs, 20, 'fallback')).resolves.toBe('fallback');
  });

  it('resolves the fallback when the promise rejects', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 50, 'fallback')).resolves.toBe('fallback');
  });

  it('never rejects, whatever it is given', async () => {
    await expect(withTimeout(Promise.reject(new Error('x')), 5, 1)).resolves.toBe(1);
  });
});

describe('settings cache', () => {
  it('round-trips settings', () => {
    const settings = { requireEmailVerification: false, aiOcrEnabled: true, aiOcrModel: 'x/y' };
    cacheSettings(settings);
    expect(loadCachedSettings()).toEqual(settings);
  });

  it('returns null when nothing is cached', () => {
    expect(loadCachedSettings()).toBeNull();
  });

  it('ignores corrupt or partial cache entries rather than trusting them', () => {
    store.set('handshake.settings.v1', 'not json');
    expect(loadCachedSettings()).toBeNull();
    store.set('handshake.settings.v1', JSON.stringify({ aiOcrEnabled: true }));
    expect(loadCachedSettings()).toBeNull();
  });

  it('fills gaps from the defaults', () => {
    store.set('handshake.settings.v1', JSON.stringify({ requireEmailVerification: false }));
    expect(loadCachedSettings()).toEqual({ ...FALLBACK_SETTINGS, requireEmailVerification: false });
  });
});

describe('rowToSettings', () => {
  it('maps a full row', () => {
    expect(
      rowToSettings({ require_email_verification: false, ai_ocr_enabled: true, ai_ocr_model: 'a/b' }),
    ).toEqual({ requireEmailVerification: false, aiOcrEnabled: true, aiOcrModel: 'a/b' });
  });

  it('falls back on a missing row', () => {
    expect(rowToSettings(null)).toEqual(FALLBACK_SETTINGS);
  });

  it('treats a blank model as unset rather than shipping an empty model id', () => {
    expect(
      rowToSettings({ require_email_verification: true, ai_ocr_enabled: false, ai_ocr_model: '   ' }).aiOcrModel,
    ).toBe(FALLBACK_SETTINGS.aiOcrModel);
  });
});
