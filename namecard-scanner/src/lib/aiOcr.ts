import { supabase, supabaseHost } from './supabase';
import { normalizePhone } from './phone';
import { greetingName } from './parseCard';
import type { ContactForm } from '../components/ConfirmScreen';

/**
 * The "Re-read with AI" path.
 *
 * Tesseract runs first on every card and is what the user normally sees. This
 * is the escape hatch for the cards it gets wrong — a bilingual name, a phone
 * glyph it read as a digit, a country code printed only in brackets.
 *
 * The request goes to our own edge function, never to OpenRouter directly. The
 * provider key must not reach the browser, and the call spends real money, so
 * it needs metering that a client cannot skip.
 */

export interface AiCardFields {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  website: string;
}

export interface AiReadResult {
  ok: boolean;
  fields?: AiCardFields;
  model?: string;
  error?: string;
}

/** Long enough for a vision model on a slow link, short enough to abandon. */
export const AI_READ_TIMEOUT_MS = 45_000;

/**
 * Fields the AI is allowed to overwrite, and how they land in the form.
 *
 * An empty answer never wins. The model is told to return '' rather than guess,
 * and a blank overwriting something Tesseract read correctly would be a
 * downgrade the user did not ask for.
 */
export function mergeAiFields(current: ContactForm, fields: AiCardFields, countryIso: string): {
  form: ContactForm;
  changed: (keyof ContactForm)[];
} {
  const next: ContactForm = { ...current };
  const changed: (keyof ContactForm)[] = [];

  const take = (key: Exclude<keyof ContactForm, 'greeting'>, value: string) => {
    const clean = value.trim();
    if (!clean || clean === current[key]) return;
    next[key] = clean;
    changed.push(key);
  };

  take('name', fields.name);
  take('title', fields.title);
  take('company', fields.company);
  take('email', fields.email);

  // The phone is the one field worth checking rather than trusting: a model
  // that hallucinates a digit produces a number that looks entirely reasonable
  // and opens a chat with a stranger. If it does not normalise, keep what we
  // had — Tesseract's answer is at least traceable to the card.
  const phone = fields.phone.trim();
  if (phone && phone !== current.phone && normalizePhone(phone, countryIso).ok) {
    next.phone = phone;
    changed.push('phone');
  }

  // The greeting follows the name unless the user has already edited it.
  if (next.name !== current.name) {
    const suggested = greetingName(next.name, next.email);
    if (suggested && suggested !== current.greeting) {
      next.greeting = suggested;
      changed.push('greeting');
    }
  }

  return { form: next, changed };
}

/** True when a re-read is possible at all: it needs the backend to proxy it. */
export function aiReadAvailable(aiOcrEnabled: boolean): boolean {
  return aiOcrEnabled && Boolean(supabaseHost);
}

export async function readCardWithAi(imageDataUrl: string): Promise<AiReadResult> {
  if (!supabaseHost) return { ok: false, error: 'AI reading is not available on this deployment.' };

  const client = supabase();
  if (!client) return { ok: false, error: 'AI reading is not available on this deployment.' };

  try {
    // Pass the session when there is one so the limit is metered per person
    // rather than per office IP. Absent is fine; the function handles both.
    const { data } = await client.auth.getSession();
    const token = data.session?.access_token;

    const { data: result, error } = await withTimeout(
      client.functions.invoke<AiReadResult>('ai-read-card', {
        body: { image: imageDataUrl },
        ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
      }),
      AI_READ_TIMEOUT_MS,
    );

    if (error) {
      // invoke() reports any non-2xx as a generic FunctionsHttpError, so the
      // real reason — rate limited, key rejected, switched off — is in the body.
      const detail = await readErrorBody(error);
      return { ok: false, error: detail ?? 'The AI service could not be reached.' };
    }
    if (!result?.ok || !result.fields) {
      return { ok: false, error: result?.error ?? 'The AI service returned nothing usable.' };
    }
    return result;
  } catch (err) {
    if (err instanceof Error && err.message === TIMED_OUT) {
      return { ok: false, error: 'The AI read timed out. Check your connection and try again.' };
    }
    return { ok: false, error: 'Something went wrong reading that card with AI.' };
  }
}

const TIMED_OUT = 'ai-read-timeout';

/**
 * A stalled request is not a failed one — the same lesson the settings loader
 * learned. invoke() has no abort signal of its own, so the wait is bounded here
 * rather than left to hang the confirm screen indefinitely.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(TIMED_OUT)), ms)),
  ]);
}

/** Digs the server's message out of a FunctionsHttpError. */
async function readErrorBody(error: unknown): Promise<string | null> {
  const context = (error as { context?: unknown }).context;
  if (context instanceof Response) {
    try {
      const body = (await context.json()) as { error?: string };
      if (typeof body.error === 'string' && body.error) return body.error;
    } catch {
      /* not JSON; fall through to the generic message */
    }
  }
  return null;
}
