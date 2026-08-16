/**
 * Dialling metadata for the markets a BDE realistically works in.
 *
 * `nsn` lists the plausible national-significant-number lengths (digits after
 * the country code, trunk prefix already removed). We use it to tell apart
 * "8 local digits that need a country code" from "10 digits that already
 * carry one" — the single most common way a WhatsApp deep link ends up
 * pointing at nobody.
 */
export interface Country {
  iso: string;
  name: string;
  dial: string;
  /** Trunk prefix stripped before the country code is applied ('' if none). */
  trunk: string;
  nsn: number[];
  flag: string;
  /** Leading digits that mark a mobile line, used to prefer mobile over office. */
  mobilePrefixes?: string[];
}

export const COUNTRIES: Country[] = [
  { iso: 'SG', name: 'Singapore', dial: '65', trunk: '', nsn: [8], flag: '🇸🇬', mobilePrefixes: ['8', '9'] },
  { iso: 'MY', name: 'Malaysia', dial: '60', trunk: '0', nsn: [9, 10], flag: '🇲🇾', mobilePrefixes: ['1'] },
  { iso: 'ID', name: 'Indonesia', dial: '62', trunk: '0', nsn: [9, 10, 11, 12], flag: '🇮🇩', mobilePrefixes: ['8'] },
  { iso: 'TH', name: 'Thailand', dial: '66', trunk: '0', nsn: [8, 9], flag: '🇹🇭', mobilePrefixes: ['6', '8', '9'] },
  { iso: 'VN', name: 'Vietnam', dial: '84', trunk: '0', nsn: [9, 10], flag: '🇻🇳', mobilePrefixes: ['3', '5', '7', '8', '9'] },
  { iso: 'PH', name: 'Philippines', dial: '63', trunk: '0', nsn: [10], flag: '🇵🇭', mobilePrefixes: ['9'] },
  { iso: 'HK', name: 'Hong Kong', dial: '852', trunk: '', nsn: [8], flag: '🇭🇰', mobilePrefixes: ['5', '6', '9'] },
  { iso: 'TW', name: 'Taiwan', dial: '886', trunk: '0', nsn: [9], flag: '🇹🇼', mobilePrefixes: ['9'] },
  { iso: 'CN', name: 'China', dial: '86', trunk: '0', nsn: [11], flag: '🇨🇳', mobilePrefixes: ['1'] },
  { iso: 'JP', name: 'Japan', dial: '81', trunk: '0', nsn: [9, 10], flag: '🇯🇵', mobilePrefixes: ['70', '80', '90'] },
  { iso: 'KR', name: 'South Korea', dial: '82', trunk: '0', nsn: [9, 10], flag: '🇰🇷', mobilePrefixes: ['10'] },
  { iso: 'IN', name: 'India', dial: '91', trunk: '0', nsn: [10], flag: '🇮🇳', mobilePrefixes: ['6', '7', '8', '9'] },
  { iso: 'AE', name: 'UAE', dial: '971', trunk: '0', nsn: [9], flag: '🇦🇪', mobilePrefixes: ['5'] },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966', trunk: '0', nsn: [9], flag: '🇸🇦', mobilePrefixes: ['5'] },
  { iso: 'AU', name: 'Australia', dial: '61', trunk: '0', nsn: [9], flag: '🇦🇺', mobilePrefixes: ['4'] },
  { iso: 'NZ', name: 'New Zealand', dial: '64', trunk: '0', nsn: [8, 9], flag: '🇳🇿', mobilePrefixes: ['2'] },
  { iso: 'GB', name: 'United Kingdom', dial: '44', trunk: '0', nsn: [10], flag: '🇬🇧', mobilePrefixes: ['7'] },
  { iso: 'IE', name: 'Ireland', dial: '353', trunk: '0', nsn: [9], flag: '🇮🇪', mobilePrefixes: ['8'] },
  { iso: 'US', name: 'United States', dial: '1', trunk: '1', nsn: [10], flag: '🇺🇸' },
  { iso: 'CA', name: 'Canada', dial: '1', trunk: '1', nsn: [10], flag: '🇨🇦' },
  { iso: 'DE', name: 'Germany', dial: '49', trunk: '0', nsn: [10, 11], flag: '🇩🇪', mobilePrefixes: ['15', '16', '17'] },
  { iso: 'FR', name: 'France', dial: '33', trunk: '0', nsn: [9], flag: '🇫🇷', mobilePrefixes: ['6', '7'] },
  { iso: 'NL', name: 'Netherlands', dial: '31', trunk: '0', nsn: [9], flag: '🇳🇱', mobilePrefixes: ['6'] },
  { iso: 'ES', name: 'Spain', dial: '34', trunk: '', nsn: [9], flag: '🇪🇸', mobilePrefixes: ['6', '7'] },
  { iso: 'IT', name: 'Italy', dial: '39', trunk: '', nsn: [9, 10], flag: '🇮🇹', mobilePrefixes: ['3'] },
  { iso: 'CH', name: 'Switzerland', dial: '41', trunk: '0', nsn: [9], flag: '🇨🇭', mobilePrefixes: ['7'] },
  { iso: 'SE', name: 'Sweden', dial: '46', trunk: '0', nsn: [7, 8, 9], flag: '🇸🇪', mobilePrefixes: ['7'] },
  { iso: 'PL', name: 'Poland', dial: '48', trunk: '', nsn: [9], flag: '🇵🇱', mobilePrefixes: ['5', '6', '7', '8'] },
  { iso: 'TR', name: 'Türkiye', dial: '90', trunk: '0', nsn: [10], flag: '🇹🇷', mobilePrefixes: ['5'] },
  { iso: 'ZA', name: 'South Africa', dial: '27', trunk: '0', nsn: [9], flag: '🇿🇦', mobilePrefixes: ['6', '7', '8'] },
  { iso: 'NG', name: 'Nigeria', dial: '234', trunk: '0', nsn: [10], flag: '🇳🇬', mobilePrefixes: ['7', '8', '9'] },
  { iso: 'KE', name: 'Kenya', dial: '254', trunk: '0', nsn: [9], flag: '🇰🇪', mobilePrefixes: ['7', '1'] },
  { iso: 'EG', name: 'Egypt', dial: '20', trunk: '0', nsn: [10], flag: '🇪🇬', mobilePrefixes: ['1'] },
  { iso: 'BR', name: 'Brazil', dial: '55', trunk: '0', nsn: [10, 11], flag: '🇧🇷', mobilePrefixes: ['9'] },
  { iso: 'MX', name: 'Mexico', dial: '52', trunk: '0', nsn: [10], flag: '🇲🇽' },
  { iso: 'AR', name: 'Argentina', dial: '54', trunk: '0', nsn: [10], flag: '🇦🇷' },
];

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));

export const DEFAULT_COUNTRY_ISO = 'SG';

export function countryByIso(iso: string | undefined | null): Country {
  return BY_ISO.get((iso ?? '').toUpperCase()) ?? BY_ISO.get(DEFAULT_COUNTRY_ISO)!;
}

/** Longest-dial-code-first, so '65' never shadows '652'-style prefixes. */
export const COUNTRIES_BY_DIAL_LENGTH = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);

/** Enough of the tz database to cover the markets in COUNTRIES. */
const TIMEZONE_TO_ISO: Record<string, string> = {
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY', 'Asia/Kuching': 'MY',
  'Asia/Jakarta': 'ID', 'Asia/Pontianak': 'ID', 'Asia/Makassar': 'ID', 'Asia/Jayapura': 'ID',
  'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN', 'Asia/Saigon': 'VN',
  'Asia/Manila': 'PH',
  'Asia/Hong_Kong': 'HK',
  'Asia/Taipei': 'TW',
  'Asia/Shanghai': 'CN', 'Asia/Chongqing': 'CN', 'Asia/Urumqi': 'CN',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU',
  'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Australia/Darwin': 'AU', 'Australia/Hobart': 'AU',
  'Pacific/Auckland': 'NZ',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Berlin': 'DE', 'Europe/Paris': 'FR',
  'Europe/Amsterdam': 'NL', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE', 'Europe/Warsaw': 'PL', 'Europe/Istanbul': 'TR',
  'Africa/Johannesburg': 'ZA', 'Africa/Lagos': 'NG', 'Africa/Nairobi': 'KE', 'Africa/Cairo': 'EG',
  'America/Sao_Paulo': 'BR', 'America/Bahia': 'BR', 'America/Fortaleza': 'BR', 'America/Manaus': 'BR',
  'America/Mexico_City': 'MX', 'America/Monterrey': 'MX', 'America/Tijuana': 'MX',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US',
  'America/Toronto': 'CA', 'America/Vancouver': 'CA', 'America/Edmonton': 'CA',
  'America/Winnipeg': 'CA', 'America/Halifax': 'CA',
};

function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/**
 * Best-effort home market for the person holding the phone.
 *
 * This only ever decides a number that carries no country evidence of its own:
 * a '+', a bracketed code, a trunk prefix or an email TLD all beat it. But when
 * it is wrong it is wrong silently — a bare local number resolves to a real,
 * dialable, completely incorrect country — so the strongest available signal
 * wins, and Singapore is the last resort rather than the first guess.
 */
export function guessCountryIso(locales: readonly string[] = [], timeZone?: string): string {
  // Time zone first, because it says where the device *is*. A language tag says
  // which language its owner prefers, and plenty of phones across Singapore and
  // Malaysia report 'en-US' or a bare 'en' — which used to make the home market
  // the United States and turn a local '9123 4567' into +1 91234567.
  const zone = timeZone ?? deviceTimeZone();
  const byZone = TIMEZONE_TO_ISO[zone];
  if (byZone) return byZone;

  // A locale that carries a region is still good evidence: 'en-SG' is explicit.
  for (const locale of locales) {
    const region = locale.split(/[-_]/)[1];
    if (region && BY_ISO.has(region.toUpperCase())) return region.toUpperCase();
  }
  return DEFAULT_COUNTRY_ISO;
}

/**
 * Country-code top-level domains, for reading the market off an email address.
 *
 * A card that prints '090-1234-5678' and nothing else is unreadable on its own
 * — the number is only meaningful once you know it is Japanese. The address
 * usually says so, but the email always does: k.nakamura@sakura-logistics.co.jp
 * ends in .jp.
 *
 * Only the last label counts, so '.co.jp' resolves on 'jp' rather than 'co'.
 * Generic-use ccTLDs (.io, .ai, .me, .co) are absent from COUNTRIES, so a
 * startup on a .io domain matches nothing and falls through, which is right.
 */
const TLD_TO_ISO: Record<string, string> = {
  sg: 'SG', my: 'MY', id: 'ID', th: 'TH', vn: 'VN', ph: 'PH', hk: 'HK', tw: 'TW',
  cn: 'CN', jp: 'JP', kr: 'KR', in: 'IN', ae: 'AE', sa: 'SA', au: 'AU', nz: 'NZ',
  uk: 'GB', gb: 'GB', ie: 'IE', de: 'DE', fr: 'FR', nl: 'NL', es: 'ES', it: 'IT',
  ch: 'CH', se: 'SE', pl: 'PL', tr: 'TR', za: 'ZA', ng: 'NG', ke: 'KE', eg: 'EG',
  br: 'BR', mx: 'MX', ar: 'AR', us: 'US', ca: 'CA',
};

/** 'k.nakamura@sakura-logistics.co.jp' -> 'JP'. Null when the TLD says nothing. */
export function countryFromTld(emailOrDomain: string): string | null {
  const host = (emailOrDomain.split('@').pop() ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0]
    ?.replace(/\.$/, '');
  if (!host || !host.includes('.')) return null;
  const tld = host.split('.').pop() ?? '';
  return TLD_TO_ISO[tld] ?? null;
}
