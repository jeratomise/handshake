import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ConfirmScreen, { type ContactForm } from './components/ConfirmScreen';
import ContextScreen from './components/ContextScreen';
import ReadingScreen from './components/ReadingScreen';
import ReviewScreen from './components/ReviewScreen';
import ScanScreen from './components/ScanScreen';
import SentScreen from './components/SentScreen';
import SetupSheet from './components/SetupSheet';
import { GearIcon } from './components/Icons';
import { buildVCard, composeDraft, type CtaId, type SenderProfile, type Tone } from './lib/draft';
import type { OcrProgress } from './lib/ocr';
import { readCardText } from './lib/ocr';
import { EMPTY_CARD, greetingName, parseCard } from './lib/parseCard';
import { normalizePhone, pickBestPhone, whatsappUrl } from './lib/phone';
import { prepareImage } from './lib/preprocess';
import { appendLog, countToday, loadLog, loadProfile, profileIsComplete, saveProfile, type LogEntry } from './lib/storage';

type Step = 'scan' | 'reading' | 'confirm' | 'context' | 'review' | 'sent';

const RAIL_INDEX: Record<Step, number> = { scan: 0, reading: 0, confirm: 1, context: 2, review: 3, sent: 4 };

const BLANK_FORM: ContactForm = { name: '', greeting: '', title: '', company: '', email: '', phone: '' };

export default function App() {
  const [profile, setProfile] = useState<SenderProfile>(loadProfile);
  const [showSetup, setShowSetup] = useState(() => !profileIsComplete(loadProfile()));
  const [log, setLog] = useState<LogEntry[]>(loadLog);

  const [step, setStep] = useState<Step>('scan');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<OcrProgress>({ stage: 'loading-engine', ratio: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [rawText, setRawText] = useState('');

  const [form, setForm] = useState<ContactForm>(BLANK_FORM);
  const [detected, setDetected] = useState<Partial<Record<keyof ContactForm, boolean>>>({});
  const [countryIso, setCountryIso] = useState(profile.defaultCountry);

  const [context, setContext] = useState('');
  const [tone, setTone] = useState<Tone>(profile.defaultTone);
  const [cta, setCta] = useState<CtaId>(profile.defaultCta);
  /** Null while the user is happy with the generated draft. */
  const [override, setOverride] = useState<string | null>(null);

  const lastUrlRef = useRef<string | null>(null);
  /** Once the user edits the greeting themselves, we stop re-deriving it. */
  const greetingTouchedRef = useRef(false);
  const previewUrlRef = useRef<string | null>(null);

  // Object URLs are revoked as soon as they are replaced, so a long session of
  // back-to-back scans does not sit on a pile of decoded images.
  useEffect(() => {
    previewUrlRef.current = previewUrl;
  }, [previewUrl]);
  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  const phone = useMemo(() => normalizePhone(form.phone, countryIso), [form.phone, countryIso]);

  const generated = useMemo(
    () =>
      composeDraft({
        contact: {
          firstName: form.greeting.trim(),
          name: form.name.trim(),
          company: form.company.trim(),
        },
        sender: { name: profile.name, company: profile.company },
        context,
        tone,
        cta,
      }),
    [form.greeting, form.name, form.company, profile.name, profile.company, context, tone, cta],
  );

  const message = override ?? generated;

  const resetCard = useCallback(() => {
    setForm(BLANK_FORM);
    setDetected({});
    greetingTouchedRef.current = false;
    setRawText('');
    setContext('');
    setOverride(null);
    setTone(profile.defaultTone);
    setCta(profile.defaultCta);
    setCountryIso(profile.defaultCountry);
    setError(null);
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
    setStep('scan');
  }, [profile.defaultCountry, profile.defaultCta, profile.defaultTone]);

  const handleCapture = useCallback(
    async (blob: Blob) => {
      setError(null);
      setProgress({ stage: 'loading-engine', ratio: 0 });
      setStep('reading');

      try {
        const prepared = await prepareImage(blob);
        if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
        previewUrlRef.current = prepared.previewUrl;
        setPreviewUrl(prepared.previewUrl);

        const text = await readCardText(prepared.canvas, setProgress);
        const card = text.trim() ? parseCard(text) : EMPTY_CARD;

        // Resolve the phone against the user's home market first, then let an
        // explicit country code on the card override it.
        const best = pickBestPhone(card.phones, profile.defaultCountry);
        const resolved = best ? normalizePhone(best.raw, profile.defaultCountry) : null;

        greetingTouchedRef.current = false;
        setRawText(text);
        setCountryIso(resolved?.countryIso ?? profile.defaultCountry);
        setForm({
          name: card.name,
          greeting: card.firstName,
          title: card.title,
          company: card.company,
          email: card.email,
          phone: best?.raw ?? '',
        });
        setDetected({
          name: Boolean(card.name),
          greeting: Boolean(card.firstName),
          title: Boolean(card.title),
          company: Boolean(card.company),
          email: Boolean(card.email),
          phone: Boolean(best),
        });
        setStep('confirm');
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Something went wrong reading that card.');
        setStep('scan');
      }
    },
    [profile.defaultCountry],
  );

  const handleSend = useCallback(() => {
    if (!phone.e164) return;
    const url = whatsappUrl(phone.e164, message);
    lastUrlRef.current = url;

    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: form.name.trim(),
      company: form.company.trim(),
      phone: phone.e164,
      context,
      sentAt: Date.now(),
    };
    setLog(appendLog(entry));
    setStep('sent');

    // A new tab keeps this session alive so the user can come straight back for
    // the next card. If the browser blocks it, navigate in place instead.
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.href = url;
  }, [context, form.company, form.name, message, phone.e164]);

  const reopenWhatsApp = useCallback(() => {
    const url = lastUrlRef.current;
    if (!url) return;
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (!opened) window.location.href = url;
  }, []);

  const saveContact = useCallback(() => {
    const vcard = buildVCard({
      name: form.name.trim() || 'New contact',
      firstName: form.greeting.trim(),
      title: form.title.trim(),
      company: form.company.trim(),
      email: form.email.trim(),
      phone: phone.e164 ?? '',
    });
    const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(form.name.trim() || 'contact').replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')}.vcf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
  }, [form.company, form.email, form.greeting, form.name, form.title, phone.e164]);

  const persistProfile = useCallback((next: SenderProfile) => {
    setProfile(next);
    saveProfile(next);
    setCountryIso(next.defaultCountry);
    setTone(next.defaultTone);
    setCta(next.defaultCta);
    setShowSetup(false);
  }, []);

  const railAt = RAIL_INDEX[step];
  const today = countToday(log);

  return (
    <div className="app">
      <header className="topbar">
        <div className="wordmark">
          <span className="dot" aria-hidden="true" />
          Handshake
          <small>card → chat</small>
        </div>
        {today > 0 && !showSetup ? (
          <div className="tally" aria-label={`${today} cards followed up today`}>
            <b>{today}</b> today
          </div>
        ) : null}
        {!showSetup ? (
          <button type="button" className="icon-btn" onClick={() => setShowSetup(true)} aria-label="Your details">
            <GearIcon />
          </button>
        ) : null}
      </header>

      {!showSetup ? (
        <div className="rail" aria-hidden="true">
          {[0, 1, 2, 3].map((index) => (
            <span key={index} className={railAt > index ? 'done' : railAt === index ? 'now' : ''} />
          ))}
        </div>
      ) : null}

      {showSetup ? (
        <SetupSheet
          profile={profile}
          firstRun={!profileIsComplete(profile)}
          onSave={persistProfile}
          onClose={() => setShowSetup(false)}
        />
      ) : step === 'scan' ? (
        <ScanScreen onCapture={handleCapture} error={error} />
      ) : step === 'reading' ? (
        <ReadingScreen previewUrl={previewUrl} progress={progress} />
      ) : step === 'confirm' ? (
        <ConfirmScreen
          form={form}
          detected={detected}
          countryIso={countryIso}
          rawText={rawText}
          onChange={(patch) =>
            setForm((current) => {
              const next = { ...current, ...patch };
              if (patch.greeting !== undefined) greetingTouchedRef.current = true;
              // Correcting a misread name should re-derive who we greet, unless
              // the user has already set that themselves.
              if (patch.name !== undefined && !greetingTouchedRef.current) {
                next.greeting = greetingName(next.name, next.email);
              }
              return next;
            })
          }
          onCountryChange={setCountryIso}
          onBack={resetCard}
          onNext={() => setStep('context')}
        />
      ) : step === 'context' ? (
        <ContextScreen
          firstName={form.greeting.trim()}
          context={context}
          tone={tone}
          cta={cta}
          onContextChange={setContext}
          onToneChange={setTone}
          onCtaChange={setCta}
          onBack={() => setStep('confirm')}
          onNext={() => setStep('review')}
        />
      ) : step === 'review' ? (
        <ReviewScreen
          name={form.name}
          company={form.company}
          title={form.title}
          e164={phone.e164}
          message={message}
          edited={override !== null}
          onMessageChange={setOverride}
          onRegenerate={() => setOverride(null)}
          onBack={() => setStep('context')}
          onSend={handleSend}
        />
      ) : (
        <SentScreen
          name={form.name}
          todayCount={today}
          onSaveContact={saveContact}
          onReopen={reopenWhatsApp}
          onNext={resetCard}
        />
      )}
    </div>
  );
}
