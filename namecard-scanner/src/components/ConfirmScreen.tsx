import { useMemo } from 'react';
import { COUNTRIES } from '../lib/countries';
import { formatE164, normalizePhone } from '../lib/phone';
import { AlertIcon } from './Icons';

export interface ContactForm {
  name: string;
  /** What the message opens with — not always the first word of the name. */
  greeting: string;
  title: string;
  company: string;
  email: string;
  phone: string;
}

interface Props {
  form: ContactForm;
  detected: Partial<Record<keyof ContactForm, boolean>>;
  countryIso: string;
  rawText: string;
  onChange: (patch: Partial<ContactForm>) => void;
  onCountryChange: (iso: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function Field({
  label,
  value,
  detected,
  onChange,
  placeholder,
  type = 'text',
  inputMode,
  testId,
}: {
  label: string;
  value: string;
  detected?: boolean;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  inputMode?: 'text' | 'tel' | 'email';
  testId: string;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {detected ? <i className="auto-dot" aria-hidden="true" /> : null}
        {label}
        {!detected && value === '' ? <em className="missing">not found</em> : null}
      </span>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
        autoComplete="off"
        autoCapitalize={type === 'email' ? 'none' : 'words'}
        spellCheck={false}
      />
    </label>
  );
}

export default function ConfirmScreen({
  form,
  detected,
  countryIso,
  rawText,
  onChange,
  onCountryChange,
  onBack,
  onNext,
}: Props) {
  const phone = useMemo(() => normalizePhone(form.phone, countryIso), [form.phone, countryIso]);
  const canContinue = phone.ok;

  return (
    <>
      <div className="panel reveal">
        <p className="step-eyebrow">Step 3 — Confirm</p>
        <h1>
          Check what we <em>read</em>.
        </h1>
        <p className="lede">
          A dot means we picked it up from the card. Fix anything that looks off — this is what goes into the message.
        </p>

        <Field
          label="Name"
          value={form.name}
          detected={detected.name}
          onChange={(name) => onChange({ name })}
          placeholder="Who did you meet?"
          testId="field-name"
        />

        <label className="field">
          <span className="field-label">Greet them as</span>
          <input
            type="text"
            value={form.greeting}
            placeholder="Wei Ming"
            onChange={(e) => onChange({ greeting: e.target.value })}
            data-testid="field-greeting"
            autoComplete="off"
            autoCapitalize="words"
            spellCheck={false}
          />
          <p className="field-note">
            Your message opens with “Hi {form.greeting.trim() || 'there'}”. Naming order varies — check we picked the
            personal name, not the family name.
          </p>
        </label>

        <label className="field">
          <span className="field-label">
            {detected.phone ? <i className="auto-dot" aria-hidden="true" /> : null}
            WhatsApp number
            {!detected.phone && form.phone === '' ? <em className="missing">not found</em> : null}
          </span>
          <div className="row-2">
            <select
              value={countryIso}
              onChange={(e) => onCountryChange(e.target.value)}
              data-testid="field-country"
              aria-label="Country code"
            >
              {COUNTRIES.map((country) => (
                <option key={country.iso} value={country.iso}>
                  {country.flag} +{country.dial} {country.iso}
                </option>
              ))}
            </select>
            <input
              type="tel"
              inputMode="tel"
              value={form.phone}
              placeholder="9123 4567"
              onChange={(e) => onChange({ phone: e.target.value })}
              data-testid="field-phone"
              autoComplete="off"
            />
          </div>
          {phone.ok ? (
            <p className={`field-note${phone.warning ? ' warn' : ''}`} data-testid="phone-resolved">
              Will open a chat with <strong>{formatE164(phone.e164)}</strong>
              {phone.warning ? ` — ${phone.warning}` : ''}
            </p>
          ) : (
            <p className="field-note warn" data-testid="phone-problem">
              {form.phone ? phone.problem : 'Add the number printed on the card to continue.'}
            </p>
          )}
        </label>

        <Field
          label="Company"
          value={form.company}
          detected={detected.company}
          onChange={(company) => onChange({ company })}
          placeholder="Where do they work?"
          testId="field-company"
        />
        <Field
          label="Job title"
          value={form.title}
          detected={detected.title}
          onChange={(title) => onChange({ title })}
          placeholder="Optional"
          testId="field-title"
        />
        <Field
          label="Email"
          value={form.email}
          detected={detected.email}
          onChange={(email) => onChange({ email })}
          placeholder="Optional"
          type="email"
          inputMode="email"
          testId="field-email"
        />

        {rawText.trim() ? (
          <details className="raw">
            <summary>Everything we read off the card</summary>
            <div className="raw-text">{rawText.trim()}</div>
          </details>
        ) : (
          <div className="notice">
            <AlertIcon />
            <span>
              We could not read any text from that photo. Fill the fields in by hand, or go back and try a sharper,
              better-lit shot.
            </span>
          </div>
        )}
      </div>

      <div className="bar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Rescan
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canContinue}
          data-testid="to-context"
        >
          Looks right
        </button>
      </div>
    </>
  );
}
