import { describe, expect, it } from 'vitest';
import { composeDraft, familyName, languageForCountry } from '../src/lib/draft';
import { greetingName } from '../src/lib/parseCard';
import type { DraftInput, MessageLanguage } from '../src/lib/draft';

/**
 * Japanese and Korean drafts.
 *
 * These assert the conventions rather than the exact prose, so the wording can
 * be improved by a native speaker without the suite fighting back. What must
 * not change is the form: family name plus 様, a self-introduction before
 * anything else, a polite register in every tone, and a closing set phrase.
 */

const base = (over: Partial<DraftInput> = {}): DraftInput => ({
  contact: { firstName: 'Kenji', name: 'Kenji Nakamura', company: 'Sakura Logistics' },
  sender: { name: 'Jerome Ng', company: 'Northwind Logistics' },
  context: 'at the trade show',
  tone: 'warm',
  cta: 'none',
  ...over,
});

const TONES: DraftInput['tone'][] = ['warm', 'direct', 'formal'];

describe('languageForCountry', () => {
  it('writes to Japanese and Korean contacts in their language', () => {
    expect(languageForCountry('JP')).toBe('ja');
    expect(languageForCountry('KR')).toBe('ko');
  });

  it('leaves everywhere else in English', () => {
    for (const iso of ['SG', 'MY', 'US', 'CN', 'TW', 'GB']) {
      expect(languageForCountry(iso)).toBe('en');
    }
  });
});

describe('familyName', () => {
  it('is whatever the greeting left behind', () => {
    // greetingName already decided which tokens are personal, using the email
    // and a surname list. The remainder is the family name.
    expect(familyName('Kenji Nakamura', 'Kenji')).toBe('Nakamura');
    expect(familyName('Park Ji Hoon', 'Ji Hoon')).toBe('Park');
    expect(familyName('Tan Wei Ming', 'Wei Ming')).toBe('Tan');
  });

  it('always yields something to address them by', () => {
    expect(familyName('Madonna', 'Madonna')).toBe('Madonna');
    expect(familyName('Kenji Nakamura', 'Kenji Nakamura')).toBe('Nakamura');
    expect(familyName('', '')).toBe('');
  });
});

describe('Japanese draft', () => {
  it('addresses the family name, not the given name', () => {
    // 健二様 to someone you have just met is presumptuous; 中村様 is correct.
    // This is the exact inverse of the English greeting.
    const message = composeDraft(base({ language: 'ja' }));
    expect(message).toContain('Nakamura様');
    expect(message).not.toContain('Kenji様');
  });

  it('introduces the sender before anything else', () => {
    const message = composeDraft(base({ language: 'ja' }));
    expect(message).toContain('Northwind Logisticsの Jerome Ng'.replace(' Jerome', 'Jerome'));
  });

  it('stays polite in every tone', () => {
    // "Direct" means shorter, never plainer. Casual Japanese to a new business
    // contact is not a blunter version of the message — it is an insult.
    for (const tone of TONES) {
      const message = composeDraft(base({ language: 'ja', tone }));
      expect(message, tone).toMatch(/(ます|です|ございます)/);
      expect(message, tone).toContain('よろしくお願い');
      // Plain-form verb endings that would read as rude here.
      expect(message, tone).not.toMatch(/(だよ|だね|くれ。|しろ)/);
    }
  });

  it('translates a quick-pick meeting place', () => {
    expect(composeDraft(base({ language: 'ja', context: 'at the trade show' }))).toContain('展示会');
    expect(composeDraft(base({ language: 'ja', context: 'over lunch' }))).toContain('ランチ');
  });

  it('quotes free text rather than mangling it', () => {
    // The app cannot translate an event name, and a bad guess is worse than
    // the name itself.
    const message = composeDraft(base({ language: 'ja', context: 'at the SaaS Summit' }));
    expect(message).toContain('「at the SaaS Summit」');
  });

  it('reads properly with no meeting context at all', () => {
    const message = composeDraft(base({ language: 'ja', context: '' }));
    expect(message).toContain('先日は');
    expect(message).not.toContain('「」');
    expect(message).not.toContain('undefined');
  });

  it('carries the ask when one was chosen', () => {
    expect(composeDraft(base({ language: 'ja', cta: 'meeting' }))).toContain('15分');
    expect(composeDraft(base({ language: 'ja', cta: 'none' }))).not.toContain('15分');
  });

  it('degrades to a sendable message with almost nothing known', () => {
    const message = composeDraft({
      contact: { firstName: '', name: '', company: '' },
      sender: { name: '', company: '' },
      context: '',
      tone: 'warm',
      cta: 'none',
      language: 'ja',
    });
    expect(message).toContain('ご担当者様');
    expect(message.trim().length).toBeGreaterThan(10);
  });
});

describe('Korean draft', () => {
  const korean = (over: Partial<DraftInput> = {}) =>
    composeDraft(
      base({
        contact: { firstName: 'Ji Hoon', name: 'Park Ji Hoon', company: 'Hanyang Logistics' },
        language: 'ko',
        ...over,
      }),
    );

  it('addresses the full name with 님', () => {
    expect(korean()).toContain('Park Ji Hoon님');
  });

  it('stays polite in every tone', () => {
    for (const tone of TONES) {
      const message = korean({ tone });
      expect(message, tone).toMatch(/(습니다|세요|십니까)/);
      expect(message, tone).not.toMatch(/(야\.|해라|하셈)/);
    }
  });

  it('introduces the sender and translates the meeting place', () => {
    const message = korean({ context: 'at the trade show' });
    expect(message).toContain('Northwind Logistics의 Jerome Ng입니다.');
    expect(message).toContain('전시회에서');
  });

  it('carries the ask when one was chosen', () => {
    expect(korean({ cta: 'send-info' })).toContain('자료');
  });
});

/**
 * What a vision model returns for a card printed only in Japanese.
 *
 * Gemini gives the native script rather than a romanisation — which is better
 * than Latin for the message, and inverts the name logic. Verified against the
 * live endpoint, not assumed: it returned exactly {"name":"中村 健二"}.
 */
describe('a name in the native script', () => {
  it('is family-first, so the family name is the FIRST token', () => {
    expect(familyName('中村 健二', '健二')).toBe('中村');
    expect(familyName('田中 太郎', '太郎')).toBe('田中');
  });

  it('greets by the given name, which is the last token', () => {
    // The email and the surname list are both Latin and cannot help here.
    expect(greetingName('中村 健二')).toBe('健二');
    expect(greetingName('中村 健二', 'k.nakamura@sakura-logistics.co.jp')).toBe('健二');
  });

  it('opens the Japanese message with the family name', () => {
    // 健二様 is the given name — the one mistake this whole module exists to
    // prevent, and it reappeared the moment the AI supplied real kanji.
    const message = composeDraft(
      base({ language: 'ja', contact: { firstName: '健二', name: '中村 健二', company: 'さくら物流株式会社' } }),
    );
    expect(message).toContain('中村様');
    expect(message).not.toContain('健二様');
  });

  it('handles a Korean name written as one token', () => {
    expect(greetingName('박지훈')).toBe('박지훈');
    expect(composeDraft(base({ language: 'ko', contact: { firstName: '박지훈', name: '박지훈', company: 'x' } }))).toContain(
      '박지훈님',
    );
  });

  it('leaves romanised names on the old path', () => {
    expect(familyName('Kenji Nakamura', 'Kenji')).toBe('Nakamura');
    expect(greetingName('Kenji Nakamura', 'k.nakamura@sakura-logistics.co.jp')).toBe('Kenji');
  });
});

describe('English is untouched', () => {
  it('still produces the original draft when no language is given', () => {
    const message = composeDraft(base());
    expect(message).toContain('Hi Kenji');
    expect(message).not.toContain('様');
  });

  it('still produces the original draft when the language is english', () => {
    const message = composeDraft(base({ language: 'en' as MessageLanguage }));
    expect(message).toContain('Hi Kenji');
  });
});
