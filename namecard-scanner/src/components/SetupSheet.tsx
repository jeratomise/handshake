import { useState } from 'react';
import { COUNTRIES } from '../lib/countries';
import { TONES, type SenderProfile } from '../lib/draft';
import { supabaseHost } from '../lib/supabase';
import { AlertIcon } from './Icons';

interface Props {
  profile: SenderProfile;
  firstRun: boolean;
  email: string;
  /** Set when a Supabase read or write failed; the app keeps working regardless. */
  syncError: string | null;
  canSignOut: boolean;
  /** True when Supabase is configured but the gate was switched off by env. */
  verificationDisabled: boolean;
  onSave: (profile: SenderProfile) => void;
  onClose: () => void;
  onSignOut: () => void;
}

export default function SetupSheet({
  profile,
  firstRun,
  email,
  syncError,
  canSignOut,
  verificationDisabled,
  onSave,
  onClose,
  onSignOut,
}: Props) {
  const [draft, setDraft] = useState<SenderProfile>(profile);
  const canSave = draft.name.trim().length > 0;

  const patch = (update: Partial<SenderProfile>) => setDraft((current) => ({ ...current, ...update }));

  return (
    <>
      <div className="panel reveal">
        <p className="step-eyebrow">{firstRun ? 'One-time setup' : 'Your details'}</p>
        <h1>
          Who is the message <em>from</em>?
        </h1>
        <p className="lede">
          {supabaseHost
            ? 'This is how you introduce yourself in every draft. Synced to your account so it follows you between devices.'
            : 'This is how you introduce yourself in every draft. Stored on this device only — nothing is uploaded.'}
        </p>

        {verificationDisabled ? (
          <div className="notice" role="status" data-testid="verification-off">
            <AlertIcon />
            <span>
              Email verification is switched off for this deployment, so anyone with the link can use it and nothing
              syncs between devices. Remove <code>VITE_REQUIRE_EMAIL_VERIFICATION=false</code> in Vercel to turn it
              back on.
            </span>
          </div>
        ) : null}

        {syncError ? (
          <div className="notice" role="status" data-testid="sync-error">
            <AlertIcon />
            <span>
              Working offline — {syncError} Your cards are saved on this device and will not be lost.
            </span>
          </div>
        ) : null}

        <label className="field">
          <span className="field-label">Your name</span>
          <input
            type="text"
            value={draft.name}
            placeholder="Jerome Ng"
            onChange={(e) => patch({ name: e.target.value })}
            data-testid="profile-name"
            autoComplete="name"
          />
        </label>

        <label className="field">
          <span className="field-label">Your company</span>
          <input
            type="text"
            value={draft.company}
            placeholder="Northwind Logistics"
            onChange={(e) => patch({ company: e.target.value })}
            data-testid="profile-company"
            autoComplete="organization"
          />
        </label>

        <label className="field">
          <span className="field-label">Home market for phone numbers</span>
          <select
            value={draft.defaultCountry}
            onChange={(e) => patch({ defaultCountry: e.target.value })}
            data-testid="profile-country"
          >
            {COUNTRIES.map((country) => (
              <option key={country.iso} value={country.iso}>
                {country.flag} {country.name} (+{country.dial})
              </option>
            ))}
          </select>
          <p className="field-note">
            Used when a card prints a local number with no country code — the most common reason a WhatsApp link opens
            an empty chat.
          </p>
        </label>

        <label className="field">
          <span className="field-label">Default tone</span>
          <div className="segmented" role="group" aria-label="Default tone">
            {TONES.map((tone) => (
              <button
                key={tone.id}
                type="button"
                aria-pressed={draft.defaultTone === tone.id}
                onClick={() => patch({ defaultTone: tone.id })}
              >
                {tone.label}
              </button>
            ))}
          </div>
        </label>

        {canSignOut ? (
          <>
            <label className="field">
              <span className="field-label">Signed in as</span>
              <p className="field-note" style={{ fontSize: 14.5, marginTop: 0 }} data-testid="signed-in-as">
                {email || 'your account'}
                {supabaseHost ? ` · ${supabaseHost}` : ''}
              </p>
            </label>
            <button type="button" className="btn btn-ghost btn-block" onClick={onSignOut} data-testid="sign-out">
              Sign out on this device
            </button>
            <p className="field-note" style={{ marginTop: 10 }}>
              Signing out clears the cards cached on this phone. They stay in your account.
            </p>
          </>
        ) : null}
      </div>

      <div className="bar">
        {!firstRun ? (
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSave}
          onClick={() => onSave({ ...draft, name: draft.name.trim(), company: draft.company.trim() })}
          data-testid="profile-save"
        >
          {firstRun ? 'Start scanning' : 'Save'}
        </button>
      </div>
    </>
  );
}
