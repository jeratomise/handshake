/**
 * Supabase "Send Email" auth hook, delivering through Resend.
 *
 * Supabase's built-in mailer is rate limited to a handful of messages an hour
 * and is explicitly not for production, which is why the second and third
 * person to sign up appear to get nothing. With this hook enabled, Supabase
 * stops sending mail itself and calls here instead.
 *
 * Two things this buys beyond deliverability:
 *
 *  - The six-digit code arrives without touching Supabase's email templates.
 *    The stock Magic Link template contains only {{ .ConfirmationURL }}, so an
 *    OTP flow silently sends nobody a code. Here the token is simply a field on
 *    the payload.
 *  - The email is ours to design, so it matches the app instead of looking
 *    like a default.
 *
 * Required secrets (Supabase dashboard -> Edge Functions -> Secrets):
 *   RESEND_API_KEY         - from resend.com/api-keys
 *   SEND_EMAIL_HOOK_SECRET - shown when you create the hook; starts "v1,whsec_"
 *   EMAIL_FROM             - e.g. "Handshake <hello@yourdomain.com>", on a
 *                            domain verified in Resend
 */
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

interface HookPayload {
  user: { email: string };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: string;
    site_url: string;
  };
}

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set on this function.`);
  return value;
}

/** The address bar link that signs the user in when they tap it. */
function confirmationUrl(siteUrl: string, tokenHash: string, actionType: string, redirectTo: string): string {
  const url = new URL('/auth/v1/verify', required('SUPABASE_URL'));
  url.searchParams.set('token', tokenHash);
  url.searchParams.set('type', actionType);
  url.searchParams.set('redirect_to', redirectTo || siteUrl);
  return url.toString();
}

function renderEmail(code: string, link: string): string {
  // Inline styles only: every mail client strips <style> blocks, and a code
  // nobody can read is the same as no code at all.
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#08090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#08090b;padding:36px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:440px;background:#141619;border:1px solid #2b3038;border-radius:20px;padding:32px;">
        <tr><td style="padding-bottom:22px;">
          <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ccff3f;"></span>
          <span style="color:#f4f2ec;font-size:17px;font-weight:700;letter-spacing:-0.02em;padding-left:8px;">Handshake</span>
        </td></tr>
        <tr><td style="color:#f4f2ec;font-size:25px;font-weight:700;letter-spacing:-0.03em;line-height:1.2;padding-bottom:10px;">
          Your sign-in code
        </td></tr>
        <tr><td style="color:#a8adb6;font-size:15px;line-height:1.55;padding-bottom:24px;">
          Enter this in the app to finish signing in. It expires in an hour.
        </td></tr>
        <tr><td align="center" style="padding-bottom:24px;">
          <div style="background:#0d0f12;border:1px solid #2b3038;border-radius:14px;padding:18px 0;color:#ccff3f;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:34px;font-weight:700;letter-spacing:0.28em;text-indent:0.28em;">
            ${code}
          </div>
        </td></tr>
        <tr><td align="center" style="padding-bottom:22px;">
          <a href="${link}" style="display:inline-block;background:#ccff3f;color:#08090b;text-decoration:none;font-size:15px;font-weight:600;padding:14px 26px;border-radius:100px;">
            Or tap here to sign in
          </a>
        </td></tr>
        <tr><td style="color:#6f757f;font-size:12.5px;line-height:1.55;border-top:1px solid #202429;padding-top:18px;">
          If you did not ask for this, ignore it — nobody can sign in without the code above.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const raw = await request.text();

  // Reject anything not signed by Supabase: this endpoint is public, and
  // without verification anyone could make it mail arbitrary addresses.
  let payload: HookPayload;
  try {
    const secret = required('SEND_EMAIL_HOOK_SECRET').replace('v1,whsec_', '');
    const headers = Object.fromEntries(request.headers);
    payload = new Webhook(secret).verify(raw, headers) as HookPayload;
  } catch (error) {
    console.error('Rejected unsigned or malformed hook call:', error);
    return new Response(JSON.stringify({ error: { message: 'Invalid signature.' } }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { user, email_data: data } = payload;
    const link = confirmationUrl(data.site_url, data.token_hash, data.email_action_type, data.redirect_to);

    const response = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${required('RESEND_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: required('EMAIL_FROM'),
        to: [user.email],
        subject: `${data.token} is your Handshake code`,
        html: renderEmail(data.token, link),
        // A text part materially improves deliverability and covers clients
        // that refuse HTML.
        text: `Your Handshake sign-in code is ${data.token}\n\nOr sign in directly: ${link}\n\nIf you did not ask for this, ignore it.`,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Resend rejected the message:', response.status, detail);
      // Returning the error in this shape makes Supabase surface it to the
      // client instead of reporting a generic failure.
      return new Response(
        JSON.stringify({ error: { http_code: response.status, message: `Email provider error: ${detail}` } }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error sending email.';
    console.error('send-auth-email failed:', message);
    return new Response(JSON.stringify({ error: { http_code: 500, message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
