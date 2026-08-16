import { describe, expect, it } from 'vitest';
import { guessCountryIso, DEFAULT_COUNTRY_ISO } from '../src/lib/countries';

/**
 * Which market a bare local number is resolved against.
 *
 * This is the *last* thing consulted — a '+', a bracketed country code, a
 * trunk prefix and the email's TLD all beat it. It matters anyway, because
 * when it is wrong it is wrong silently: '9123 4567' read as American becomes
 * +1 91234567, a number that is real, dialable, and nobody's.
 */
describe('guessCountryIso', () => {
  it('trusts the time zone over the language tag', () => {
    // The case this exists for. A Singapore BDE whose phone reports 'en-US' —
    // which is extremely common — used to get the United States as their home
    // market, and every local number they scanned resolved to +1.
    expect(guessCountryIso(['en-US', 'en'], 'Asia/Singapore')).toBe('SG');
    expect(guessCountryIso(['en-US'], 'Asia/Kuala_Lumpur')).toBe('MY');
    expect(guessCountryIso(['en-GB'], 'Asia/Tokyo')).toBe('JP');
  });

  it('covers the markets a BDE in this region actually works in', () => {
    const zones: [string, string][] = [
      ['Asia/Singapore', 'SG'], ['Asia/Kuala_Lumpur', 'MY'], ['Asia/Jakarta', 'ID'],
      ['Asia/Bangkok', 'TH'], ['Asia/Ho_Chi_Minh', 'VN'], ['Asia/Manila', 'PH'],
      ['Asia/Hong_Kong', 'HK'], ['Asia/Taipei', 'TW'], ['Asia/Shanghai', 'CN'],
      ['Asia/Tokyo', 'JP'], ['Asia/Seoul', 'KR'], ['Asia/Kolkata', 'IN'],
      ['Australia/Sydney', 'AU'], ['Europe/London', 'GB'], ['America/New_York', 'US'],
    ];
    for (const [zone, iso] of zones) {
      expect(guessCountryIso([], zone), zone).toBe(iso);
    }
  });

  it('falls back to a region-carrying locale when the zone is unknown', () => {
    expect(guessCountryIso(['en-SG'], 'Antarctica/Troll')).toBe('SG');
    expect(guessCountryIso(['ms-MY'], '')).toBe('MY');
  });

  it('falls back to Singapore when nothing says otherwise', () => {
    expect(guessCountryIso([], 'Antarctica/Troll')).toBe(DEFAULT_COUNTRY_ISO);
    expect(guessCountryIso(['en'], '')).toBe('SG');
    expect(guessCountryIso([], '')).toBe('SG');
  });

  it('ignores a locale region that is not a market we know', () => {
    expect(guessCountryIso(['en-XX'], '')).toBe('SG');
  });
});
