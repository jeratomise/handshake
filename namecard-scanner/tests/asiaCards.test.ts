import { describe, expect, it } from 'vitest';
import { greetingName, parseCard, rescuePhrase } from '../src/lib/parseCard';
import { chooseMarket, normalizePhone, pickBestPhone } from '../src/lib/phone';
import { countryFromTld } from '../src/lib/countries';

/**
 * Japanese and Korean cards, and what an English-only OCR model does to them.
 *
 * The strings below are not invented: they are what Tesseract actually returned
 * for the rendered fixtures, kanji and hangul included. The engine ships
 * `eng.traineddata` only, so the native script comes back as plausible-looking
 * ASCII rubbish — and the question these tests answer is how much of the card
 * survives that.
 *
 * The answer turned out to be "nearly all of it", once four separate faults
 * were fixed. None of them needed another language model.
 */

const JP_AS_READ = `aa SR: dt
KENJI NAKAMURA

BIR Sales Manager

x < Lif 4£3t SAKURA LOGISTICS CO., LTD.

HEH: Mobile: 090-1234-5678
EEE Tel: 03-5555-0123

k.nakamura@sakura-logistics.co.jp`;

const KR_AS_READ = `utx| &
PARK JI HOON

24 2{El Xt Sales Team Manager

[ok
02

£2 =A! A} HANYANG LOGISTICS CO., LTD.

SCHE Mobile: 010-9876-5432
Xs} Tel: 02-555-0199
jihoon.park@hanyanglogis.co.kr`;

describe('countryFromTld', () => {
  it('reads the market off a country domain', () => {
    expect(countryFromTld('k.nakamura@sakura-logistics.co.jp')).toBe('JP');
    expect(countryFromTld('jihoon.park@hanyanglogis.co.kr')).toBe('KR');
    expect(countryFromTld('james@kestreltech.com.my')).toBe('MY');
    expect(countryFromTld('www.example.co.uk')).toBe('GB');
  });

  it('says nothing about a generic domain', () => {
    // A .com or a .io tells you where the company hosts, not where it is.
    expect(countryFromTld('weiming.tan@meridianlogistics.com')).toBeNull();
    expect(countryFromTld('priya@northbeam.io')).toBeNull();
    expect(countryFromTld('nonsense')).toBeNull();
  });
});

describe('chooseMarket', () => {
  const jpMobile = [{ raw: '090-1234-5678', kind: 'mobile' as const }];

  it('switches market when the home one cannot explain the number', () => {
    // '090-1234-5678' read as Singaporean becomes +65 090 1234 5678 — a number
    // belonging to nobody.
    expect(chooseMarket(jpMobile, 'SG', 'JP')).toBe('JP');
  });

  it('keeps the home market when it reads the number exactly', () => {
    // A Singaporean working for a Japanese company still has a Singapore
    // mobile, and .co.jp must not drag it to Tokyo.
    const sgMobile = [{ raw: '9123 4567', kind: 'mobile' as const }];
    expect(chooseMarket(sgMobile, 'SG', 'JP')).toBe('SG');
  });

  it('ignores a hint that is no better than the home market', () => {
    const nonsense = [{ raw: '12345678901234', kind: 'unknown' as const }];
    expect(chooseMarket(nonsense, 'SG', 'JP')).toBe('SG');
  });

  it('is a no-op without a hint', () => {
    expect(chooseMarket(jpMobile, 'SG', null)).toBe('SG');
    expect(chooseMarket(jpMobile, 'JP', 'JP')).toBe('JP');
  });
});

describe('greetingName with an initial-and-surname email', () => {
  it('does not greet a Japanese contact by their family name', () => {
    // 'k.nakamura' is an initial plus a SURNAME. Read the usual way round it
    // makes "Nakamura" the greeting, and the message opens "Hi Nakamura".
    expect(greetingName('Kenji Nakamura', 'k.nakamura@sakura-logistics.co.jp')).toBe('Kenji');
    expect(greetingName('James Wilson', 'j.wilson@acme.com')).toBe('James');
  });

  it('still trusts a full-name email', () => {
    expect(greetingName('Park Ji Hoon', 'jihoon.park@hanyanglogis.co.kr')).toBe('Ji Hoon');
    expect(greetingName('Tan Wei Ming', 'weiming.tan@meridian.com')).toBe('Wei Ming');
  });
});

describe('a surname that is also an address word', () => {
  it('reads Park as a name', () => {
    // 'park' sits in the address word list — as in "business park" — and
    // disqualified one of the three most common surnames in Korea outright.
    expect(parseCard('PARK JI HOON\nSales Team Manager').name).toBe('Park Ji Hoon');
    expect(parseCard('SARAH HILL\nAccount Director').name).toBe('Sarah Hill');
  });

  it('still refuses an actual address line', () => {
    expect(parseCard('12 Jalan Sultan\nSales Director').name).toBe('');
    expect(parseCard('Sunway Tower Block B\nSales Director').name).toBe('');
  });
});

describe('rescuePhrase with no separator to cut on', () => {
  it('recovers a phrase run together with its misread other half', () => {
    // Japanese and Korean cards put the two scripts side by side with only a
    // space between them, so there is no '·' or '|' to split on.
    expect(rescuePhrase('24 2{El Xt Sales Team Manager', /manager|sales/i)).toContain('Sales Team Manager');
    expect(rescuePhrase('x < Lif 4£3t SAKURA LOGISTICS CO., LTD.', /ltd|co/i)).toBe('SAKURA LOGISTICS CO., LTD.');
  });

  it('never trims past the anchor', () => {
    // The anchor word identifies the line; everything after it belongs.
    expect(rescuePhrase('£2 =A! A} HANYANG LOGISTICS CO., LTD.', /ltd/i)).toBe('HANYANG LOGISTICS CO., LTD.');
  });

  it('leaves a clean line alone', () => {
    expect(rescuePhrase('Regional Sales Director', /director/i)).toBe('Regional Sales Director');
  });
});

describe('the Japanese card end to end', () => {
  const card = parseCard(JP_AS_READ);

  it('reads the person and greets them correctly', () => {
    expect(card.name).toBe('Kenji Nakamura');
    expect(card.firstName).toBe('Kenji');
  });

  it('strips the misread kanji from the company', () => {
    expect(card.company).toBe('Sakura Logistics Co., Ltd');
  });

  it('resolves the mobile to Japan, from the email domain alone', () => {
    // The card carries no country code anywhere. Without the .co.jp hint this
    // resolves against the user's home market and produces a dead number.
    const market = chooseMarket(card.phones, 'SG', countryFromTld(card.email));
    expect(market).toBe('JP');
    const best = pickBestPhone(card.phones, market);
    expect(normalizePhone(best!.raw, market).e164).toBe('+819012345678');
  });

  it('prefers the mobile over the office line', () => {
    const best = pickBestPhone(card.phones, 'JP');
    expect(best?.raw).toContain('090');
  });
});

describe('the Korean card end to end', () => {
  const card = parseCard(KR_AS_READ);

  it('reads the person from the card, not from the email', () => {
    expect(card.name).toBe('Park Ji Hoon');
    expect(card.firstName).toBe('Ji Hoon');
  });

  it('recovers the job title the hangul debris used to hide', () => {
    expect(card.title).toContain('Sales Team Manager');
  });

  it('strips the misread hangul from the company', () => {
    expect(card.company).toBe('Hanyang Logistics Co., Ltd');
  });

  it('resolves the mobile to Korea, from the email domain alone', () => {
    const market = chooseMarket(card.phones, 'SG', countryFromTld(card.email));
    expect(market).toBe('KR');
    const best = pickBestPhone(card.phones, market);
    expect(normalizePhone(best!.raw, market).e164).toBe('+821098765432');
  });
});
