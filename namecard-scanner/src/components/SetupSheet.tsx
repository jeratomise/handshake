import { useState } from 'react';
import { COUNTRIES } from '../lib/countries';
import { TONES, type SenderProfile } from '../lib/draft';

interface Props {
  profile: SenderProfile;
  firstRun: boolean;
  onSave: (profile: SenderProfile) => void;
  onClose: () => void;
}

export default function SetupSheet({ profile, firstRun, onSave, onClose }: Props) {
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
          This is how you introduce yourself in every draft. Stored on this device only — nothing is uploaded.
        </p>

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
