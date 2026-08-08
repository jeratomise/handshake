import { describe, expect, it } from 'vitest';
import {
  classifyPhoneLine,
  formatE164,
  normalizePhone,
  pickBestPhone,
  whatsappUrl,
} from '../src/lib/phone';

describe('normalizePhone — international format', () => {
  it('accepts a well-formed +E.164 number', () => {
    const r = normalizePhone('+65 9123 4567', 'SG');
    expect(r.ok).toBe(true);
    expect(r.e164).toBe('+6591234567');
    expect(r.waDigits).toBe('6591234567');
    expect(r.countryIso).toBe('SG');
  });

  it('handles the 00 international prefix', () => {
    expect(normalizePhone('0065 9123 4567', 'MY').e164).toBe('+6591234567');
  });

  it('reads a foreign number regardless of the home market', () => {
    expect(normalizePhone('+44 7700 900123', 'SG').e164).toBe('+447700900123');
    expect(normalizePhone('+1 (415) 555-0132', 'SG').e164).toBe('+14155550132');
  });

  it('strips punctuation, dots and en-dashes', () => {
    expect(normalizePhone('+65.9123.4567', 'SG').e164).toBe('+6591234567');
    expect(normalizePhone('+65 9123–4567', 'SG').e164).toBe('+6591234567');
  });
});

describe('normalizePhone — local format', () => {
  it('adds the home country code to a bare local number', () => {
    expect(normalizePhone('9123 4567', 'SG').e164).toBe('+6591234567');
  });

  it('strips the trunk prefix before adding the country code', () => {
    expect(normalizePhone('012-345 6789', 'MY').e164).toBe('+60123456789');
    expect(normalizePhone('(02) 9876 5432', 'AU').e164).toBe('+61298765432');
    expect(normalizePhone('020 7946 0958', 'GB').e164).toBe('+442079460958');
  });

  it('handles the US 10-digit and 1+10-digit forms', () => {
    expect(normalizePhone('(415) 555-0132', 'US').e164).toBe('+14155550132');
    expect(normalizePhone('1-415-555-0132', 'US').e164).toBe('+14155550132');
  });

  it('does not double the country code when it is printed without a plus', () => {
    expect(normalizePhone('65 9123 4567', 'SG').e164).toBe('+6591234567');
  });

  it('breaks the length tie using mobile prefixes (Indonesian cards)', () => {
    // '62812345678' is 11 digits, which is BOTH a valid Indonesian national
    // length and a valid '62' + 9-digit reading. '812…' is the mobile prefix.
    expect(normalizePhone('62812345678', 'ID').e164).toBe('+62812345678');
    // Written as a true local number it must still gain the country code.
    expect(normalizePhone('0812 3456 7890', 'ID').e164).toBe('+6281234567890');
  });

  it('recognises a foreign number printed without a plus', () => {
    const r = normalizePhone('442079460958', 'SG');
    expect(r.e164).toBe('+442079460958');
    expect(r.warning).toBeTruthy();
  });
});

describe('normalizePhone — rejection', () => {
  it('rejects empty and non-numeric input', () => {
    expect(normalizePhone('', 'SG').ok).toBe(false);
    expect(normalizePhone('Sales Director', 'SG').ok).toBe(false);
  });

  it('rejects numbers that are too short or too long for E.164', () => {
    expect(normalizePhone('12345', 'SG').ok).toBe(false);
    expect(normalizePhone('+1234567890123456789', 'SG').ok).toBe(false);
  });

  it('never returns a plus-prefixed value in waDigits', () => {
    const r = normalizePhone('+65 9123 4567', 'SG');
    expect(r.waDigits).not.toContain('+');
  });
});

describe('formatE164', () => {
  it('groups digits for display', () => {
    expect(formatE164('+6591234567')).toBe('+65 9123 4567');
    expect(formatE164('+14155550132')).toBe('+1 415 555 0132');
    expect(formatE164('+60123456789')).toBe('+60 123 456 789');
  });

  it('is safe on empty input', () => {
    expect(formatE164(null)).toBe('');
  });
});

describe('classifyPhoneLine', () => {
  it('detects mobile labels', () => {
    expect(classifyPhoneLine('M: +65 9123 4567')).toBe('mobile');
    expect(classifyPhoneLine('HP 9123 4567')).toBe('mobile');
    expect(classifyPhoneLine('Mobile +65 9123 4567')).toBe('mobile');
  });

  it('detects fax and office labels', () => {
    expect(classifyPhoneLine('Fax: +65 6123 4567')).toBe('fax');
    expect(classifyPhoneLine('Tel: +65 6123 4567')).toBe('office');
  });

  it('returns unknown when unlabelled', () => {
    expect(classifyPhoneLine('+65 9123 4567')).toBe('unknown');
  });
});

describe('pickBestPhone', () => {
  it('prefers a labelled mobile over an office line', () => {
    const best = pickBestPhone(
      [
        { raw: '+65 6123 4567', kind: 'office' },
        { raw: '+65 9123 4567', kind: 'mobile' },
      ],
      'SG',
    );
    expect(best?.raw).toBe('+65 9123 4567');
  });

  it('never picks a fax number', () => {
    const best = pickBestPhone(
      [
        { raw: '+65 6123 4567', kind: 'fax' },
        { raw: '+65 6222 3333', kind: 'office' },
      ],
      'SG',
    );
    expect(best?.raw).toBe('+65 6222 3333');
  });

  it('returns null when every candidate is a fax', () => {
    expect(pickBestPhone([{ raw: '+65 6123 4567', kind: 'fax' }], 'SG')).toBeNull();
  });

  it('uses mobile prefixes to rank unlabelled numbers', () => {
    const best = pickBestPhone(
      [
        { raw: '6123 4567', kind: 'unknown' },
        { raw: '9123 4567', kind: 'unknown' },
      ],
      'SG',
    );
    expect(best?.raw).toBe('9123 4567');
  });

  it('ignores candidates that cannot be normalised', () => {
    const best = pickBestPhone(
      [
        { raw: '123', kind: 'mobile' },
        { raw: '+65 9123 4567', kind: 'office' },
      ],
      'SG',
    );
    expect(best?.raw).toBe('+65 9123 4567');
  });
});

describe('whatsappUrl', () => {
  it('builds a wa.me link with digits only and an encoded message', () => {
    const url = whatsappUrl('+6591234567', 'Hi Wei Ming — great to meet you!');
    expect(url.startsWith('https://wa.me/6591234567?text=')).toBe(true);
    expect(url).not.toContain(' ');
    expect(decodeURIComponent(url.split('?text=')[1]!)).toBe('Hi Wei Ming — great to meet you!');
  });

  it('encodes newlines so multi-paragraph drafts survive the handoff', () => {
    const url = whatsappUrl('+6591234567', 'Line one\n\nLine two');
    expect(url).toContain('%0A%0A');
  });
});
