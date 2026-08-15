import { composeLocalizedDraft, type MessageLanguage } from './draftIntl';

export type Tone = 'warm' | 'direct' | 'formal';
export type CtaId = 'none' | 'keep-posted' | 'meeting' | 'send-info';

export interface SenderProfile {
  name: string;
  company: string;
  role: string;
  defaultCountry: string;
  defaultTone: Tone;
  defaultCta: CtaId;
}

export interface Contact {
  name: string;
  firstName: string;
  title: string;
  company: string;
  email: string;
  phone: string;
}

export interface DraftInput {
  /** Which language the message is written in. Defaults to English. */
  language?: MessageLanguage;
  contact: Pick<Contact, 'firstName' | 'name' | 'company'>;
  sender: Pick<SenderProfile, 'name' | 'company'>;
  /** Free text or a quick-pick phrase. Empty means the user skipped the question. */
  context: string;
  tone: Tone;
  cta: CtaId;
}

export const TONES: { id: Tone; label: string; blurb: string }[] = [
  { id: 'warm', label: 'Warm', blurb: 'Friendly, human, low pressure' },
  { id: 'direct', label: 'Direct', blurb: 'Short and to the point' },
  { id: 'formal', label: 'Formal', blurb: 'Polished, for senior contacts' },
];

export const CTAS: { id: CtaId; label: string; text: string }[] = [
  { id: 'none', label: 'No ask', text: '' },
  { id: 'keep-posted', label: 'Keep in touch', text: "I'll keep you posted if anything useful comes up on our side." },
  { id: 'meeting', label: 'Ask for 15 min', text: 'Would you be open to 15 minutes next week? Tuesday or Wednesday both work my end.' },
  { id: 'send-info', label: 'Offer to send info', text: 'Happy to send over a short overview if that would be useful — just say the word.' },
];

/** Quick-pick answers to "where did you meet?", written as ready-made phrases. */
export const MEETING_CONTEXTS: string[] = [
  'at the conference',
  'at the trade show',
  'at the networking event',
  'at the client meeting',
  'at your office',
  'over coffee',
  'over lunch',
  'at the expo booth',
  'through a mutual contact',
  'on the flight over',
];

const LEADING_PREPOSITIONS =
  /^(at|in|on|during|after|before|via|through|from|over|while|last|this|yesterday|today|earlier|back)\b/i;

/**
 * Makes whatever the user typed slot into "…meeting you ___." grammatically.
 * 'the SaaS Summit' becomes 'at the SaaS Summit'; 'at Web Summit' is left alone.
 */
export function contextPhrase(input: string): string {
  const trimmed = (input ?? '').trim().replace(/\s+/g, ' ').replace(/[.!,;]+$/, '');
  if (!trimmed) return '';
  if (LEADING_PREPOSITIONS.test(trimmed)) return trimmed;
  return `at ${trimmed}`;
}

function ctaText(id: CtaId): string {
  return CTAS.find((c) => c.id === id)?.text ?? '';
}

function joinParagraphs(parts: (string | null | undefined)[]): string {
  return parts
    .map((p) => (p ?? '').trim())
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Builds the message the user will review.
 *
 * Every slot degrades gracefully: a card that only yielded a phone number still
 * produces a sendable message, because a BDE standing in a conference hall is
 * not going to stop and fill in a form.
 */
export function composeDraft(input: DraftInput): string {
  // A Japanese or Korean contact gets written to in their own language, and
  // that is a different message rather than this one translated: it opens with
  // the family name, introduces the sender before anything else, and closes
  // with a set phrase. None of that survives a word-for-word rendering.
  if (input.language === 'ja' || input.language === 'ko') {
    return composeLocalizedDraft(input, input.language);
  }

  const first = (input.contact.firstName || input.contact.name || '').trim();
  const greetingName = first || 'there';
  const sender = input.sender.name.trim();
  const senderCo = input.sender.company.trim();
  const where = contextPhrase(input.context);
  const ask = ctaText(input.cta);

  const from = sender && senderCo ? `${sender} from ${senderCo}` : sender || senderCo;

  if (input.tone === 'formal') {
    const intro = from
      ? `This is ${from}.`
      : 'I hope this message finds you well.';
    const met = where
      ? `It was a pleasure meeting you ${where}.`
      : 'It was a pleasure meeting you.';
    return joinParagraphs([
      `Dear ${greetingName},`,
      `${intro} ${met}`,
      'I hope you do not mind me reaching out here — I find WhatsApp easier than email for staying in touch.',
      ask,
    ]);
  }

  if (input.tone === 'direct') {
    const opener = from ? `Hi ${greetingName}, ${from} here.` : `Hi ${greetingName}.`;
    const met = where ? `We met ${where}.` : 'Good to connect.';
    return joinParagraphs([
      `${opener} ${met}`,
      'Moving us over to WhatsApp so nothing gets buried in email.',
      ask,
    ]);
  }

  // warm
  const opener = from ? `Hi ${greetingName} — it's ${from}.` : `Hi ${greetingName}!`;
  const met = where ? `Really enjoyed meeting you ${where}.` : 'Great to connect earlier.';
  return joinParagraphs([
    `${opener} ${met}`,
    'Saving your number here so we can keep it easy to stay in touch.',
    ask,
  ]);
}

/** A vCard so the BDE can drop the contact straight into their phone. */
export function buildVCard(contact: Contact): string {
  const nameParts = contact.name.split(/\s+/).filter(Boolean);
  const last = nameParts.length > 1 ? nameParts[nameParts.length - 1]! : '';
  const given = nameParts.length > 1 ? nameParts.slice(0, -1).join(' ') : contact.name;

  const lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    `N:${last};${given};;;`,
    `FN:${contact.name}`,
    contact.company ? `ORG:${contact.company}` : '',
    contact.title ? `TITLE:${contact.title}` : '',
    contact.phone ? `TEL;TYPE=CELL:${contact.phone}` : '',
    contact.email ? `EMAIL;TYPE=WORK:${contact.email}` : '',
    'END:VCARD',
  ];
  return lines.filter(Boolean).join('\r\n');
}

export { languageForCountry, familyName, LANGUAGES, type MessageLanguage } from './draftIntl';
