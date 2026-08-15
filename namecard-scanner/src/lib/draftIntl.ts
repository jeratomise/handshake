import { CJK_NAME_RE } from './parseCard';
import type { CtaId, DraftInput } from './draft';

/**
 * Japanese and Korean drafts.
 *
 * A first WhatsApp message to someone whose card you took at a trade show is a
 * fixed form in both languages, and getting it wrong is worse than writing in
 * English. Three things drive everything here:
 *
 * **Address by family name, not given name.** English opens "Hi Kenji";
 * Japanese opens 中村様. Writing 健二様 to someone you have just met reads as
 * presumptuous. This is the exact inverse of `greetingName`, which exists to
 * find the *personal* name — so the family name is recovered as the part of
 * the full name that the greeting left behind.
 *
 * **There is no casual register available.** The app offers warm / direct /
 * formal, but all three map onto polite forms here. "Direct" means shorter,
 * never plainer: casual Japanese to a new business contact is not a blunter
 * version of the same message, it is an insult.
 *
 * **The self-introduction comes before anything else.** Both languages open
 * with company-then-name, and both close with a set phrase. Neither is
 * optional, and neither reads as filler the way it would in English.
 */

export type MessageLanguage = 'en' | 'ja' | 'ko';

/** Markets where the contact should be written to in their own language. */
export function languageForCountry(iso: string): MessageLanguage {
  if (iso === 'JP') return 'ja';
  if (iso === 'KR') return 'ko';
  return 'en';
}

export const LANGUAGES: { id: MessageLanguage; label: string; note: string }[] = [
  { id: 'en', label: 'English', note: 'The default everywhere else.' },
  { id: 'ja', label: '日本語', note: 'Business Japanese, addressed as 〜様.' },
  { id: 'ko', label: '한국어', note: 'Business Korean, addressed as 〜님.' },
];

/**
 * The part of the name the greeting left behind.
 *
 * `greetingName` already worked out which tokens are the personal name, so
 * whatever remains is the family name — and it got there using the email and a
 * surname list, which is more than a positional guess.
 */
export function familyName(fullName: string, greeting: string): string {
  const all = fullName.trim().split(/\s+/).filter(Boolean);
  if (all.length <= 1) return all[0] ?? '';

  // '中村 健二' is family-first, so the greeting-complement trick below would
  // return 健二 and open the message 健二様 — the given name, which is the one
  // mistake this module exists to prevent.
  if (CJK_NAME_RE.test(fullName)) return all[0]!;

  const personal = new Set(
    greeting
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean),
  );
  const family = all.filter((token) => !personal.has(token.toLowerCase()));
  // If the greeting covered the whole name, fall back to the conventional
  // position rather than returning nothing to address them by.
  return family.length > 0 ? family.join(' ') : all[all.length - 1]!;
}

/** '中村様' — how the message opens. */
function address(language: MessageLanguage, fullName: string, greeting: string): string {
  if (!fullName.trim()) return language === 'ja' ? 'ご担当者様' : '담당자님';
  // Korean business writing uses the full name plus 님; Japanese uses the
  // family name alone plus 様.
  return language === 'ja' ? `${familyName(fullName, greeting)}様` : `${fullName.trim()}님`;
}

/**
 * The ten quick-pick answers to "where did you meet?", as phrases that slot
 * into the sentence below rather than as literal translations.
 */
const WHERE: Record<string, { ja: string; ko: string }> = {
  'at the conference': { ja: 'カンファレンスで', ko: '컨퍼런스에서' },
  'at the trade show': { ja: '展示会で', ko: '전시회에서' },
  'at the networking event': { ja: '交流会で', ko: '네트워킹 행사에서' },
  'at the client meeting': { ja: '打ち合わせの際に', ko: '미팅 자리에서' },
  'at your office': { ja: '御社にて', ko: '귀사에서' },
  'over coffee': { ja: 'コーヒーをご一緒した際に', ko: '커피를 마시며' },
  'over lunch': { ja: 'ランチをご一緒した際に', ko: '점심을 함께하며' },
  'at the expo booth': { ja: '展示ブースで', ko: '전시 부스에서' },
  'through a mutual contact': { ja: '共通の知人を通じて', ko: '지인의 소개로' },
  'on the flight over': { ja: '往路の機内で', ko: '오는 비행기에서' },
};

/**
 * Anything the user typed themselves stays in their words, quoted.
 *
 * Translating free text is not something this app can do, and a mangled guess
 * at an event name is worse than the name itself. Japanese business writing
 * quotes foreign proper nouns in 「」 as a matter of course.
 */
function whereClause(context: string, language: 'ja' | 'ko'): string {
  const trimmed = context.trim().replace(/[.!,;]+$/, '');
  if (!trimmed) return '';
  const known = WHERE[trimmed.toLowerCase()];
  if (known) return known[language];
  return language === 'ja' ? `「${trimmed}」にて` : `'${trimmed}'에서`;
}

const CTA_JA: Record<CtaId, string> = {
  none: '',
  'keep-posted': 'お役に立てそうな情報がございましたら、随時共有させていただきます。',
  meeting: '来週、15分ほどお時間をいただけないでしょうか。火曜日か水曜日でしたら調整が可能です。',
  'send-info': 'ご関心がおありでしたら、簡単な資料をお送りいたします。お気軽にお申し付けください。',
};

const CTA_KO: Record<CtaId, string> = {
  none: '',
  'keep-posted': '도움이 될 만한 소식이 있으면 계속 공유드리겠습니다.',
  meeting: '다음 주에 15분 정도 시간 내주실 수 있을까요? 화요일이나 수요일이 편합니다.',
  'send-info': '관심 있으시면 간단한 소개 자료를 보내드리겠습니다. 편하게 말씀해 주세요.',
};

function joinParagraphs(parts: (string | null | undefined)[]): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** 'Northwind Logistics の Jerome Ng' — the sender, however much of them we have. */
function selfJa(sender: string, company: string): string {
  if (sender && company) return `${company}の${sender}と申します。`;
  if (sender) return `${sender}と申します。`;
  return '';
}

function selfKo(sender: string, company: string): string {
  if (sender && company) return `${company}의 ${sender}입니다.`;
  if (sender) return `${sender}입니다.`;
  return '';
}

function composeJa(input: DraftInput): string {
  const opening = address('ja', input.contact.name, input.contact.firstName);
  const sender = input.sender.name.trim();
  const company = input.sender.company.trim();
  const self = selfJa(sender, company);
  const where = whereClause(input.context, 'ja');
  const ask = CTA_JA[input.cta];

  if (input.tone === 'formal') {
    return joinParagraphs([
      opening,
      `はじめまして。${self}`,
      where
        ? `先日は${where}名刺を頂戴し、誠にありがとうございました。`
        : '先日は名刺を頂戴し、誠にありがとうございました。',
      'メールよりもこちらのほうがご連絡を取りやすいかと存じ、WhatsAppより失礼いたします。',
      ask,
      '何卒よろしくお願い申し上げます。',
    ]);
  }

  if (input.tone === 'direct') {
    return joinParagraphs([
      opening,
      self,
      where ? `先日は${where}ご挨拶させていただきました。` : '先日はご挨拶させていただきました。',
      'メールに埋もれないよう、WhatsAppでご連絡いたします。',
      ask,
      'よろしくお願いいたします。',
    ]);
  }

  // warm
  return joinParagraphs([
    opening,
    `はじめまして。${self}`,
    where ? `先日は${where}お目にかかれて、大変嬉しく思っております。` : '先日はお目にかかれて、大変嬉しく思っております。',
    '今後やりとりしやすいよう、WhatsAppでご連絡させていただきました。',
    ask,
    'どうぞよろしくお願いいたします。',
  ]);
}

function composeKo(input: DraftInput): string {
  const opening = address('ko', input.contact.name, input.contact.firstName);
  const sender = input.sender.name.trim();
  const company = input.sender.company.trim();
  const self = selfKo(sender, company);
  const where = whereClause(input.context, 'ko');
  const ask = CTA_KO[input.cta];

  if (input.tone === 'formal') {
    return joinParagraphs([
      `${opening}, 안녕하십니까.`,
      self,
      where ? `지난번 ${where} 명함을 주셔서 진심으로 감사드립니다.` : '지난번 명함을 주셔서 진심으로 감사드립니다.',
      '이메일보다 이쪽이 연락드리기 편할 것 같아 WhatsApp으로 인사드립니다.',
      ask,
      '앞으로 잘 부탁드리겠습니다.',
    ]);
  }

  if (input.tone === 'direct') {
    return joinParagraphs([
      `${opening}, 안녕하세요.`,
      self,
      where ? `지난번 ${where} 인사드렸습니다.` : '지난번에 인사드렸습니다.',
      '메일에 묻히지 않도록 WhatsApp으로 연락드립니다.',
      ask,
      '감사합니다.',
    ]);
  }

  // warm
  return joinParagraphs([
    `${opening}, 안녕하세요.`,
    self,
    where ? `지난번 ${where} 뵙게 되어 반가웠습니다.` : '지난번에 뵙게 되어 반가웠습니다.',
    '앞으로 편하게 연락드릴 수 있도록 WhatsApp으로 메시지 드립니다.',
    ask,
    '잘 부탁드립니다.',
  ]);
}

export function composeLocalizedDraft(input: DraftInput, language: 'ja' | 'ko'): string {
  return language === 'ja' ? composeJa(input) : composeKo(input);
}
