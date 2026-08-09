import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { emailVerificationRequired, supabase } from '../lib/supabase';
import { AlertIcon, CardIcon } from './Icons';

type Phase = 'checking' | 'email' | 'code' | 'ready';

interface Props {
  children: (session: Session | null) => React.ReactNode;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_SECONDS = 45;

/**
 * Email verification.
 *
 * Supabase sends one email that carries both a sign-in link and a six-digit
 * code, so we accept either: tapping the link returns to the app already
 * signed in, and typing the code works when switching back to the app is
 * easier than following a link out of a mail client — which, on a phone at a
 * trade show, it usually is.
 *
 * The gate steps aside entirely when Supabase is not configured, or when
 * VITE_REQUIRE_EMAIL_VERIFICATION=false — in both cases the app runs
 * local-only, storing the profile and history on the device.
 */
export default function AuthGate({ children }: Props) {
  const [phase, setPhase] = useState<Phase>(emailVerificationRequired ? 'checking' : 'ready');
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!emailVerificationRequired) return;
    const client = supabase();
    if (!client) return;

    let active = true;

    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setPhase(data.session ? 'ready' : 'email');
    });

    // Fires when the magic link in the email brings the user back here.
    const { data: subscription } = client.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      if (next) {
        setPhase('ready');
        setError(null);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendCode = useCallback(
    async (address: string, isResend = false) => {
      const client = supabase();
      if (!client) return;
      setBusy(true);
      setError(null);
      setNotice(null);

      const { error: sendError } = await client.auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: true,
          // Where the link in the email lands. Must be allow-listed under
          // Authentication -> URL Configuration in the Supabase dashboard.
          emailRedirectTo: window.location.origin,
        },
      });

      setBusy(false);
      if (sendError) {
        setError(sendError.message);
        return;
      }
      setPhase('code');
      setCooldown(RESEND_SECONDS);
      // The heading already names the address on a first send; only a resend
      // needs its own confirmation that something new is on its way.
      setNotice(isResend ? 'New code sent — the previous one no longer works.' : null);
      setTimeout(() => codeRef.current?.focus(), 60);
    },
    [],
  );

  const verify = useCallback(async () => {
    const client = supabase();
    if (!client) return;
    const token = code.replace(/\D/g, '');
    if (token.length < 6) {
      setError('That code should be six digits.');
      return;
    }

    setBusy(true);
    setError(null);
    const { data, error: verifyError } = await client.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);

    if (verifyError) {
      setError(
        /expired/i.test(verifyError.message)
          ? 'That code has expired. Send a new one.'
          : 'That code did not match. Check the email and try again.',
      );
      return;
    }
    setSession(data.session);
    setPhase('ready');
  }, [code, email]);

  if (phase === 'ready') return <>{children(session)}</>;

  const header = (
    <header className="topbar">
      <div className="wordmark">
        <span className="dot" aria-hidden="true" />
        Handshake
        <small>card → chat</small>
      </div>
    </header>
  );

  if (phase === 'checking') {
    return (
      <>
        {header}
        <div className="panel no-bar center" data-testid="auth-checking">
          <div style={{ marginTop: 80, color: 'var(--paper-faint)' }}>
            <CardIcon size={38} />
          </div>
        </div>
      </>
    );
  }

  const emailValid = EMAIL_RE.test(email.trim());

  return (
    <>
      {header}
      <div className="panel reveal" data-testid={phase === 'email' ? 'auth-email' : 'auth-code'}>
        <p className="step-eyebrow">{phase === 'email' ? 'Sign in' : 'Verify'}</p>
        <h1>
          {phase === 'email' ? (
            <>
              Your cards, on <em>every</em> device.
            </>
          ) : (
            <>
              Check your <em>email</em>.
            </>
          )}
        </h1>
        <p className="lede">
          {phase === 'email'
            ? 'Verify your email once and your profile and follow-up history follow you between your phone and your laptop.'
            : `We sent a six-digit code to ${email.trim()}. Enter it below, or just tap the link in the email.`}
        </p>

        {error ? (
          <div className="notice" role="alert" data-testid="auth-error">
            <AlertIcon />
            <span>{error}</span>
          </div>
        ) : null}

        {phase === 'email' ? (
          <label className="field">
            <span className="field-label">Work email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              placeholder="you@company.com"
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && emailValid && !busy) void sendCode(email.trim());
              }}
              data-testid="auth-email-input"
            />
            <p className="field-note">
              Used only to sign you in. Scanned cards are yours alone — row level security means nobody else can read
              them, including other people using this app.
            </p>
          </label>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Six-digit code</span>
              <input
                ref={codeRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={7}
                value={code}
                placeholder="000000"
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !busy) void verify();
                }}
                data-testid="auth-code-input"
                style={{ fontSize: 26, letterSpacing: '0.34em', fontWeight: 600 }}
              />
            </label>
            {notice ? <p className="field-note">{notice}</p> : null}
            <div className="editing-note">
              <button
                type="button"
                className="linkish"
                onClick={() => {
                  setPhase('email');
                  setCode('');
                  setError(null);
                }}
                data-testid="auth-change-email"
              >
                Use a different email
              </button>
              <button
                type="button"
                className="linkish"
                disabled={cooldown > 0 || busy}
                onClick={() => void sendCode(email.trim(), true)}
                data-testid="auth-resend"
                style={cooldown > 0 ? { opacity: 0.45, textDecoration: 'none' } : undefined}
              >
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="bar">
        {phase === 'email' ? (
          <button
            type="button"
            className="btn btn-primary"
            disabled={!emailValid || busy}
            onClick={() => void sendCode(email.trim())}
            data-testid="auth-send"
          >
            {busy ? 'Sending…' : 'Email me a code'}
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy || code.replace(/\D/g, '').length < 6}
            onClick={() => void verify()}
            data-testid="auth-verify"
          >
            {busy ? 'Checking…' : 'Verify and continue'}
          </button>
        )}
      </div>
    </>
  );
}
