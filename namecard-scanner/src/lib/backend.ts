import type { CtaId, SenderProfile, Tone } from './draft';
import type { LogEntry } from './storage';
import { supabase } from './supabase';

/**
 * Supabase reads and writes.
 *
 * The app stays offline-first: localStorage is what the UI renders from, and
 * every call here is a sync on top of it. A BDE working a trade-show floor
 * with one bar of signal must never watch a spinner to get to the next card,
 * and a failed write must never lose the follow-up they just sent.
 */

export interface RemoteResult<T> {
  data: T | null;
  error: string | null;
}

function message(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return 'Could not reach the server.';
}

interface ProfileRow {
  id: string;
  full_name: string | null;
  company: string | null;
  role: string | null;
  default_country: string | null;
  default_tone: string | null;
  default_cta: string | null;
}

function rowToProfile(row: ProfileRow, fallback: SenderProfile): SenderProfile {
  return {
    name: row.full_name ?? '',
    company: row.company ?? '',
    role: row.role ?? '',
    defaultCountry: row.default_country || fallback.defaultCountry,
    defaultTone: (row.default_tone as Tone) || fallback.defaultTone,
    defaultCta: (row.default_cta as CtaId) || fallback.defaultCta,
  };
}

export async function fetchProfile(userId: string, fallback: SenderProfile): Promise<RemoteResult<SenderProfile>> {
  const client = supabase();
  if (!client) return { data: null, error: null };

  const { data, error } = await client
    .from('profiles')
    .select('id, full_name, company, role, default_country, default_tone, default_cta')
    .eq('id', userId)
    .maybeSingle();

  if (error) return { data: null, error: message(error) };
  if (!data) return { data: null, error: null };
  return { data: rowToProfile(data as ProfileRow, fallback), error: null };
}

export async function saveProfile(userId: string, profile: SenderProfile): Promise<RemoteResult<true>> {
  const client = supabase();
  if (!client) return { data: true, error: null };

  const { error } = await client.from('profiles').upsert(
    {
      id: userId,
      full_name: profile.name,
      company: profile.company,
      role: profile.role,
      default_country: profile.defaultCountry,
      default_tone: profile.defaultTone,
      default_cta: profile.defaultCta,
    },
    { onConflict: 'id' },
  );

  if (error) return { data: null, error: message(error) };
  return { data: true, error: null };
}

interface FollowUpRow {
  id: string;
  contact_name: string | null;
  contact_company: string | null;
  phone_e164: string;
  met_context: string | null;
  sent_at: string;
}

export async function fetchLog(limit = 200): Promise<RemoteResult<LogEntry[]>> {
  const client = supabase();
  if (!client) return { data: null, error: null };

  const { data, error } = await client
    .from('follow_ups')
    .select('id, contact_name, contact_company, phone_e164, met_context, sent_at')
    .order('sent_at', { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: message(error) };

  const entries = (data ?? []).map((row) => {
    const typed = row as FollowUpRow;
    return {
      id: typed.id,
      name: typed.contact_name ?? '',
      company: typed.contact_company ?? '',
      phone: typed.phone_e164,
      context: typed.met_context ?? '',
      sentAt: new Date(typed.sent_at).getTime(),
    } satisfies LogEntry;
  });

  return { data: entries, error: null };
}

export interface FollowUpInput {
  contactName: string;
  greeting: string;
  title: string;
  company: string;
  email: string;
  phoneE164: string;
  context: string;
  tone: string;
  message: string;
}

export async function recordFollowUp(userId: string, input: FollowUpInput): Promise<RemoteResult<true>> {
  const client = supabase();
  if (!client) return { data: true, error: null };

  const { error } = await client.from('follow_ups').insert({
    user_id: userId,
    contact_name: input.contactName,
    greeting: input.greeting,
    contact_title: input.title,
    contact_company: input.company,
    contact_email: input.email,
    phone_e164: input.phoneE164,
    met_context: input.context,
    tone: input.tone,
    message: input.message,
  });

  if (error) return { data: null, error: message(error) };
  return { data: true, error: null };
}
