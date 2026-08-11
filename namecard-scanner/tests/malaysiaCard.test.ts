import { describe, expect, it } from 'vitest';
import { parseCard } from '../src/lib/parseCard';
import { normalizePhone, pickBestPhone, whatsappUrl } from '../src/lib/phone';

/**
 * A real card from a beta tester, and the three bugs it exposed.
 *
 * Eu Yan Sang, Petaling Jaya. The mobile is printed as '(6019) 7314 959' —
 * the country code is inside the brackets, with no '+' anywhere on the card —
 * and the tax number '(TIN No. : C 854327050)' sits four lines below it.
 *
 * What went wrong, in order of severity:
 *
 *  1. The tax number won. Nine digits starting with '8' is a valid Singapore
 *     mobile, so for a Singapore-based BDE it normalised cleanly, collected
 *     the "unlabelled but mobile-prefixed" bonus, and outranked the real
 *     number. The follow-up would have gone to a stranger, or nobody.
 *  2. '(6019)' parsed as nothing useful. No '+' meant no international path,
 *     and the run-together digits matched no country's length rules.
 *  3. The company fell back to the website domain — 'Euyansang' — because the
 *     registration number after 'Sdn. Bhd.' broke the end-of-line suffix test.
 */

/** The card as OCR reads it when the phone glyph is dropped entirely. */
const CARD = `Ng Beei Ching
Assistant Outlet Supervisor
(6019) 7314 959
Eu Yan Sang (1959) Sdn. Bhd. 195901000194 (3544-P)
Lot LG2. 129A-1, Sunway Pyramid,
No. 3, Jalan PJS 11/15, Bandar Sunway,
46150 Petaling Jaya, Selangor.
www.euyansang.com.my
(TIN No. : C 854327050)`;

/** The same card when the glyph is misread as a stray leading character. */
const CARD_WITH_GLYPH_NOISE = CARD.replace('(6019)', '0 (6019)');

const EXPECTED_E164 = '+60197314959';

describe('bracketed country codes', () => {
  it('reads a country code printed inside brackets, with no plus anywhere', () => {
    for (const home of ['SG', 'MY']) {
      const result = normalizePhone('(6019) 7314 959', home);
      expect(result.e164).toBe(EXPECTED_E164);
      expect(result.countryIso).toBe('MY');
      // The card stated the country code, so nothing here was a judgement call
      // and the user should not be asked to double-check it.
      expect(result.confidence).toBe('exact');
      expect(result.warning).toBeUndefined();
    }
  });

  it('survives a stray character where the phone glyph was', () => {
    expect(normalizePhone('0 (6019) 7314 959', 'SG').e164).toBe(EXPECTED_E164);
    expect(normalizePhone('[] (6019) 7314 959', 'MY').e164).toBe(EXPECTED_E164);
  });

  it('handles the same convention for other markets', () => {
    expect(normalizePhone('(65) 9123 4567', 'MY').e164).toBe('+6591234567');
    expect(normalizePhone('(6012) 345 6789', 'SG').e164).toBe('+60123456789');
  });

  it('accepts a plus inside the brackets too', () => {
    expect(normalizePhone('(+60) 19 7314 959', 'SG').e164).toBe(EXPECTED_E164);
  });

  it('does not mistake a local area code for a country code', () => {
    // Every one of these opens with digits that ARE a real country dial code.
    // What stops them being read that way is the length check: the remaining
    // digits have to be a valid national number for that country, and here
    // they never are. Without it, a New York card would dial Egypt.
    const areaCodes: [string, string, string][] = [
      ['(415) 555-0123', 'US', '+14155550123'], // 41 = Switzerland
      ['(212) 555-1234', 'US', '+12125551234'],
      ['(02) 9876 5432', 'AU', '+61298765432'], // trunk prefix, not dial 61
      ['(020) 7946 0958', 'GB', '+442079460958'], // 20 = Egypt
      ['(91) 123 45 67', 'ES', '+34911234567'], // 91 = India
    ];
    for (const [raw, home, expected] of areaCodes) {
      expect(normalizePhone(raw, home).e164, `${raw} in ${home}`).toBe(expected);
    }
  });
});

describe('identifiers are not phone numbers', () => {
  it('ignores a tax number printed in phone-number shape', () => {
    const card = parseCard(CARD);
    const digits = card.phones.map((p) => p.raw.replace(/\D/g, ''));
    expect(digits).not.toContain('854327050');
    expect(card.phones).toHaveLength(1);
  });

  it('ignores registration and tax markers generally', () => {
    for (const line of [
      'GST Reg No. 200412345K',
      'Company No. 199801234567',
      'VAT: 123456789',
      'UEN 53312345B',
      '(TIN No. : C 854327050)',
    ]) {
      expect(parseCard(`Alan Chen\n${line}`).phones).toEqual([]);
    }
  });

  it('still reads a real number on a card that also carries an identifier', () => {
    const card = parseCard('Alan Chen\nM: +65 9123 4567\nGST Reg No. 200412345K');
    expect(card.phones).toHaveLength(1);
    expect(pickBestPhone(card.phones, 'SG')?.raw).toContain('9123');
  });
});

describe('unlabelled registration numbers are not phone numbers', () => {
  // What the beta tester actually hit. OCR put the registration number on its
  // own line, and with no keyword beside it nothing marked it as not-a-phone:
  // the confirm screen offered '+60 1959 0100 0194' with a green "read from
  // the card" dot, and the real mobile was nowhere.
  it('rejects a bare 12-digit registration number', () => {
    const card = parseCard('Eu Yan Sang (1959) Sdn. Bhd.\n195901000194\nwww.euyansang.com.my');
    expect(card.phones).toEqual([]);
  });

  it('rejects a line carrying the bracketed company-number suffix', () => {
    expect(parseCard('Acme Holdings Sdn. Bhd.\n195901000194 (3544-P)').phones).toEqual([]);
  });

  it('keeps a real number that happens to open with a year', () => {
    // +20 12 3456 7890 is an Egyptian mobile written without its plus. Twelve
    // digits opening with '2012' — but it is a valid number for a real country,
    // so the shape rule must not touch it.
    const card = parseCard('Omar Farouk\n201234567890');
    expect(card.phones).toHaveLength(1);
    expect(normalizePhone(card.phones[0]!.raw, 'EG').e164).toBe('+201234567890');
  });

  it('keeps ordinary long numbers that are not year-prefixed', () => {
    const card = parseCard('Budi Santoso\n628123456789');
    expect(card.phones).toHaveLength(1);
  });
});

describe('a bilingual name is read through the misread half', () => {
  it('keeps the Latin name when the CJK beside it comes back as debris', () => {
    // 'Ng Beei Ching 黄美清' as an English-only model returns it.
    const card = parseCard('Ng Beei Ching Xi3£i8\nAssistant Outlet Supervisor');
    expect(card.name).toBe('Ng Beei Ching');
  });

  it('does not turn an address into a person', () => {
    // Only the tail is ever dropped, never the head. Were debris stripped from
    // both ends, this line would surrender 'Sunway Pyramid' as a person.
    expect(parseCard('Lot LG2. 129A-1, Sunway Pyramid,').name).toBe('');
  });
});

describe('a guessed country code never outranks a stated one', () => {
  it('prefers the number whose country code the card actually printed', () => {
    const candidates = [
      // Phone-shaped, but only resolvable by assuming the home market.
      { raw: '854327050', kind: 'unknown' as const },
      { raw: '(6019) 7314 959', kind: 'unknown' as const },
    ];
    expect(pickBestPhone(candidates, 'SG')?.raw).toBe('(6019) 7314 959');
  });

  it('still prefers an explicitly labelled mobile over anything else', () => {
    const candidates = [
      { raw: '+65 6222 8888', kind: 'office' as const },
      { raw: '+65 9123 4567', kind: 'mobile' as const },
    ];
    expect(pickBestPhone(candidates, 'SG')?.raw).toBe('+65 9123 4567');
  });
});

describe('the Eu Yan Sang card end to end', () => {
  for (const [label, text] of Object.entries({ clean: CARD, 'glyph noise': CARD_WITH_GLYPH_NOISE })) {
    describe(label, () => {
      const card = parseCard(text);

      it('reads the person', () => {
        expect(card.name).toBe('Ng Beei Ching');
        expect(card.title).toBe('Assistant Outlet Supervisor');
      });

      it('greets by the given name, not the family name', () => {
        // 'Ng' is the surname in this ordering. There is no email on the card
        // to settle it, so this rests entirely on the surname list.
        expect(card.firstName).toBe('Beei Ching');
      });

      it('reads the company from the card, not the web domain', () => {
        expect(card.company).toBe('Eu Yan Sang (1959) Sdn. Bhd.');
      });

      it('builds a WhatsApp link to the Malaysian mobile', () => {
        const best = pickBestPhone(card.phones, 'SG');
        expect(best).not.toBeNull();
        const normalized = normalizePhone(best!.raw, 'SG');
        expect(normalized.e164).toBe(EXPECTED_E164);
        expect(whatsappUrl(normalized.e164!, 'hi')).toBe('https://wa.me/60197314959?text=hi');
      });
    });
  }
});
