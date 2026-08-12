/**
 * Reads a business card with a vision model, on demand.
 *
 * On-device Tesseract stays the default and always runs first. This is the
 * "Re-read with AI" button on the confirm screen — a per-scan escape hatch for
 * the cards Tesseract gets wrong, not a replacement for it.
 *
 * Why it is a server function rather than a fetch from the page:
 *
 *  1. The OpenRouter key lives in `app_secrets`, which has RLS on with no
 *     policies, so only service_role can read it. A provider key shipped to the
 *     browser is a key anyone can drain.
 *  2. Every call spends the operator's credit. That makes an open endpoint a
 *     way for a stranger to run up their bill, so calls are metered per caller
 *     per day. Sign-in cannot carry that load — verification is off on this
 *     deployment, so most callers have no session.
 *
 * The card image is third-party contact data, so it is forwarded to OpenRouter
 * and never stored here.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.47.10';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Calls per caller per day. Generous for a BDE, useless for an abuser. */
const DAILY_LIMIT = Number(Deno.env.get('AI_READ_DAILY_LIMIT') ?? '60');
/** Base64 payload cap. The client sends ~1600px JPEG, well under this. */
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * Everything the confirm screen has a field for, and nothing else.
 *
 * The instructions encode the failures that on-device OCR actually hit in this
 * market rather than generic "read the card" guidance: a registration number
 * that parses as a plausible mobile, a fax line chosen over a mobile, and a
 * country code the card only implies.
 */
const PROMPT = `You are reading a business card. Return ONLY a JSON object, no prose and no code fences, with exactly these keys:

{"name":"","title":"","company":"","email":"","phone":"","website":""}

Rules:
- "phone" must be the number a WhatsApp message should go to, in full E.164 form with a leading '+' and no spaces. Prefer a mobile or handphone number over an office line. NEVER return a fax number.
- Work out the country code from the card: from a printed '+' code, from a code shown inside brackets such as "(6019) 7314 959" which means +60 19 7314 959, or failing that from the country in the postal address.
- NEVER return a tax, GST, VAT, company or business registration number as the phone. In Malaysia and Singapore these are often 12 digits beginning with the year of incorporation, and may appear beside the company name or be labelled TIN, GST, SST, UEN or Reg. No.
- "name" is the person, not the company. If the card is bilingual, give the Latin-script form.
- "company" is the trading name without the registration number.
- Use an empty string for anything not printed on the card. Never invent or guess a value.`;

interface CardFields {
  name: string;
  title: string;
  company: string;
  email: string;
  phone: string;
  website: string;
}

const EMPTY: CardFields = { name: '', title: '', company: '', email: '', phone: '', website: '' };

/**
 * Models are chatty even when told not to be, so the JSON is dug out rather
 * than assumed: code fences stripped, then the outermost braces taken.
 */
function extractJson(content: string): CardFields | null {
  const withoutFences = content.replace(/```(?:json)?/gi, '').trim();
  const start = withoutFences.indexOf('{');
  const end = withoutFences.lastIndexOf('}');
  if (start === -1 || end <= start) return null;

  try {
    const parsed = JSON.parse(withoutFences.slice(start, end + 1)) as Record<string, unknown>;
    const pick = (key: keyof CardFields): string => {
      const value = parsed[key];
      return typeof value === 'string' ? value.trim().slice(0, 200) : '';
    };
    return {
      name: pick('name'),
      title: pick('title'),
      company: pick('company'),
      email: pick('email'),
      phone: pick('phone'),
      website: pick('website'),
    };
  } catch {
    return null;
  }
}

/** The caller's own address, not the proxy chain's. */
function callerIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for') ?? '';
  return forwarded.split(',')[0]?.trim() || 'unknown';
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is not configured.' }, 500);

  let body: { image?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Malformed request.' }, 400);
  }

  const image = typeof body.image === 'string' ? body.image : '';
  if (!image.startsWith('data:image/')) return json({ error: 'No card image supplied.' }, 400);
  if (image.length > MAX_IMAGE_BYTES) return json({ error: 'That image is too large to read.' }, 413);

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // The operator must have switched this on. Checked server-side: the client
  // also hides the button, but a hidden button is not a control.
  const { data: settings } = await admin
    .from('app_settings')
    .select('ai_ocr_enabled, ai_ocr_model')
    .eq('id', 1)
    .maybeSingle();

  if (!settings?.ai_ocr_enabled) return json({ error: 'AI card reading is switched off.' }, 403);

  const { data: secret } = await admin
    .from('app_secrets')
    .select('value')
    .eq('name', 'openrouter_api_key')
    .maybeSingle();

  const apiKey = typeof secret?.value === 'string' ? secret.value.trim() : '';
  if (!apiKey) return json({ error: 'No OpenRouter key is configured.' }, 503);

  // Meter before spending anything. Prefer the user id when there is one, so a
  // shared office IP does not lock out a whole team.
  let caller = `ip:${callerIp(request)}`;
  const authHeader = request.headers.get('Authorization') ?? '';
  if (authHeader.startsWith('Bearer ')) {
    const { data } = await admin.auth.getUser(authHeader.slice(7));
    if (data?.user?.id) caller = `user:${data.user.id}`;
  }
  const bucket = `${caller}:${new Date().toISOString().slice(0, 10)}`;

  const { data: used, error: usageError } = await admin.rpc('bump_ai_read_usage', { p_bucket: bucket });
  // Fail closed: if the meter is broken, spending money is the wrong default.
  if (usageError) return json({ error: 'Could not check the usage limit.' }, 503);
  if (typeof used === 'number' && used > DAILY_LIMIT) {
    return json({ error: 'Daily AI re-read limit reached. Try again tomorrow.' }, 429);
  }

  const model = (settings.ai_ocr_model ?? '').trim() || 'google/gemini-2.5-flash';

  let response: Response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'X-Title': 'Handshake',
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: image } },
            ],
          },
        ],
      }),
    });
  } catch {
    return json({ error: 'Could not reach the AI service.' }, 502);
  }

  if (!response.ok) {
    // The upstream body can carry the key back in an error echo, so it is
    // logged for the operator and never returned to the browser.
    console.error('openrouter error', response.status, await response.text().catch(() => ''));
    const message =
      response.status === 401 || response.status === 403
        ? 'The OpenRouter key was rejected.'
        : 'The AI service could not read that card.';
    return json({ error: message }, 502);
  }

  const payload = (await response.json().catch(() => null)) as
    | { choices?: { message?: { content?: unknown } }[] }
    | null;
  const content = payload?.choices?.[0]?.message?.content;
  const fields = typeof content === 'string' ? extractJson(content) : null;

  if (!fields) return json({ error: 'The AI service returned something unreadable.' }, 502);

  return json({ ok: true, model, fields: { ...EMPTY, ...fields } });
});
