import { describe, expect, it } from 'vitest';
import { buildVCard, composeDraft, contextPhrase, CTAS, TONES, type DraftInput } from '../src/lib/draft';

const base: DraftInput = {
  contact: { firstName: 'Wei Ming', name: 'Tan Wei Ming', company: 'Meridian Logistics' },
  sender: { name: 'Jerome', company: 'Northwind' },
  context: 'the SaaS Summit',
  tone: 'warm',
  cta: 'none',
};

describe('contextPhrase', () => {
  it('adds a preposition to a bare noun phrase', () => {
    expect(contextPhrase('the SaaS Summit')).toBe('at the SaaS Summit');
    expect(contextPhrase('Web Summit 2026')).toBe('at Web Summit 2026');
  });

  it('leaves an existing preposition alone', () => {
    expect(contextPhrase('at the trade show')).toBe('at the trade show');
    expect(contextPhrase('over coffee')).toBe('over coffee');
    expect(contextPhrase('through a mutual contact')).toBe('through a mutual contact');
    expect(contextPhrase('last week in Jakarta')).toBe('last week in Jakarta');
  });

  it('normalises whitespace and trailing punctuation', () => {
    expect(contextPhrase('  the   expo booth.  ')).toBe('at the expo booth');
  });

  it('returns empty for empty input, so the question stays optional', () => {
    expect(contextPhrase('')).toBe('');
    expect(contextPhrase('   ')).toBe('');
  });
});

describe('composeDraft — content', () => {
  it('greets by first name and names the sender and their company', () => {
    const draft = composeDraft(base);
    expect(draft).toContain('Wei Ming');
    expect(draft).toContain('Jerome');
    expect(draft).toContain('Northwind');
  });

  it('includes the meeting context when given', () => {
    expect(composeDraft(base)).toContain('at the SaaS Summit');
  });

  it('reads naturally when the context question is skipped', () => {
    const draft = composeDraft({ ...base, context: '' });
    expect(draft).not.toContain('undefined');
    expect(draft).not.toContain('  ');
    expect(draft).toContain('Great to connect');
  });

  it('appends the chosen call to action', () => {
    const draft = composeDraft({ ...base, cta: 'meeting' });
    expect(draft).toContain('15 minutes next week');
  });

  it('omits any ask when the CTA is none', () => {
    const draft = composeDraft(base);
    for (const cta of CTAS.filter((c) => c.id !== 'none')) {
      expect(draft).not.toContain(cta.text);
    }
  });
});

describe('composeDraft — every tone', () => {
  for (const tone of TONES) {
    it(`produces a clean message in the ${tone.id} tone`, () => {
      const draft = composeDraft({ ...base, tone: tone.id, cta: 'send-info' });
      expect(draft.length).toBeGreaterThan(40);
      expect(draft).not.toMatch(/undefined|null|\{|\}/);
      // No stray double spaces or leading/trailing whitespace.
      expect(draft).toBe(draft.trim());
      expect(draft).not.toMatch(/[^\n] {2,}/);
      // No orphaned punctuation from an empty slot.
      expect(draft).not.toMatch(/\s+[.,]/);
    });
  }

  it('uses a distinct opening per tone', () => {
    const openings = TONES.map((t) => composeDraft({ ...base, tone: t.id }).split('\n')[0]);
    expect(new Set(openings).size).toBe(TONES.length);
  });
});

describe('composeDraft — missing data degrades gracefully', () => {
  it('handles a contact with no name at all', () => {
    const draft = composeDraft({
      ...base,
      contact: { firstName: '', name: '', company: '' },
    });
    expect(draft).toContain('Hi there');
    expect(draft).not.toMatch(/undefined|null/);
  });

  it('handles a sender who has not filled in a company', () => {
    const draft = composeDraft({ ...base, sender: { name: 'Jerome', company: '' } });
    expect(draft).toContain('Jerome');
    expect(draft).not.toContain(' from .');
    expect(draft).not.toMatch(/from\s*$/m);
  });

  it('handles a completely empty sender profile', () => {
    const draft = composeDraft({ ...base, sender: { name: '', company: '' } });
    expect(draft.length).toBeGreaterThan(20);
    expect(draft).not.toMatch(/undefined|null|it's \./);
  });

  it('never leaves a dangling "from" for any tone', () => {
    for (const tone of TONES) {
      const draft = composeDraft({ ...base, tone: tone.id, sender: { name: '', company: '' } });
      expect(draft).not.toMatch(/\bfrom\b\s*[.\n]/);
    }
  });
});

describe('buildVCard', () => {
  const contact = {
    name: 'Tan Wei Ming',
    firstName: 'Tan',
    title: 'Regional Sales Director',
    company: 'Meridian Logistics Pte Ltd',
    email: 'weiming.tan@meridianlogistics.com',
    phone: '+6591234567',
  };

  it('produces a well-formed vCard', () => {
    const vcard = buildVCard(contact);
    expect(vcard.startsWith('BEGIN:VCARD')).toBe(true);
    expect(vcard.trimEnd().endsWith('END:VCARD')).toBe(true);
    expect(vcard).toContain('FN:Tan Wei Ming');
    expect(vcard).toContain('N:Ming;Tan Wei;;;');
    expect(vcard).toContain('TEL;TYPE=CELL:+6591234567');
    expect(vcard).toContain('ORG:Meridian Logistics Pte Ltd');
  });

  it('uses CRLF line endings as the spec requires', () => {
    expect(buildVCard(contact)).toContain('\r\n');
  });

  it('omits empty fields instead of emitting blank properties', () => {
    const vcard = buildVCard({ ...contact, title: '', email: '', company: '' });
    expect(vcard).not.toContain('TITLE:');
    expect(vcard).not.toContain('EMAIL');
    expect(vcard).not.toContain('ORG:');
  });
});
