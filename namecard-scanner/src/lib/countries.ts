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

/**
 * Best-effort home market from the browser locale (e.g. 'en-SG' -> SG).
 * Falls back to Singapore rather than guessing wrong and silently mangling
 * every local number the user scans.
 */
export function guessCountryIso(locales: readonly string[] = []): string {
  for (const locale of locales) {
    const region = locale.split(/[-_]/)[1];
    if (region && BY_ISO.has(region.toUpperCase())) return region.toUpperCase();
  }
  return DEFAULT_COUNTRY_ISO;
}
