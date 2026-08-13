import { COUNTRIES_BY_DIAL_LENGTH, countryByIso, type Country } from './countries';

export type PhoneKind = 'mobile' | 'office' | 'fax' | 'unknown';

export interface PhoneCandidate {
  raw: string;
  kind: PhoneKind;
}

/**
 * How much the country code can be trusted.
 *
 * - `exact`    — the card said so: a '+', a bracketed country code, a trunk
 *                prefix, or a length that only parses one way.
 * - `inferred` — one reading was clearly better than another, but it was a
 *                choice.
 * - `guess`    — nothing matched; the home market was assumed to avoid
 *                refusing a number the user can see is fine.
 *
 * This exists because a `guess` is often a tax or registration number that
 * happens to be phone-shaped, and without a confidence level such a number
 * ranks identically to a real one.
 */
export type PhoneConfidence = 'exact' | 'inferred' | 'guess';

export interface NormalizedPhone {
  ok: boolean;
  /** '+6591234567' — what we show the user. */
  e164: string | null;
  /** '6591234567' — what wa.me wants (digits only, no plus). */
  waDigits: string | null;
  national: string | null;
  countryIso: string | null;
  confidence: PhoneConfidence;
  /** Set when we had to guess; surfaced in the UI so the user can correct it. */
  warning?: string;
  problem?: string;
}

const MIN_E164_DIGITS = 7;
const MAX_E164_DIGITS = 15;

function digitsOf(value: string): string {
  return value.replace(/\D/g, '');
}

function startsWithAny(value: string, prefixes: readonly string[] | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return false;
  return prefixes.some((p) => value.startsWith(p));
}

function fail(problem: string): NormalizedPhone {
  return { ok: false, e164: null, waDigits: null, national: null, countryIso: null, confidence: 'guess', problem };
}

function succeed(
  dial: string,
  national: string,
  iso: string | null,
  confidence: PhoneConfidence,
  warning?: string,
): NormalizedPhone {
  const full = dial + national;
  if (full.length < MIN_E164_DIGITS || full.length > MAX_E164_DIGITS) {
    return fail(`"+${full}" is ${full.length} digits — that is not a valid phone number.`);
  }
  return {
    ok: true,
    e164: `+${full}`,
    waDigits: full,
    national,
    countryIso: iso,
    confidence,
    ...(warning ? { warning } : {}),
  };
}

/**
 * The country whose dial code the digits start with *and* whose national
 * number length they then satisfy. Null when no country fits both.
 */
function strictInternational(digits: string): { country: Country; national: string } | null {
  for (const country of COUNTRIES_BY_DIAL_LENGTH) {
    if (!digits.startsWith(country.dial)) continue;
    const national = digits.slice(country.dial.length);
    // Only accept the match if what remains could plausibly be a real number
    // for that country; otherwise keep looking at shorter dial codes.
    if (country.nsn.includes(national.length)) return { country, national };
  }
  return null;
}

/**
 * True when the digits are a valid international number for *some* country —
 * dial code and national-number length both satisfied.
 *
 * Used to protect the shape-based identifier rules in parseCard: a digit run
 * that really is somebody's phone number must never be discarded, however much
 * it happens to resemble a registration number.
 */
export function hasStrictCountryMatch(digits: string): boolean {
  return strictInternational(digits) !== null;
}

/** Splits an already-international digit string into country code + rest. */
function splitInternational(digits: string): { country: Country | null; national: string } {
  const strict = strictInternational(digits);
  if (strict) return strict;
  // No confident match: fall back to the first prefix match so we still produce
  // a usable +E.164 rather than refusing a number the user can see is fine.
  for (const country of COUNTRIES_BY_DIAL_LENGTH) {
    if (digits.startsWith(country.dial)) {
      return { country, national: digits.slice(country.dial.length) };
    }
  }
  return { country: null, national: digits };
}

/**
 * '(6019) 7314 959' — a bracketed leading group that already carries the
 * country code, which Malaysian and Singaporean cards print constantly. There
 * is no '+', so nothing else here treats it as international, and the digits
 * run together into a length that matches no country.
 *
 * Only a strict match counts. '(415) 555-0123' would otherwise be read as
 * Switzerland ('41') plus a leftover, and a US card would quietly dial Zurich.
 */
function fromBracketedCountryCode(raw: string): NormalizedPhone | null {
  const bracketed = /\((\+?\d{2,6})\)([\d\s().\-–—]*)/.exec(raw);
  if (!bracketed) return null;
  const strict = strictInternational(digitsOf(bracketed[1]! + bracketed[2]!));
  if (!strict) return null;
  return succeed(strict.country.dial, strict.national, strict.country.iso, 'exact');
}

/**
 * Turns whatever was printed on the card into a WhatsApp-dialable number.
 *
 * Business cards write numbers a dozen ways ('+65 9123 4567', '(02) 9876 5432',
 * '012-345 6789', '65 9123 4567'), and WhatsApp silently opens an empty chat if
 * the country code is wrong. Everything here exists to get that one thing right,
 * and anything we had to infer comes back as a `warning` for the user to confirm.
 */
export function normalizePhone(raw: string, defaultIso: string): NormalizedPhone {
  const first = normalizeOnce(raw, defaultIso);
  if (first.ok && first.confidence !== 'guess') return first;

  // A glyph the reader could not make out — a phone icon, or the 携帯 that
  // labels a Japanese mobile — comes back as a stray digit welded to the front
  // of the number: '8 090-1234-5678'. The country code is then computed from
  // one digit too many, and a Tokyo mobile becomes +65 8090 1234 5678.
  //
  // Retried only when the whole string already parsed as a guess, and kept only
  // if dropping the digit reads better. '1 415 555 0123' is a real US number
  // written with its country code, and must not lose it.
  const withoutStray = (raw ?? '').trim().replace(/^\d[\s.\-–—]+/, '');
  if (withoutStray && withoutStray !== (raw ?? '').trim()) {
    const retry = normalizeOnce(withoutStray, defaultIso);
    if (retry.ok && retry.confidence !== 'guess') return retry;
  }
  return first;
}

function normalizeOnce(raw: string, defaultIso: string): NormalizedPhone {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return fail('No phone number.');

  const home = countryByIso(defaultIso);
  const isPlus = trimmed.startsWith('+');
  const bare = digitsOf(trimmed);
  if (!bare) return fail(`"${trimmed}" contains no digits.`);

  // --- Explicitly international: '+65…' or the '00' international prefix. ---
  if (isPlus || bare.startsWith('00')) {
    const digits = isPlus ? bare : bare.slice(2);
    if (digits.length < MIN_E164_DIGITS) return fail(`"${trimmed}" is too short to be a phone number.`);
    const { country, national } = splitInternational(digits);
    if (!country) {
      // Unknown country code, but the shape is valid — pass it through.
      return succeed('', digits, null, 'inferred', 'Unrecognised country code — double-check this one.');
    }
    return succeed(country.dial, national, country.iso, 'exact');
  }

  // --- Country code in brackets: '(6019) 7314 959'. ---
  const bracketed = fromBracketedCountryCode(trimmed);
  if (bracketed) return bracketed;

  // --- Written in local format: apply the home market's rules. ---
  const trunk = home.trunk;
  const afterTrunk = trunk && bare.startsWith(trunk) ? bare.slice(trunk.length) : null;

  // 1. Trunk prefix is unambiguous — an international number never carries one.
  if (afterTrunk !== null && home.nsn.includes(afterTrunk.length)) {
    return succeed(home.dial, afterTrunk, home.iso, 'exact');
  }

  const dialStripped = bare.startsWith(home.dial) ? bare.slice(home.dial.length) : null;
  const dialStrippedValid = dialStripped !== null && home.nsn.includes(dialStripped.length);
  const bareValid = home.nsn.includes(bare.length);

  // 2. Both readings are length-valid (e.g. Indonesian '62812345678'). Break the
  //    tie with mobile prefixes: '62…' is not a mobile prefix, '812…' is.
  if (bareValid && dialStrippedValid) {
    const preferDialStripped =
      !startsWithAny(bare, home.mobilePrefixes) && startsWithAny(dialStripped, home.mobilePrefixes);
    return preferDialStripped
      ? succeed(
          home.dial,
          dialStripped,
          home.iso,
          'inferred',
          `Read as +${home.dial} ${dialStripped} — confirm this is right.`,
        )
      : succeed(home.dial, bare, home.iso, 'exact');
  }

  if (bareValid) return succeed(home.dial, bare, home.iso, 'exact');
  if (dialStrippedValid) return succeed(home.dial, dialStripped, home.iso, 'exact');

  // 3. Nothing matched the home market exactly. It may be a foreign number
  //    printed without a '+', which is common on regional cards.
  const foreign = splitInternational(bare);
  if (foreign.country && foreign.country.nsn.includes(foreign.national.length) && bare.length > (home.nsn[0] ?? 0)) {
    return succeed(
      foreign.country.dial,
      foreign.national,
      foreign.country.iso,
      'inferred',
      `Read as a ${foreign.country.name} number — confirm the country code.`,
    );
  }

  // 4. Last resort: assume the home country and let the user eyeball it.
  if (bare.length >= MIN_E164_DIGITS && bare.length + home.dial.length <= MAX_E164_DIGITS) {
    const withoutTrunk = afterTrunk !== null ? afterTrunk : bare;
    return succeed(
      home.dial,
      withoutTrunk,
      home.iso,
      'guess',
      `Unusual length for ${home.name} — check the country code before sending.`,
    );
  }

  if (bare.length >= MIN_E164_DIGITS && bare.length <= MAX_E164_DIGITS) {
    return succeed('', bare, null, 'guess', 'Could not work out the country code — check it before sending.');
  }

  return fail(`"${trimmed}" does not look like a phone number.`);
}

/** Digit groupings that read naturally at each national-number length. */
const DISPLAY_GROUPS: Record<number, number[]> = {
  7: [3, 4],
  8: [4, 4],
  9: [3, 3, 3],
  10: [3, 3, 4],
  11: [3, 4, 4],
  12: [4, 4, 4],
};

function groupDigits(national: string): string {
  const groups = DISPLAY_GROUPS[national.length];
  if (groups) {
    const out: string[] = [];
    let cursor = 0;
    for (const size of groups) {
      out.push(national.slice(cursor, cursor + size));
      cursor += size;
    }
    if (cursor < national.length) out.push(national.slice(cursor));
    return out.filter(Boolean).join(' ');
  }
  // Unknown length: chunk by four, folding a lonely trailing digit back in.
  const chunks = national.match(/.{1,4}/g) ?? [national];
  if (chunks.length > 1 && chunks[chunks.length - 1]!.length === 1) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1] += tail;
  }
  return chunks.join(' ');
}

/** Groups the E.164 digits for display: +65 9123 4567. */
export function formatE164(e164: string | null): string {
  if (!e164) return '';
  const digits = e164.replace(/\D/g, '');
  const { country, national } = splitInternational(digits);
  if (!country) return `+${digits}`;
  return `+${country.dial} ${groupDigits(national)}`;
}

// Two shapes per label: a whole word ('Mobile', 'Fax'), or the single-letter
// abbreviation that only counts when followed by a colon or dot ('M:', 'F.').
// The abbreviation form deliberately sits outside \b — there is no word
// boundary between ':' and the space that follows it.
const FAX_HINT = /\b(?:fax|telefax)\b|(?:^|\s)f\s*[:.]/i;
const MOBILE_HINT = /\b(?:mobile|mob|hp|h\/p|handphone|cell|cellular|whatsapp|gsm)\b|(?:^|\s)m\s*[:.]/i;
const OFFICE_HINT = /\b(?:tel|telephone|office|off|direct|dd|did|phone|ph)\b|(?:^|\s)[ot]\s*[:.]/i;

/** Classifies a phone by the label printed next to it on the card. */
export function classifyPhoneLine(line: string): PhoneKind {
  if (FAX_HINT.test(line)) return 'fax';
  if (MOBILE_HINT.test(line)) return 'mobile';
  if (OFFICE_HINT.test(line)) return 'office';
  return 'unknown';
}

const KIND_RANK: Record<PhoneKind, number> = { mobile: 0, unknown: 1, office: 2, fax: 99 };
const CONFIDENCE_RANK: Record<PhoneConfidence, number> = { exact: 0, inferred: 1, guess: 2 };

/**
 * Picks the number most likely to be on WhatsApp. Mobile beats office, and a
 * fax number is never chosen — sending an intro to a fax line is the kind of
 * thing that gets an app deleted.
 */
export function pickBestPhone(candidates: readonly PhoneCandidate[], defaultIso: string): PhoneCandidate | null {
  const usable = candidates.filter((c) => c.kind !== 'fax' && normalizePhone(c.raw, defaultIso).ok);
  if (usable.length === 0) return null;

  const home = countryByIso(defaultIso);
  const scored = usable.map((candidate, index) => {
    const normalized = normalizePhone(candidate.raw, defaultIso);
    let rank = KIND_RANK[candidate.kind];
    // An unlabelled number that starts with a mobile prefix is almost certainly
    // a mobile, so treat it as well as an explicitly labelled one — but only
    // when the country code is not itself a guess. A tax or registration
    // number assumed into the home market lands on a "mobile" prefix by pure
    // coincidence, and this boost used to hand it the win.
    if (
      candidate.kind === 'unknown' &&
      normalized.confidence !== 'guess' &&
      normalized.countryIso === home.iso &&
      startsWithAny(normalized.national ?? '', home.mobilePrefixes)
    ) {
      rank = KIND_RANK.mobile + 0.5;
    }
    return { candidate, rank, confidence: CONFIDENCE_RANK[normalized.confidence], index };
  });

  // Confidence breaks ties within a label. Between two unlabelled numbers, the
  // one whose country code the card actually stated beats one we assumed.
  scored.sort((a, b) => a.rank - b.rank || a.confidence - b.confidence || a.index - b.index);
  return scored[0]!.candidate;
}

/** Builds the WhatsApp deep link. wa.me wants digits only — no '+', no spaces. */
export function whatsappUrl(e164: string, message: string): string {
  const digits = e164.replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/**
 * Decides which market a card's numbers should be resolved against.
 *
 * The user's home market is the right default and is trusted unless it cannot
 * explain the number. A Japanese card printing '090-1234-5678' resolved
 * against Singapore becomes +65 090 1234 5678 — a number belonging to nobody,
 * offered with only a mild warning.
 *
 * The hint (usually the email's country TLD) takes over only when the home
 * market produced a guess, so it can rescue a foreign card without breaking
 * the ordinary case: a Singaporean whose employer is Japanese still has their
 * local mobile read as Singaporean, because that reading is exact.
 */
export function chooseMarket(
  candidates: readonly PhoneCandidate[],
  homeIso: string,
  hintIso: string | null,
): string {
  if (!hintIso || hintIso === homeIso) return homeIso;

  const best = pickBestPhone(candidates, homeIso);
  if (!best) return hintIso;

  const athome = normalizePhone(best.raw, homeIso);
  if (athome.ok && athome.confidence !== 'guess') return homeIso;

  // Only switch if the hint actually does better; a second guess is no
  // improvement on the first.
  const athint = normalizePhone(best.raw, hintIso);
  return athint.ok && athint.confidence !== 'guess' ? hintIso : homeIso;
}
