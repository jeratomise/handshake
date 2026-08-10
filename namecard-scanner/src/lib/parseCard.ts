import { classifyPhoneLine, type PhoneCandidate } from './phone';

export interface ParsedCard {
  name: string;
  firstName: string;
  title: string;
  company: string;
  email: string;
  website: string;
  phones: PhoneCandidate[];
  /** Cleaned OCR lines, kept so the user can see what we actually read. */
  lines: string[];
}

export const EMPTY_CARD: ParsedCard = {
  name: '',
  firstName: '',
  title: '',
  company: '',
  email: '',
  website: '',
  phones: [],
  lines: [],
};

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
/** Non-global twin of EMAIL_RE: `.test()` on a /g regex carries lastIndex between calls. */
const HAS_EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b|\bhttps?:\/\/[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+\b/gi;
const PHONE_RE = /\+?\d[\d\s().\-–—]{5,}\d/g;

const KNOWN_TLDS = [
  'com', 'net', 'org', 'io', 'co', 'ai', 'app', 'dev', 'biz', 'info', 'me', 'tech', 'sg', 'my', 'id',
  'th', 'vn', 'ph', 'hk', 'tw', 'cn', 'jp', 'kr', 'in', 'ae', 'au', 'nz', 'uk', 'ie', 'de', 'fr',
  'nl', 'es', 'it', 'ch', 'se', 'pl', 'tr', 'za', 'ng', 'ke', 'eg', 'br', 'mx', 'ar', 'us', 'ca',
];
const BARE_DOMAIN_RE = new RegExp(`\\b[A-Za-z0-9-]{2,}(?:\\.[A-Za-z0-9-]{2,})*\\.(?:${KNOWN_TLDS.join('|')})\\b`, 'gi');

const ROLE_WORDS = [
  'ceo', 'cto', 'coo', 'cfo', 'cmo', 'cio', 'cpo', 'chief', 'founder', 'co-founder', 'cofounder',
  'president', 'vp', 'svp', 'evp', 'avp', 'vice president', 'director', 'managing director',
  'head', 'manager', 'lead', 'principal', 'partner', 'associate', 'executive', 'officer',
  'engineer', 'developer', 'architect', 'designer', 'consultant', 'specialist', 'analyst',
  'representative', 'coordinator', 'supervisor', 'administrator', 'strategist', 'advisor',
  'sales', 'business development', 'account', 'marketing', 'operations', 'product', 'project',
  'regional', 'senior', 'junior', 'assistant', 'general', 'country', 'territory', 'bde', 'bdm',
];
const ROLE_RE = new RegExp(`\\b(${ROLE_WORDS.map((w) => w.replace(/[-\s]/g, '[-\\s]')).join('|')})\\b`, 'i');

const COMPANY_SUFFIXES = [
  'pte ltd', 'pte. ltd', 'pte', 'sdn bhd', 'sdn. bhd', 'pty ltd', 'ltd', 'limited', 'llc', 'llp',
  'inc', 'incorporated', 'corp', 'corporation', 'gmbh', 'ag', 'bv', 'b.v', 'nv', 'sas', 's.a',
  'srl', 'spa', 'oy', 'ab', 'as', 'plc', 'co', 'company', 'group', 'holdings', 'ventures',
  'partners', 'technologies', 'technology', 'solutions', 'systems', 'consulting', 'labs',
  'studio', 'studios', 'industries', 'enterprise', 'enterprises', 'international', 'global',
  'kk', 'k.k', 'pt', 'cv', 'tbk',
];
const COMPANY_RE = new RegExp(`(^|[\\s,.])(${COMPANY_SUFFIXES.map((s) => s.replace(/\./g, '\\.')).join('|')})\\b\\.?\\s*$|\\b(technologies|solutions|systems|consulting|holdings|ventures|partners|group|labs|industries)\\b`, 'i');

const ADDRESS_RE = /\b(road|rd\.?|street|st\.?|avenue|ave\.?|lane|drive|dr\.?|boulevard|blvd\.?|highway|jalan|jln|lorong|soi|floor|fl\.?|level|lvl|unit|suite|ste\.?|block|blk|tower|building|bldg|plaza|centre|center|park|estate|p\.?o\.? box|postal|zip)\b|#\d|\b\d{5,6}\b/i;

const NOISE_RE = /^[^A-Za-z0-9]+$/;

/**
 * Marks a line the OCR clearly struggled with.
 *
 * Note this is not "contains non-ASCII". An English-only model does not hand
 * back the characters it failed on — it guesses, and returns plausible ASCII.
 * "区域销售总监" comes back as "Xims8E 2%", which looks perfectly printable. The
 * tell is stray digits and brackets sitting next to real words.
 */
function looksMisread(line: string): boolean {
  return countDigits(line) > 0 || /[[\]{}\\|]|[^\x20-\x7E]/.test(line);
}

const SEGMENT_SPLIT = /[|·•\][/\\]+|\s[-–—]\s/;

/**
 * Rescues the readable phrase from a line the OCR only half-understood.
 *
 * Bilingual cards are the norm in this market, and an English-only model turns
 * the non-Latin half into noise: "区域销售总监 · Regional Sales Director" comes
 * back as "Xims8E 2% - Regional Sales Director". The job title is right there,
 * but the noise carries digits, which used to disqualify the whole line and
 * throw the good half away with the bad.
 *
 * A clean line is returned untouched, so a company genuinely named
 * "Smith / Jones Partners" keeps its slash. Only a line that already looks
 * misread is worth cutting up.
 */
export function rescuePhrase(line: string, anchor: RegExp): string {
  if (!looksMisread(line)) return line;

  const segments = line
    .split(SEGMENT_SPLIT)
    .map((segment) => segment.replace(/[^\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (segments.length < 2) return line;

  // Only accept a segment that is cleaner than what we started with; otherwise
  // splitting has bought nothing and risks losing part of a real name.
  const better = segments.filter((segment) => anchor.test(segment) && !looksMisread(segment));
  if (better.length === 0) return line;

  const letterRatio = (s: string) => (s.match(/[A-Za-z]/g) ?? []).length / Math.max(1, s.length);
  better.sort((a, b) => letterRatio(b) - letterRatio(a));
  return better[0]!;
}

/** Collapses OCR whitespace noise and drops lines that carry no information. */
export function cleanLines(rawText: string): string[] {
  return rawText
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/[|_~^`]+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[\s.,;:•·*\-–—]+|[\s.,;:•·*\-–—]+$/g, '')
        .trim(),
    )
    .filter((line) => line.length >= 2 && !NOISE_RE.test(line) && /[A-Za-z0-9]/.test(line));
}

function uniq(values: string[]): string[] {
  return [...new Set(values)];
}

function countDigits(value: string): number {
  return (value.match(/\d/g) ?? []).length;
}

/** 'JEROME NG' -> 'Jerome Ng'; leaves already-mixed-case names alone. */
export function titleCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/\b(Mc|Mac|O')([a-z])/g, (_, p: string, c: string) => p + c.toUpperCase());
}

/** Words that read as styling, not acronyms, when a card is set in all caps. */
const SUFFIX_WORDS = new Set([
  'pte', 'ltd', 'inc', 'llc', 'llp', 'co', 'corp', 'gmbh', 'sdn', 'bhd', 'pty', 'plc',
  'the', 'and', 'of', 'for', 'group', 'holdings', 'partners', 'ventures', 'labs',
]);

/**
 * Title-cases an all-caps company or job title while leaving acronyms alone:
 * 'ATLAS VENTURES' -> 'Atlas Ventures', but 'IBM' and 'VP' stay as they are.
 */
export function smartTitleCase(value: string): string {
  if (value !== value.toUpperCase()) return value;
  return value
    .split(/\s+/)
    .map((word) => {
      const core = word.replace(/[^A-Za-z]/g, '');
      const isSuffix = SUFFIX_WORDS.has(core.toLowerCase());
      if (!isSuffix && core.length > 0 && core.length <= 3) return word; // acronym
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

const HONORIFICS = /^(mr|mrs|ms|miss|dr|prof|ir|eng|sir|madam|mdm)\.?\s+/i;
const CREDENTIALS = /[,\s]+(cfa|cpa|phd|ph\.d|mba|msc|bsc|ba|ma|md|pmp|cissp|jr|sr|iii|ii)\.?$/i;

function stripNameDecorations(value: string): string {
  let out = value.replace(HONORIFICS, '');
  let previous: string;
  do {
    previous = out;
    out = out.replace(CREDENTIALS, '');
  } while (out !== previous);
  return out.trim();
}

/**
 * Family names that are conventionally written first, so "Tan Wei Ming" is
 * greeted as "Wei Ming" and not as "Tan". Not exhaustive — a fallback for when
 * the email gives us nothing, and the field stays editable either way.
 */
const SURNAME_FIRST = new Set([
  // Chinese / Singaporean-Malaysian romanisations
  'tan', 'lim', 'lee', 'ng', 'wong', 'chan', 'chen', 'wang', 'li', 'zhang', 'liu', 'yang',
  'huang', 'zhao', 'wu', 'zhou', 'xu', 'sun', 'ma', 'zhu', 'hu', 'guo', 'lin', 'he', 'gao',
  'luo', 'zheng', 'liang', 'xie', 'song', 'tang', 'han', 'feng', 'yu', 'dong', 'xiao', 'cheng',
  'cao', 'yuan', 'deng', 'shen', 'zeng', 'peng', 'su', 'jiang', 'cai', 'ding', 'wei', 'xue',
  'ye', 'yan', 'pan', 'du', 'dai', 'xia', 'zhong', 'goh', 'teo', 'ong', 'sim', 'chua', 'koh',
  'yeo', 'toh', 'loh', 'heng', 'seah', 'neo', 'quek', 'tay', 'chia', 'soh', 'foo', 'ang',
  'chong', 'cheong', 'chew', 'kwek', 'yap', 'low', 'leong', 'liew', 'khoo', 'phua', 'seow',
  // Korean
  'kim', 'park', 'choi', 'jung', 'jeong', 'kang', 'cho', 'yoon', 'jang', 'oh', 'seo', 'shin',
  'kwon', 'hwang', 'ahn', 'ryu', 'hong', 'moon', 'bae', 'baek',
  // Japanese
  'sato', 'suzuki', 'takahashi', 'tanaka', 'watanabe', 'ito', 'yamamoto', 'nakamura',
  'kobayashi', 'kato', 'yoshida', 'yamada', 'sasaki', 'matsumoto', 'inoue',
]);

/** Vietnamese names put the personal name last: "Nguyen Van An" is called "An". */
const VIETNAMESE_SURNAMES = new Set([
  'nguyen', 'tran', 'le', 'pham', 'hoang', 'huynh', 'phan', 'vu', 'vo', 'dang', 'bui', 'do',
  'ho', 'ngo', 'duong', 'ly', 'truong', 'dinh', 'lam',
]);

function normalizeToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * Works out what to actually call someone in the opening line.
 *
 * Naming order is not universal, and a follow-up that opens with a stranger's
 * family name lands badly — especially across the APAC markets this is built
 * for. The email local part is the strongest available signal (`weiming.tan@`
 * says the personal name is "Wei Ming"); a surname list covers cards with no
 * email. The result is shown in an editable field, because no heuristic gets
 * every name right.
 */
export function greetingName(fullName: string, email = ''): string {
  const tokens = fullName.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0]!;

  const first = tokens[0]!;
  const last = tokens[tokens.length - 1]!;
  const rest = tokens.slice(1);
  const allButLast = tokens.slice(0, -1);

  const emailTokens = email ? tokensFromEmailLocal(email) : [];
  const lead = emailTokens[0];
  if (lead) {
    // Whichever part of the name the email leads with is the personal name.
    if (lead === normalizeToken(first)) return first;
    if (lead === normalizeToken(rest.join(''))) return rest.join(' ');
    if (lead === normalizeToken(last)) return last;
    if (lead === normalizeToken(allButLast.join(''))) return allButLast.join(' ');
  }

  if (VIETNAMESE_SURNAMES.has(normalizeToken(first))) return last;
  if (SURNAME_FIRST.has(normalizeToken(first))) return rest.join(' ');
  return first;
}

function tokensFromEmailLocal(email: string): string[] {
  const local = email.split('@')[0] ?? '';
  return local
    .split(/[._\-+0-9]+/)
    .filter((t) => t.length >= 2)
    .map((t) => t.toLowerCase());
}

/** 'acme-corp.com' -> 'Acme Corp'. Generic mail hosts are never a company. */
const GENERIC_MAIL_HOSTS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.com.sg', 'hotmail.com', 'outlook.com',
  'live.com', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'qq.com',
  '163.com', '126.com', 'naver.com', 'daum.net',
]);

function companyFromDomain(domain: string): string {
  const host = domain.replace(/^https?:\/\//i, '').replace(/^www\./i, '').split('/')[0] ?? '';
  if (!host || GENERIC_MAIL_HOSTS.has(host.toLowerCase())) return '';
  const label = host.split('.')[0] ?? '';
  if (!label || label.length < 2) return '';
  return label
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function looksLikeName(line: string): boolean {
  if (countDigits(line) > 0) return false;
  if (line.includes('@')) return false;
  if (line.length > 42) return false;
  if (ADDRESS_RE.test(line)) return false;
  if (COMPANY_RE.test(line)) return false;
  if (ROLE_RE.test(line)) return false;

  const words = stripNameDecorations(line).split(/\s+/).filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;

  // Every word should read like a name: letters, maybe a hyphen or apostrophe.
  return words.every((word) => /^[A-Za-z][A-Za-z'’\-.]*$/.test(word));
}

interface Scored {
  line: string;
  index: number;
  score: number;
}

function bestByScore(candidates: Scored[]): string {
  if (candidates.length === 0) return '';
  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  return candidates[0]!.line;
}

/**
 * Turns raw OCR text into the fields a follow-up message actually needs.
 *
 * Business cards have no schema — every one is a different arrangement of the
 * same handful of facts — so this is deliberately a scoring pass rather than a
 * parser. It is expected to be wrong sometimes, which is why the app always
 * shows the result on an editable confirmation screen before anything is sent.
 */
export function parseCard(rawText: string): ParsedCard {
  const lines = cleanLines(rawText);
  const joined = lines.join('\n');

  // --- Contact channels: unambiguous, extract them first. ---
  const emails = uniq(joined.match(EMAIL_RE) ?? []);
  const email = emails[0] ?? '';

  const explicitUrls = uniq(joined.match(URL_RE) ?? []);
  let website = explicitUrls[0] ?? '';
  if (!website) {
    const emailDomains = new Set(emails.map((e) => (e.split('@')[1] ?? '').toLowerCase()));
    const bare = (joined.match(BARE_DOMAIN_RE) ?? []).filter((d) => {
      const lower = d.toLowerCase();
      // A bare domain that only appears as part of an email is not a website.
      return !emailDomains.has(lower) || joined.includes(` ${d}`) || joined.startsWith(d);
    });
    const standalone = bare.filter((d) => !emails.some((e) => e.toLowerCase().includes(d.toLowerCase())));
    website = standalone[0] ?? '';
  }

  // --- Phones, with the label that was printed beside them. ---
  const phones: PhoneCandidate[] = [];
  const phoneLineIndexes = new Set<number>();
  lines.forEach((line, index) => {
    const withoutEmails = line.replace(EMAIL_RE, ' ').replace(URL_RE, ' ');
    const matches = withoutEmails.match(PHONE_RE) ?? [];
    for (const match of matches) {
      const digits = countDigits(match);
      if (digits < 7 || digits > 15) continue;
      phones.push({ raw: match.trim(), kind: classifyPhoneLine(line) });
      phoneLineIndexes.add(index);
    }
  });

  // --- Lines still in play for name / title / company. ---
  const emailTokens = email ? tokensFromEmailLocal(email) : [];
  const structural = new Set<number>();
  lines.forEach((line, index) => {
    if (phoneLineIndexes.has(index)) structural.add(index);
    if (HAS_EMAIL_RE.test(line)) structural.add(index);
  });

  const nameCandidates: Scored[] = [];
  const titleCandidates: Scored[] = [];
  const companyCandidates: Scored[] = [];

  lines.forEach((line, index) => {
    const isStructural = structural.has(index);

    if (!isStructural && looksLikeName(line)) {
      let score = 10;
      // Names are printed at the top of almost every card.
      score += Math.max(0, 6 - index * 2);
      // A title on the following line is the strongest confirmation there is.
      const next = lines[index + 1];
      if (next && ROLE_RE.test(next)) score += 8;
      // Overlap with the email local part is near-proof.
      const words = stripNameDecorations(line).toLowerCase().split(/\s+/);
      const overlap = words.filter((w) => emailTokens.includes(w)).length;
      score += overlap * 7;
      if (line === line.toUpperCase() && line.length > 3) score += 2;
      nameCandidates.push({ line: titleCase(stripNameDecorations(line)), index, score });
    }

    // Rescue first: a bilingual line reads as debris plus the phrase we want,
    // and judging the raw line throws the good half away with the bad.
    const titleLine = rescuePhrase(line, ROLE_RE);
    if (
      !isStructural &&
      ROLE_RE.test(titleLine) &&
      countDigits(titleLine) === 0 &&
      titleLine.length <= 60 &&
      !ADDRESS_RE.test(titleLine)
    ) {
      let score = 10 - index;
      if (!COMPANY_RE.test(titleLine)) score += 4;
      titleCandidates.push({ line: titleLine, index, score });
    }

    const companyLine = rescuePhrase(line, COMPANY_RE);
    if (!isStructural && COMPANY_RE.test(companyLine) && !ADDRESS_RE.test(companyLine) && companyLine.length <= 60) {
      let score = 10 - index;
      if (!ROLE_RE.test(companyLine)) score += 4;
      companyCandidates.push({ line: companyLine, index, score });
    }
  });

  let name = bestByScore(nameCandidates);
  const title = smartTitleCase(bestByScore(titleCandidates));
  let company = smartTitleCase(bestByScore(companyCandidates));

  // Fall back to the email domain when no company line survived.
  if (!company) {
    const domain = email ? (email.split('@')[1] ?? '') : website;
    company = companyFromDomain(domain);
  }

  // Fall back to the email local part when no name line survived.
  if (!name && emailTokens.length >= 2) {
    name = emailTokens
      .slice(0, 2)
      .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
      .join(' ');
  }

  return {
    name,
    firstName: greetingName(name, email),
    title: title === company ? '' : title,
    company,
    email,
    website,
    phones,
    lines,
  };
}
