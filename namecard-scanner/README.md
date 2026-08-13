# Handshake — name card → WhatsApp

A mobile-first web app for sales BDEs. Scan a business card, answer one optional
question about where you met, review the draft, and hand it to WhatsApp.

Cards are read in the browser by default — no upload, no API key, nothing sent
anywhere. The one exception is explicit and per-card: an optional "re-read with
AI" button, off unless an operator turns it on. See [AI re-read](#ai-re-read).

---

## The flow

```
Capture  ──▶  Read  ──▶  Confirm  ──▶  Context  ──▶  Review  ──▶  WhatsApp
 camera        OCR       editable      "where did     draft you      wa.me
 or photo               fields         you meet?"     can edit       deep link
                                        (skippable)
```

The user always sees the message before anything is sent, and WhatsApp itself
still requires the final send tap. There is no path in the app that transmits a
message on the user's behalf.

## Running it

```bash
npm install
npm run dev            # http://localhost:5173
```

With no Supabase credentials configured the app runs **local-only**: no sign-in,
profile and history in `localStorage`. Everything except cross-device sync works
that way, so a fresh clone is usable immediately.

## Backend (Supabase)

Live project: `handshake` — `https://oltrwsrzhmhmofwvyeju.supabase.co` (ap-southeast-1).

Two tables, both with row level security so a BDE can only ever reach their own
rows. This matters more than usual here: `follow_ups` holds contact details
belonging to *third parties* — the people whose cards were scanned — and that is
not data an anon key should be able to enumerate.

| Table | Holds |
| --- | --- |
| `profiles` | The sender: name, company, home market, default tone |
| `follow_ups` | One row per card handed to WhatsApp, plus the message sent |

Verified against the live project:

```
anon SELECT follow_ups  ->  []                          (no leak)
anon INSERT follow_ups  ->  401, RLS policy violation   (no writes)
rpc/handle_new_user     ->  404                         (trigger fns not exposed)
supabase advisors       ->  0 findings
```

Apply the schema to a different project with `supabase/migrations/*.sql`, in order.

### The one dashboard step the API cannot do

Supabase exposes no management API for auth settings, so this is manual:

**Authentication → URL Configuration.** Set Site URL and add a Redirect URL for
the deployed domain, so tapping the link in the email returns to the app rather
than to localhost.

(Editing the Magic Link template to add `{{ .Token }}` is *not* needed once the
Resend hook below is enabled — the hook owns the email and reads the token
straight off the payload.)

### Email sending (Resend)

Supabase's built-in mailer is rate limited to a handful of messages an hour and
is not intended for production, which is why the second and third person to sign
up appear to receive nothing.

`supabase/functions/send-auth-email/` replaces it. It is a Supabase **Send Email
hook**: Supabase stops sending mail itself and calls the function, which
delivers through Resend. Two things that buys beyond deliverability — the
six-digit code arrives without editing any Supabase template (the stock Magic
Link template contains only `{{ .ConfirmationURL }}`, so an OTP flow otherwise
sends nobody a code), and the email is ours to design.

The function is deployed and **rejects unsigned requests** — it is a public
endpoint, and without signature verification it would be an open mail relay.

To switch it on:

1. **Resend** — verify your sending domain, then create an API key.
2. **Supabase → Edge Functions → Secrets** — add:
   | Secret | Value |
   | --- | --- |
   | `RESEND_API_KEY` | from resend.com/api-keys |
   | `EMAIL_FROM` | `Handshake <hello@yourdomain.com>`, on the verified domain |
   | `SEND_EMAIL_HOOK_SECRET` | the secret shown in step 3, starting `v1,whsec_` |
3. **Supabase → Authentication → Hooks → Send Email Hook** — enable it, point it
   at `https://<project>.supabase.co/functions/v1/send-auth-email`, and copy the
   generated secret into step 2.

Redeploy the function after changing secrets.

## Admin — `/admin`

Runtime configuration, password protected. Nothing links to it from the app;
it is reached by typing the URL.

| Setting | Effect |
| --- | --- |
| Require email verification | Whether users sign in before the scanner opens |
| AI re-read button | Adds "Re-read this card with AI" to the confirm screen |
| OpenRouter API key | Write-only; stored where only the server can read it |
| Model | Which vision model the re-read uses |

Set the password once, in **Supabase → Edge Functions → Secrets**, as
`ADMIN_PASSWORD`. Until it is set, `/admin` says so rather than letting anyone
in.

Two things are deliberate:

**The password is checked on the server, never in the page.** A client-side
gate is decoration — anyone can skip it, and the settings it "protects" would
be readable anyway. Every read and write goes through the `admin-settings`
edge function, which validates the password on each call and compares by hash
so the comparison cannot be timed.

**The OpenRouter key is written but never read back.** `app_secrets` has row
level security on with *no policies at all*, so the anon key cannot reach it
under any circumstances; only `service_role`, inside the edge function, can.
The panel shows a masked hint (`sk-or-v1…wxyz`) so you can tell which key is
installed. A provider key readable by the browser is a key anyone can drain.

### The build-time override

`VITE_REQUIRE_EMAIL_VERIFICATION=false` in Vercel forces verification off and
**overrides the admin toggle**. It exists so a demo build cannot be locked by a
remote setting.

That means: **to let `/admin` control sign-in, remove that variable from
Vercel.** While it is set to `false`, the toggle in the panel has no effect on
this deployment.

Only an exact `false` disables it — a typo, an empty value or an unset variable
all leave the runtime setting in charge.

## AI re-read

On-device Tesseract runs on every card and is what the user normally sees.
Where it struggles — bilingual layouts, small print, an unusual design — the
confirm screen offers **"Re-read this card with AI"**, which sends that one
card to a vision model through OpenRouter.

Off by default. To switch it on: store an OpenRouter key in `/admin`, then flip
**AI re-read button**. The toggle cannot be thrown without a key, because a
feature enabled with nothing behind it fails on the user's phone rather than in
the panel.

### Why it is a server function

`supabase/functions/ai-read-card/` proxies the call. The browser never holds
the provider key: `app_secrets` has row level security on with no policies, so
only `service_role` inside the function can read it. A key shipped to the page
is a key anyone can drain.

The second reason is money. Every call spends the operator's credit, which
makes an open endpoint a way for a stranger to run up their bill — and sign-in
cannot carry that load, because verification is off on this deployment and most
callers have no session. Calls are metered per caller per day
(`AI_READ_DAILY_LIMIT`, default 60) against `ai_read_usage`, keyed by user id
where there is one and by IP where there is not. The counter is incremented by
a `security definer` function in a single statement, so two concurrent requests
cannot both read the old value and both pass the check. If the meter itself
fails, the request is refused: spending money is the wrong default for a broken
limiter.

Verified against the live project:

```
POST with no auth header        ->  401
GET                             ->  401
POST anon, toggle off           ->  403  AI card reading is switched off.
anon SELECT ai_read_usage       ->  []                    (no leak)
anon RPC bump_ai_read_usage     ->  42501 permission denied
anon SELECT app_secrets         ->  []                    (no leak)
```

### The model is merged, never trusted

A vision model fails differently from OCR. Garbled Tesseract output looks
garbled; an invented phone number looks perfect and opens a chat with a
stranger. So `mergeAiFields` only ever merges:

- a field the model returns empty never overwrites one already read
- a phone number is accepted **only if it normalises** — otherwise the number
  traceable to the card is kept
- the user is told which fields moved, because a screen that silently rewrites
  itself is one nobody trusts

The prompt encodes the failures this market actually produces: a registration
number that parses as a plausible mobile, a fax line picked over a mobile, and
a country code the card only shows in brackets.

### Privacy

The scan screen says cards are read on the phone by default and that nothing is
uploaded unless the user asks for an AI re-read. That wording is load-bearing —
if the AI path ever becomes automatic, it stops being true, and the same claim
appears on the sales infographic.

## Deploying (Vercel)

`vercel.json` is committed and the build is verified from a clean tree. From
`namecard-scanner/`:

```bash
npx vercel --prod
```

Set these in the Vercel project (or leave `.env.production`, which is committed
and carries the same values):

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://oltrwsrzhmhmofwvyeju.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the project's publishable key |

Both are public by design and ship in the client bundle — row level security is
what protects the data, not the secrecy of the key. The `service_role` key must
never appear in this repo.

The build downloads the OCR language model, so the build container needs network
access (Vercel's does).

The camera viewfinder needs a secure context. `localhost` counts as one; to test
from a phone on your LAN, serve the preview build over HTTPS or use a tunnel.
Without camera access the app falls back to the native photo picker, which works
everywhere, and says *why* the viewfinder is unavailable rather than giving one
generic message — a camera held by a video call and a camera blocked in browser
settings need different things from the user.

The live viewfinder is covered by `e2e/camera.spec.ts`, which runs Chromium
with a synthetic camera device. It asserts the `<video>` is actually bound to a
live `MediaStream` and reporting frame dimensions, not merely present: an
unbound video element renders as a black box and is indistinguishable from a
working one in a screenshot.

```bash
npm run build          # typecheck + production build
npm run preview        # serve the built app on :4173
```

## Verification

```bash
npm test               # 158 unit tests — parsing, phone normalisation, drafting
npm run typecheck      # strict TypeScript, no implicit any, no unused symbols
npm run e2e            # 33 browser tests against the real production build
```

The end-to-end suite is not mocked. It renders a business card to a PNG, feeds it
to the running app, waits for the real OCR engine to read it, and asserts on the
`wa.me` URL that comes out the other end. Regenerate the card fixture with:

```bash
node e2e/make-fixture.mjs
```

### OCR benchmark

Card reading is on-device Tesseract, and accuracy work on it is guesswork
without a scoreboard — preprocessing changes routinely help one kind of card
and wreck another.

```bash
npm run build && npm run preview     # in one shell
node e2e/make-fixtures.mjs           # render the cards, once
node e2e/ocr-bench.mjs               # score them
```

Fourteen cards, each a real failure mode rather than an arbitrary distortion:
low contrast, rotated, light-on-dark, small type, serif, uneven lighting, four
photo-like variants (blur, perspective, dim, glare — rendered as low-quality
JPEGs so the compression artefacts are genuine), and three bilingual cards —
Chinese, Japanese and Korean. Fields are weighted by what actually breaks a
follow-up: the phone number counts triple, the name and greeting double, and
it is scored on the *resolved* E.164 rather than the raw field, because the
country code is the whole point.

Current: **140/140**. The crisp variants are all trivially passed — the
benchmark's value is as a regression guard, and as the thing that found every
bug described below.

## Sales collateral

A one-page infographic for pitching the app to a sales team, with a QR code to
the live deployment.

```bash
npm run marketing
```

Produces, in `marketing/assets/`:

| File | For |
| --- | --- |
| `handshake-infographic.png` | 2400×3600 — print, A3 without softening |
| `handshake-infographic-share.png` | 1200×1800 — WhatsApp, Slack, email |
| `handshake-infographic.html` | Self-contained, every asset inlined; open or print it |

Point it at a different deployment with
`node marketing/make-qr.mjs https://your-url && node marketing/build-infographic.mjs https://your-url`.

**The QR code is generated, not drawn.** An image model will produce a
convincing-looking grid that decodes to nothing — the error-correction blocks
have to be bit-exact, and nobody notices they aren't until it is printed on a
stand. So it is generated deterministically and then read back with a
*different* library than the one that wrote it, out of the finished poster
rather than the source file, at both sizes and after a quality-55 JPEG
re-encode. That last one is the realistic case: forwarding through a messaging
app is where a QR code actually dies. Any of those failing exits non-zero.

The generative model only supplies the photograph in the band, where being
approximately right is the whole job. The layout also asserts it fits — blocks
are `flex: none`, so an over-full poster fails the build instead of silently
squashing the photo band to a sliver.

## Japanese and Korean cards

The engine ships `eng.traineddata` only, so kana, kanji and hangul come back as
plausible-looking ASCII rubbish. The benchmark's JP and KR fixtures answer the
question that raises: **how much of the card survives that?**

Nearly all of it, as it turns out — both score 10/10 — but only after four
faults that the cards exposed one at a time. None of them needed another
language model, which matters: `jpn` and `kor` are roughly 15 MB each, and this
app is meant to open on one bar of signal.

**The country code was invented.** The single worst of the four. Japanese and
Korean cards print the mobile in national format with no country code anywhere
— `090-1234-5678` — because everyone reading the card is local. Resolved
against a Singaporean BDE's home market that becomes `+65 090 1234 5678`, a
number belonging to nobody, offered with only a mild warning. The card does say
where it is from, in the one place that is always machine-readable: the email's
country TLD. `chooseMarket` now takes that hint — but only when the home market
produced a `guess`, so a Singaporean working for a Japanese employer still has
their local mobile read as Singaporean.

**`Park` was in the address word list.** `looksLikeName` reused `ADDRESS_RE`,
which lists `park`, `lane`, `drive` and `hill` — as in "business park". So
`PARK JI HOON` was rejected as an address, silently failing one of the three
most common surnames in Korea, and the name fell back to the email. Names now
use a narrower list containing only words that are never a surname.

**`k.nakamura@…` greeted him as "Nakamura".** The email local part is used to
work out which half of a name is personal, which is right for `weiming.tan` but
exactly backwards for an initial followed by a family name.

**There was nothing to split the debris on.** `rescuePhrase` cut bilingual
lines on `·` or `|`, but JP and KR cards run the two scripts together with only
a space: `영업팀장 Sales Team Manager` reads as `24 2{El Xt Sales Team Manager`.
With no separator the split gave up and the stray digits then disqualified the
whole line, so the Korean job title was simply lost. It now walks in from the
left and takes the first suffix that is clean and still carries the anchor —
only ever dropping a prefix, since the anchor word is what identifies the line
and everything after it belongs.

What is *not* fixed: a short debris token immediately before the anchor
survives, so the Korean title reads `Xt Sales Team Manager`. Trimming it would
mean dropping any two- or three-letter prefix, which would also eat the `IT` in
`IT Sales Manager`.

### The limit: a card with no Latin on it at all

Everything above concerns *bilingual* cards, which is what a JP or KR contact
hands a foreigner. A card printed only in Japanese or Korean is a different
matter, and was measured separately:

| | Japanese-only | Korean-only |
| --- | --- | --- |
| Phone | ✅ `+81 90 1234 5678` | ✅ `+82 10 9876 5432` |
| Email | ✅ | ✅ |
| Company | ⚠️ from the domain | ⚠️ from the domain |
| Title | ❌ lost | ❌ lost |
| Name | ❌ **invented** — `中村 健二` reads as "Sly Se" | ⚠️ from the email |

The contact details survive because digits and email addresses are ASCII
wherever a card is printed. The name does not, and the Japanese failure is the
dangerous kind: the model returns a plausible-looking Latin name rather than
nothing, so the message opens "Hi Sly".

No heuristic reliably tells an invented Latin name from a real one — that is
the definition of what an English-only model cannot do. **Monolingual CJK cards
need the AI re-read**, which is exactly what it is there for. Adding `jpn` and
`kor` traineddata would be the alternative, at roughly 15 MB each and with
vertical-text layouts still unsolved; worth revisiting only if these cards turn
out to be common in practice.

## How it is put together

| Path | Responsibility |
| --- | --- |
| `src/lib/preprocess.ts` | EXIF-correct decode, resize, greyscale, contrast stretch |
| `src/lib/ocr.ts` | Tesseract worker, all assets self-hosted |
| `src/lib/settings.ts` | Runtime config, time-bounded and cached on device |
| `src/lib/parseCard.ts` | OCR text → name, title, company, email, phones |
| `src/lib/phone.ts` | Phone normalisation to E.164 and the `wa.me` link |
| `src/lib/draft.ts` | Tone/CTA-aware message composition, vCard export |
| `src/lib/storage.ts` | Sender profile and daily tally in `localStorage` |
| `src/lib/supabase.ts` | Client, and the flags that decide whether auth applies |
| `supabase/functions/` | Send Email auth hook, delivering via Resend |
| `src/components/` | One component per step of the flow |

### Three decisions worth knowing about

**OCR assets are vendored, not fetched from a CDN.** `tesseract.js` defaults to
pulling its worker, wasm core and ~3 MB language model from a public CDN on first
scan. That fails behind a strict CSP, on a locked-down corporate network, and in
a conference basement with one bar of signal — which is exactly where this app
gets opened. `public/tesseract/` and `public/tessdata/` are served from our own
origin instead.

**Phone normalisation gets a disproportionate amount of the code.** WhatsApp
silently opens an empty chat when the country code is wrong, so a bad number
looks like a working app right up until the message goes nowhere. `phone.ts`
handles trunk prefixes, missing `+`, country codes printed without one, and the
genuinely ambiguous cases (an 11-digit Indonesian number is both a valid national
number and a valid `62` + 9-digit one — mobile prefixes break the tie). Anything
inferred is surfaced as a warning on the confirm screen.

**Bilingual cards need the good half rescued from the bad.** The model is
English-only, so "区域销售总监 · Regional Sales Director" comes back as
"Xims8E 2% - Regional Sales Director". The title is right there, but the noise
carries digits, and the parser used to reject the whole line for it. Lines that
look misread are now split on separators and the clean segment kept — and only
those lines, so a company genuinely called "Smith / Jones Partners" keeps its
slash. Note the tell is stray digits, not non-ASCII: an English-only model does
not return the characters it failed on, it guesses and returns plausible ASCII.

**Mobile beats office, and fax is never chosen.** A card typically lists two or
three numbers. `pickBestPhone` prefers an explicitly labelled mobile, then an
unlabelled number whose prefix marks it as mobile, then the office line — and
refuses a fax number outright.

**A stated country code beats an assumed one, and identifiers are not phones.**
Two failures from one real Malaysian card. Its mobile is printed
`(6019) 7314 959` — country code inside the brackets, no `+` anywhere — and
its tax number `(TIN No. : C 854327050)` sits four lines below. Nine digits
starting with `8` is a valid Singapore mobile, so for a Singapore-based user
the *tax number* normalised cleanly, collected the "unlabelled but
mobile-prefixed" bonus, and won the WhatsApp link outright.

So `normalizePhone` now reports a confidence — `exact` when the card stated the
country code, `guess` when the home market was assumed — and a guess never
outranks a stated one. Lines carrying a tax or registration marker are dropped
before phone extraction entirely. Bracketed country codes are read, but only on
a strict length match: `(415) 555-0123` opens with `41`, and without that check
a New York card would dial Switzerland.

The nastier version has no keyword at all. Malaysia and Singapore print a
12-digit registration number on almost every card, and its first four digits
are the year of incorporation: `195901000194`. With no `+` and no country whose
length rules it fits, it fell into the "assume the home market" fallback and
was offered to the user as `+60 1959 0100 0194`, green "read from the card" dot
and all. It is now rejected on shape — but only when no country's dial code and
number length fit it, so an Egyptian mobile written bare as `201234567890`
keeps its place despite also opening with a year.

## Design

Custom throughout — no component library, no template. Near-black ink, warm
paper-white text, and a single acid-lime signal colour reserved for the next
action, so on any screen the eye lands on the one thing to tap. WhatsApp green
appears exactly once, on the button that leaves the app.

Built for one hand at a trade show: 54px primary buttons pinned to the bottom of
the viewport, safe-area aware, 16px inputs so iOS never zooms on focus, and a
`prefers-reduced-motion` path that drops every animation.

## Limits

- OCR is English-only (`eng.traineddata`). Adding a language means dropping
  another model into `public/tessdata/` and passing it to `createWorker`.
- Heavily stylised cards — reversed-out text, script faces, dark backgrounds,
  vertical CJK layouts — read poorly. The confirm screen exists because of this.
- `wa.me` opens a chat with a number; it cannot verify that number is on
  WhatsApp. An unregistered number lands on WhatsApp's own "not on WhatsApp"
  screen.
