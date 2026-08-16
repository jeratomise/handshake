import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProfile, loadProfile, profileIsComplete, saveProfile } from '../src/lib/storage';

/**
 * The sender profile a phone starts with.
 *
 * Everyone on this deployment writes as AMD Inc., so the company is pre-filled
 * rather than typed. The risk of a default like this is that it quietly
 * overwrites somebody — so the tests below pin the two things that must stay
 * true: a saved profile always wins, and the setup sheet still appears.
 */

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});

describe('defaultProfile', () => {
  it('pre-fills the company', () => {
    expect(defaultProfile().company).toBe('AMD Inc.');
    expect(loadProfile().company).toBe('AMD Inc.');
  });

  it('leaves the name blank, so the setup sheet still opens on a new phone', () => {
    // The first-run gate keys on the name alone. A pre-filled company must not
    // skip the one screen that collects who the message is from.
    expect(defaultProfile().name).toBe('');
    expect(profileIsComplete(defaultProfile())).toBe(false);
  });
});

describe('a profile that was already saved', () => {
  it('keeps the company the user typed', () => {
    saveProfile({ ...defaultProfile(), name: 'Jerome Ng', company: 'Northwind Logistics' });
    expect(loadProfile().company).toBe('Northwind Logistics');
  });

  it('keeps a company the user deliberately cleared', () => {
    // The stored value is merged over the default, so blank stays blank. If it
    // did not, the default would reappear on every reload and there would be no
    // way to send a message without a company on it.
    saveProfile({ ...defaultProfile(), name: 'Jerome Ng', company: '' });
    expect(loadProfile().company).toBe('');
  });

  it('is complete once it has a name', () => {
    saveProfile({ ...defaultProfile(), name: 'Jerome Ng' });
    expect(profileIsComplete(loadProfile())).toBe(true);
  });
});
