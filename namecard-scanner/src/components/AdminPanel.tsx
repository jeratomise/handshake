import { useCallback, useState } from 'react';
import { loadAdminState, saveAdminState, type AdminState } from '../lib/adminApi';
import { supabaseHost } from '../lib/supabase';
import { AlertIcon, BackIcon, CheckIcon } from './Icons';

/** Models worth offering, cheapest-capable first. */
// Every id here was checked against the live OpenRouter catalogue and accepts
// image input. A model id that does not exist fails at the moment a BDE taps
// the button, not here, so guessing one is worse than offering fewer.
const MODELS = [
  { id: 'google/gemini-3.7-flash', label: 'Gemini 3.7 Flash', note: 'Best cost-to-accuracy for cards. Start here.' },
  { id: 'anthropic/claude-sonnet-5', label: 'Claude Sonnet 5', note: 'Best on messy layouts and structure. Pricier.' },
  { id: 'qwen/qwen3-vl-235b-a22b-instruct', label: 'Qwen3-VL 235B', note: 'Cheap, and strong on Chinese and Korean cards.' },
  { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 mini', note: 'Solid all-rounder.' },
];

interface Props {
  onExit: () => void;
}

export default function AdminPanel({ onExit }: Props) {
  const [password, setPassword] = useState('');
  const [state, setState] = useState<AdminState | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const signIn = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await loadAdminState(password);
    setBusy(false);
    if (!result.ok || !result.state) {
      setError(result.error ?? 'Could not sign in.');
      return;
    }
    setState(result.state);
  }, [password]);

  const save = useCallback(
    async (patch: Partial<AdminState['settings']>, key?: string) => {
      if (!state) return;
      // Optimistic: a toggle that waits on a round trip feels broken on mobile.
      const previous = state;
      setState({ ...state, settings: { ...state.settings, ...patch } });
      setBusy(true);
      setError(null);
      setSaved(false);

      const result = await saveAdminState(password, patch, key);
      setBusy(false);

      if (!result.ok || !result.state) {
        setState(previous);
        setError(result.error ?? 'Could not save.');
        return;
      }
      setState(result.state);
      setApiKey('');
      setSaved(true);
      setTimeout(() => setSaved(false), 2400);
    },
    [password, state],
  );

  const header = (
    <header className="topbar">
      <button type="button" className="icon-btn" onClick={onExit} aria-label="Back to the app">
        <BackIcon />
      </button>
      <div className="wordmark" style={{ marginLeft: 4 }}>
        Admin
        <small>{supabaseHost || 'not configured'}</small>
      </div>
    </header>
  );

  if (!state) {
    return (
      <>
        {header}
        <div className="panel reveal" data-testid="admin-login">
          <p className="step-eyebrow">Restricted</p>
          <h1>
            Admin <em>settings</em>.
          </h1>
          <p className="lede">Configuration for this deployment. Not part of the app your team uses.</p>

          {error ? (
            <div className="notice" role="alert" data-testid="admin-error">
              <AlertIcon />
              <span>{error}</span>
            </div>
          ) : null}

          <label className="field">
            <span className="field-label">Admin password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              placeholder="••••••••"
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && password && !busy) void signIn();
              }}
              data-testid="admin-password"
            />
            <p className="field-note">
              Checked on the server, never in this page. Set it as <code>ADMIN_PASSWORD</code> under Edge Functions →
              Secrets in Supabase.
            </p>
          </label>
        </div>

        <div className="bar">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!password || busy}
            onClick={() => void signIn()}
            data-testid="admin-signin"
          >
            {busy ? 'Checking…' : 'Unlock'}
          </button>
        </div>
      </>
    );
  }

  const { settings, openrouter } = state;

  return (
    <>
      {header}
      <div className="panel reveal" data-testid="admin-panel">
        <p className="step-eyebrow">Deployment</p>
        <h1>
          Runtime <em>settings</em>.
        </h1>
        <p className="lede">Changes apply to every device the next time the app loads. No redeploy needed.</p>

        {error ? (
          <div className="notice" role="alert" data-testid="admin-error">
            <AlertIcon />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="admin-row">
          <div className="admin-row-text">
            <h3>Require email verification</h3>
            <p>
              {settings.requireEmailVerification
                ? 'Users verify their email before the scanner opens, and their history syncs across devices.'
                : 'Anyone with the link goes straight to the scanner. Nothing syncs — history stays on each device.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.requireEmailVerification}
            aria-label="Require email verification"
            className="toggle"
            disabled={busy}
            onClick={() => void save({ requireEmailVerification: !settings.requireEmailVerification })}
            data-testid="toggle-verification"
          >
            <span />
          </button>
        </div>

        <div className="admin-row">
          <div className="admin-row-text">
            <h3>AI re-read button</h3>
            <p>
              Every scan still uses on-device OCR. This adds a "Re-read this card with AI" button to the confirm
              screen, for the cards it gets wrong. Needs a key below. That one card is sent to OpenRouter, so it does
              leave the device — the button says so, and it is never automatic.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.aiOcrEnabled}
            aria-label="AI re-read button"
            className="toggle"
            onClick={() => void save({ aiOcrEnabled: !settings.aiOcrEnabled })}
            disabled={busy || (!settings.aiOcrEnabled && !openrouter.configured)}
            data-testid="toggle-ai-ocr"
          >
            <span />
          </button>
        </div>

        <label className="field">
          <span className="field-label">OpenRouter API key</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={apiKey}
            placeholder={openrouter.configured ? openrouter.hint : 'sk-or-v1-…'}
            onChange={(e) => setApiKey(e.target.value)}
            data-testid="admin-openrouter-key"
          />
          <p className="field-note">
            Stored where only the server can read it, and never sent back to this page — which is why the box shows a
            masked hint rather than the key. The browser never holds it: re-reads go through an edge function that
            calls OpenRouter, so a key here cannot be lifted out of the page and drained.
          </p>
        </label>

        <div className="row-2" style={{ marginBottom: 18 }}>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !apiKey.trim()}
            onClick={() => void save({}, apiKey.trim())}
            data-testid="admin-save-key"
          >
            Save key
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy || !openrouter.configured}
            onClick={() => void save({}, 'CLEAR')}
            data-testid="admin-clear-key"
          >
            Remove key
          </button>
        </div>

        <label className="field">
          <span className="field-label">Model</span>
          <select
            value={settings.aiOcrModel}
            onChange={(e) => void save({ aiOcrModel: e.target.value })}
            disabled={busy}
            data-testid="admin-model"
          >
            {MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
            {MODELS.every((m) => m.id !== settings.aiOcrModel) ? (
              <option value={settings.aiOcrModel}>{settings.aiOcrModel}</option>
            ) : null}
          </select>
          <p className="field-note">{MODELS.find((m) => m.id === settings.aiOcrModel)?.note ?? 'Custom model.'}</p>
        </label>

        {saved ? (
          <p className="field-note" style={{ color: 'var(--signal)' }} data-testid="admin-saved">
            Saved.
          </p>
        ) : null}
      </div>

      <div className="bar">
        <button type="button" className="btn btn-ghost" onClick={onExit} data-testid="admin-exit">
          Back to the app
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void save({})}>
          {busy ? 'Working…' : saved ? 'Saved' : 'Refresh'}
          {saved && !busy ? <CheckIcon size={17} /> : null}
        </button>
      </div>
    </>
  );
}
