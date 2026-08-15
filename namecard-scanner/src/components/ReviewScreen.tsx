import { useState } from 'react';
import { formatE164 } from '../lib/phone';
import { LANGUAGES, type MessageLanguage } from '../lib/draft';
import { TicksIcon, WhatsAppIcon } from './Icons';

interface Props {
  name: string;
  company: string;
  title: string;
  e164: string | null;
  message: string;
  edited: boolean;
  onMessageChange: (value: string) => void;
  onRegenerate: () => void;
  onBack: () => void;
  onSend: () => void;
  language: MessageLanguage;
  /** True when the language came from the contact's market, not from a tap. */
  languageAuto: boolean;
  onLanguageChange: (language: MessageLanguage) => void;
}

export default function ReviewScreen({
  name,
  company,
  title,
  e164,
  message,
  edited,
  onMessageChange,
  onRegenerate,
  onBack,
  onSend,
  language,
  languageAuto,
  onLanguageChange,
}: Props) {
  const [editing, setEditing] = useState(false);
  const subtitle = [title, company].filter(Boolean).join(' · ');

  return (
    <>
      <div className="panel reveal">
        <p className="step-eyebrow">Step 5 — Review</p>
        <h1>
          Read it before you <em>send</em>.
        </h1>
        <p className="lede">
          Nothing has been sent yet. WhatsApp will open with this message typed out, and you still tap send yourself.
        </p>

        <div className="recap">
          <div className="who">{name.trim() || 'Your new contact'}</div>
          {subtitle ? <div className="what">{subtitle}</div> : null}
          <div className="num">{formatE164(e164)}</div>
        </div>

        {/* Placed above the message, not buried in settings: a BDE who does not
            read Japanese needs to see at a glance which language is about to
            go out, and be able to change it in one tap. */}
        <div className="lang-row" data-testid="language-row">
          {LANGUAGES.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chip${language === option.id ? ' on' : ''}`}
              aria-pressed={language === option.id}
              onClick={() => onLanguageChange(option.id)}
              data-testid={`language-${option.id}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {language !== 'en' && languageAuto ? (
          <p className="field-note" data-testid="language-note">
            Written in {LANGUAGES.find((l) => l.id === language)?.label} because this is a{' '}
            {language === 'ja' ? 'Japanese' : 'Korean'} number. {LANGUAGES.find((l) => l.id === language)?.note} Switch
            to English above if you would rather.
          </p>
        ) : null}

        {editing ? (
          <label className="field">
            <span className="field-label">Your message</span>
            <textarea
              value={message}
              onChange={(e) => onMessageChange(e.target.value)}
              data-testid="message-editor"
              aria-label="Message to send"
              rows={8}
            />
          </label>
        ) : (
          <div className="chat" data-testid="message-preview">
            <div className="bubble">
              {message}
              <span className="meta">
                now <TicksIcon />
              </span>
            </div>
          </div>
        )}

        <div className="editing-note">
          <span>
            {message.trim().length} characters
            {edited ? ' · edited by you' : ' · drafted for you'}
          </span>
          <span>
            <button type="button" className="linkish" onClick={() => setEditing((v) => !v)} data-testid="toggle-edit">
              {editing ? 'Done editing' : 'Edit message'}
            </button>
            {edited ? (
              <>
                {' '}
                <button type="button" className="linkish" onClick={onRegenerate} data-testid="regenerate">
                  Reset
                </button>
              </>
            ) : null}
          </span>
        </div>
      </div>

      <div className="bar">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="btn btn-wa"
          onClick={onSend}
          disabled={!message.trim() || !e164}
          data-testid="send-whatsapp"
        >
          <WhatsAppIcon />
          Open in WhatsApp
        </button>
      </div>
    </>
  );
}
