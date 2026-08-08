import { describe, expect, it } from 'vitest';
import { cleanLines, greetingName, parseCard, titleCase } from '../src/lib/parseCard';
import { pickBestPhone } from '../src/lib/phone';

/** A tidy Singapore card, the happy path. */
const SG_CARD = `
TAN WEI MING
Regional Sales Director
Meridian Logistics Pte Ltd
M: +65 9123 4567
Tel: +65 6222 8888
Fax: +65 6222 8889
weiming.tan@meridianlogistics.com
www.meridianlogistics.com
78 Shenton Way #12-01
Singapore 079120
`;

/** A minimal startup card with no company suffix and a bare local number. */
const STARTUP_CARD = `
Priya Raghunathan
Head of Partnerships
9812 3456
priya@northbeam.io
northbeam.io
`;

/** Realistic OCR damage: stray glyphs, broken spacing, a dropped line. */
const NOISY_CARD = `
|  ~~~
JAMES O'CONNOR
Business Development Manager
Kestrel Technologies Sdn Bhd
Mobile   012-345  6789
james.oconnor@kestreltech.com.my
....
`;

/** Company-first layout with the name lower down, and no explicit title. */
const COMPANY_FIRST_CARD = `
ATLAS VENTURES
Sarah Lindqvist
sarah.lindqvist@atlasventures.se
+46 70 123 45 67
`;

describe('cleanLines', () => {
  it('drops noise-only lines and collapses whitespace', () => {
    const lines = cleanLines('|  ~~~\nJohn   Smith\n....\n\n  ');
    expect(lines).toEqual(['John Smith']);
  });

  it('trims leading and trailing punctuation', () => {
    expect(cleanLines('• Sales Director •')).toEqual(['Sales Director']);
  });
});

describe('titleCase', () => {
  it('fixes all-caps names', () => {
    expect(titleCase('TAN WEI MING')).toBe('Tan Wei Ming');
  });

  it('leaves mixed-case names untouched', () => {
    expect(titleCase('Priya Raghunathan')).toBe('Priya Raghunathan');
    expect(titleCase("James O'Connor")).toBe("James O'Connor");
  });
});

describe('greetingName', () => {
  it('uses the given name for Western ordering', () => {
    expect(greetingName("James O'Connor")).toBe('James');
    expect(greetingName('Priya Raghunathan')).toBe('Priya');
    expect(greetingName('Sarah Lindqvist', 'sarah.lindqvist@atlasventures.se')).toBe('Sarah');
  });

  it('does not greet a surname-first name by the family name', () => {
    expect(greetingName('Tan Wei Ming')).toBe('Wei Ming');
    expect(greetingName('Lee Hsien Yang')).toBe('Hsien Yang');
    expect(greetingName('Kim Min Jun')).toBe('Min Jun');
  });

  it('lets the email settle the order when the surname list would be wrong', () => {
    // 'Lin' is a family name in one convention and a given name in another.
    expect(greetingName('Lin Peterson', 'lin.peterson@acme.com')).toBe('Lin');
    expect(greetingName('Tan Wei Ming', 'weiming.tan@meridian.com')).toBe('Wei Ming');
  });

  it('handles the surname-last ordering of the same names', () => {
    expect(greetingName('Bruce Lee')).toBe('Bruce');
    expect(greetingName('David Ng')).toBe('David');
  });

  it('takes the final personal name for Vietnamese ordering', () => {
    expect(greetingName('Nguyen Van An')).toBe('An');
    expect(greetingName('Tran Thi Mai')).toBe('Mai');
  });

  it('is safe on empty and single-token names', () => {
    expect(greetingName('')).toBe('');
    expect(greetingName('Madonna')).toBe('Madonna');
  });
});

describe('parseCard — standard card', () => {
  const card = parseCard(SG_CARD);

  it('extracts the name and normalises all-caps', () => {
    expect(card.name).toBe('Tan Wei Ming');
    // The email says the personal name is Wei Ming, not the family name Tan.
    expect(card.firstName).toBe('Wei Ming');
  });

  it('extracts the job title', () => {
    expect(card.title).toBe('Regional Sales Director');
  });

  it('extracts the company', () => {
    expect(card.company).toBe('Meridian Logistics Pte Ltd');
  });

  it('extracts the email and website', () => {
    expect(card.email).toBe('weiming.tan@meridianlogistics.com');
    expect(card.website).toBe('www.meridianlogistics.com');
  });

  it('captures every phone with its label', () => {
    const kinds = card.phones.map((p) => p.kind);
    expect(kinds).toContain('mobile');
    expect(kinds).toContain('office');
    expect(kinds).toContain('fax');
  });

  it('picks the mobile number for WhatsApp, not the office or fax line', () => {
    const best = pickBestPhone(card.phones, 'SG');
    expect(best?.raw.replace(/\D/g, '')).toBe('6591234567');
  });

  it('does not mistake the postal code or unit number for a phone', () => {
    const digits = card.phones.map((p) => p.raw.replace(/\D/g, ''));
    expect(digits).not.toContain('079120');
    expect(digits.every((d) => d.length >= 7)).toBe(true);
  });

  it('does not treat the address as the company', () => {
    expect(card.company).not.toContain('Shenton');
  });
});

describe('parseCard — startup card without a company suffix', () => {
  const card = parseCard(STARTUP_CARD);

  it('extracts the name and title', () => {
    expect(card.name).toBe('Priya Raghunathan');
    expect(card.firstName).toBe('Priya');
    expect(card.title).toBe('Head of Partnerships');
  });

  it('falls back to the email domain for the company', () => {
    expect(card.company).toBe('Northbeam');
  });

  it('keeps the bare local number and resolves it against the home market', () => {
    const best = pickBestPhone(card.phones, 'SG');
    expect(best).not.toBeNull();
    expect(best!.raw.replace(/\D/g, '')).toBe('98123456');
  });
});

describe('parseCard — noisy OCR output', () => {
  const card = parseCard(NOISY_CARD);

  it('recovers the name through the noise', () => {
    expect(card.name).toBe("James O'Connor");
  });

  it('recovers the title and company', () => {
    expect(card.title).toBe('Business Development Manager');
    expect(card.company).toBe('Kestrel Technologies Sdn Bhd');
  });

  it('recovers a phone despite doubled spaces', () => {
    const best = pickBestPhone(card.phones, 'MY');
    expect(best?.raw.replace(/\D/g, '')).toBe('0123456789');
  });

  it('recovers the email', () => {
    expect(card.email).toBe('james.oconnor@kestreltech.com.my');
  });
});

describe('parseCard — company-first layout', () => {
  const card = parseCard(COMPANY_FIRST_CARD);

  it('uses the email local part to disambiguate the name from the company', () => {
    expect(card.name).toBe('Sarah Lindqvist');
  });

  it('still identifies the company', () => {
    expect(card.company).toBe('Atlas Ventures');
  });
});

describe('parseCard — degenerate input', () => {
  it('returns empty fields rather than throwing on empty text', () => {
    const card = parseCard('');
    expect(card.name).toBe('');
    expect(card.phones).toEqual([]);
    expect(card.lines).toEqual([]);
  });

  it('returns empty fields rather than throwing on pure garbage', () => {
    const card = parseCard('~~~\n|||\n...\n###');
    expect(card.name).toBe('');
    expect(card.company).toBe('');
  });

  it('never invents a company from a generic mail host', () => {
    const card = parseCard('Alan Chen\nalan.chen@gmail.com\n9123 4567');
    expect(card.company).toBe('');
    expect(card.name).toBe('Alan Chen');
  });

  it('recovers a name from the email when no name line exists', () => {
    const card = parseCard('Sales Director\nmaria.gonzalez@acme.com');
    expect(card.name).toBe('Maria Gonzalez');
    expect(card.firstName).toBe('Maria');
  });
});
