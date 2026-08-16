<div align="center">

# Handshake

### Your sales team scans a business card and WhatsApps the lead in twenty seconds. Deploy your own copy this afternoon, for nothing a month.

[**Try the live app →**](https://handshake-olive.vercel.app)&nbsp;&nbsp;·&nbsp;&nbsp;[Deploy your own](#deploy-your-own-15-minutes)&nbsp;&nbsp;·&nbsp;&nbsp;[What it costs](#what-it-costs-to-run)&nbsp;&nbsp;·&nbsp;&nbsp;[Make it yours](#make-it-yours)&nbsp;&nbsp;·&nbsp;&nbsp;[Roll it out](#roll-it-out-to-your-team)

![Handshake](docs/hero.jpg)

![React](https://img.shields.io/badge/React-19-0d0f12?style=flat-square&labelColor=0d0f12&color=ccff3f)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-0d0f12?style=flat-square&labelColor=0d0f12&color=ccff3f)
![Vite](https://img.shields.io/badge/Vite-7-0d0f12?style=flat-square&labelColor=0d0f12&color=ccff3f)
![OCR](https://img.shields.io/badge/OCR-on--device%20%C2%B7%20%240%20per%20scan-0d0f12?style=flat-square&labelColor=0d0f12&color=25d366)
![Hosting](https://img.shields.io/badge/hosting-free%20tier-0d0f12?style=flat-square&labelColor=0d0f12&color=25d366)
![Licence](https://img.shields.io/badge/licence-MIT-0d0f12?style=flat-square&labelColor=0d0f12&color=f4f2ec)

</div>

---

Your BDE comes back from a conference with forty business cards and follows up on
six. Not because the other thirty-four were bad leads — because typing a phone
number off a card into WhatsApp, then writing something that does not read like a
form letter, takes four minutes a card. Two and a half hours of admin nobody has
after a three-day event.

Handshake is those four minutes rebuilt as twenty seconds. Point the phone at the
card, answer one optional question about where you met, read the draft it wrote,
hand it to WhatsApp.

**This repo is the whole thing.** Not a demo, not a trial — the app that is
running at the link above, MIT licensed, and built so that a sales ops person who
can follow a terminal command can have their own branded copy running on their
own infrastructure in about fifteen minutes, with no per-scan cost and no vendor
holding their pipeline data.

<br>

## What your team sees

<img src="docs/flow.svg" alt="Card to conversation in six steps: capture, read, confirm, context, review, WhatsApp" width="100%">

Two things here matter when you are the one answering for it.

**Step 3 exists because OCR is never perfect.** Every field lands in an editable
box before anyone goes near a message. A blurry `8` read as a `B` is a
half-second fix, not a failed scan and not a message sent to a wrong number.

**Step 6 is a deep link, not a send.** Handshake opens WhatsApp with the message
already typed in. The rep still taps send. There is no path anywhere in this app
that transmits a message on someone's behalf, and no integration that could —
which is the answer to the first question your compliance person will ask.

The message is written from the card plus that one-line answer about where you
met, in a choice of three tones. Japanese and Korean cards get a message in
Japanese or Korean, addressed 〜様 by family name or 〜님 by full name — the
convention a first business contact expects, and the exact inverse of the English
"Hi Kenji".

<br>

## Deploy your own (~15 minutes)

You need: a GitHub account, a [Vercel](https://vercel.com) account, and Node 20+
if you want to run it locally first. Both hosting accounts are free.

**1. See it work locally.**

```bash
git clone https://github.com/jeratomise/handshake
cd handshake/namecard-scanner
npm install
npm run dev          # http://localhost:5173
```

That is a complete, working scanner. With no configuration at all it runs
local-only: no sign-in, everything kept on the device, every feature except
syncing between phones. If that is all your team needs, you are already done —
step 2 puts it on the internet and step 3 is optional.

**2. Put it on the internet.**

Fork this repo, then in Vercel: *Add New → Project*, pick your fork, set the root
directory to `namecard-scanner`, deploy. `vercel.json` is committed and needs no
changes. You get a `something.vercel.app` URL, and every push to `main`
redeploys.

> **Delete `namecard-scanner/.env.production` in your fork first**, or point it at
> your own Supabase project. It carries the original deployment's project URL, and
> your fork should not be writing to somebody else's database.

**3. Optional — add sign-in and cross-device sync.**

Only needed if a rep should be able to pick up their history on a second phone.
Create a free [Supabase](https://supabase.com) project, apply
`namecard-scanner/supabase/migrations/*.sql` in order, and set two variables in
Vercel:

| Variable | Where it comes from |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase → Project Settings → API |
| `VITE_SUPABASE_ANON_KEY` | the same page, the *publishable* key |

Both are public by design and ship in the browser bundle. Row level security is
what protects the data — a signed-in rep can only ever read rows they wrote. The
`service_role` key must never go anywhere near this repo.

The one step no API can do for you is in the Supabase dashboard:
**Authentication → URL Configuration**, set your deployed domain. The
[engineering README](namecard-scanner/README.md#backend-supabase) has the detail,
including email delivery via Resend.

<br>

## What it costs to run

| | |
| --- | --- |
| Hosting | **$0** — Vercel's free tier covers a sales team comfortably |
| Database and auth | **$0** — Supabase free tier, or skip it entirely |
| OCR | **$0 per scan, forever** — it runs on the phone, there is no API to bill you |
| Optional AI re-read | a **fraction of a cent per card**, and only on cards a rep taps the button for |

The OCR line is the one that surprises people. Cloud vision APIs charge per
image, so a scanner built on one has a cost that grows with your team's activity
— precisely the wrong incentive. Handshake reads the card
[on the device](#why-your-legal-team-will-be-fine-with-it), so a hundred reps
scanning all day costs exactly the same as nobody using it.

<br>

## How the scanning actually works

<img src="docs/tesseract.svg" alt="The OCR pipeline: prepare the frame, recognise with tesseract.js, sort the lines, resolve the phone number" width="100%">

[Tesseract](https://github.com/tesseract-ocr/tesseract) is an OCR engine that
began at HP in the 1980s, was open sourced in 2005 and spent the following decade
maintained by Google. Here it is compiled to WebAssembly via
[tesseract.js](https://github.com/naptha/tesseract.js), so it runs inside the
browser tab. Only the LSTM model and English training data ship — about 3 MB
gzipped, cached permanently after the first visit. Engine and data are served
from your own deployment rather than a CDN, so a phone in a conference basement
with one bar still reads a card.

Raw OCR is not the hard part, though. **Turning a page of text into the right
phone number is.** A business card carries three or four numbers, one of them a
fax, plus a tax number that looks exactly like a mobile.

That is a real bug, not a hypothetical one. A beta tester sent in a Malaysian
card whose tax number — `C 854327050` — is a perfectly valid Singapore mobile
when read by a Singapore-based user, and it won the WhatsApp link outright. The
fix was to stop treating every number as equally trustworthy: evidence about the
country is *ranked*, a guess never outranks a code printed on the card, and lines
carrying a tax or registration marker are dropped before phone extraction starts.

The 190-odd unit tests are mostly this — real cards from Singapore, Malaysia,
Japan, Korea, Taiwan and Hong Kong, and the specific way each one broke. If your
market breaks it in a new way, that is the file to add a case to.

<br>

## Why your legal team will be fine with it

<img src="docs/local-first.svg" alt="What stays on the phone versus the two things that leave it" width="100%">

The scanned card belongs to someone who is not your customer yet and never agreed
to your tooling. They handed a card to a person, not to a cloud service.

So the default path touches no network at all: capture, OCR, parsing, drafting and
history happen in the browser tab, with the profile and log in `localStorage`. No
image is uploaded. No OCR vendor is called. There is no key in the bundle to leak,
because there is no key.

Two things can leave the phone, both shown above, and both are the user's choice:

- **Their own rows**, if they sign in — profile and follow-up history sync to
  your Supabase project so a new phone picks up where the old one left off. Row
  level security means a rep can only ever read rows they wrote. That matters
  more than usual here: the follow-up log holds *third parties'* contact details.
- **One card image**, if they tap "re-read with AI" — an escape hatch for a card
  Tesseract mangles. Off unless you switch it on in `/admin`, and then it is one
  tap per card. It goes through a server function, so the provider key is never
  in the browser.

<br>

## Make it yours

Most of what a sales org wants to change is one line.

| To change | Edit |
| --- | --- |
| The company every rep introduces themselves as | `DEFAULT_COMPANY` in `src/lib/storage.ts` |
| The name, colours and wordmark | `src/styles/global.css` (the palette is ~25 variables at the top) |
| The three message tones | `TONES` and `composeDraft` in `src/lib/draft.ts` |
| The ten "where did you meet?" answers | `MEETING_CONTEXTS` in `src/lib/draft.ts` |
| Markets and dial codes | `COUNTRIES` in `src/lib/countries.ts` |
| Japanese and Korean wording | `src/lib/draftIntl.ts` |
| Turn the AI re-read on, set the model | `/admin` on your deployment, password protected |

There is no UI framework and no design system to fight — the CSS is hand-written
and about a thousand lines long. Change the palette variables and the whole app
follows.

<br>

## Roll it out to your team

It is a web app, so there is no app store submission, no MDM approval, and nothing
for IT to package. You send a link.

```bash
npm run marketing    # regenerates the one-page sell sheet and its QR code
```

That produces a printable one-pager in `marketing/assets/` with a QR code pointing
at your deployment — built for handing out at a sales kickoff. Point
`marketing/make-qr.mjs` at your own URL first. The QR code is verified by an
independent decoder at build time, because a poster with a QR code that does not
scan is worse than a poster with none.

Reps open the link once and add it to their home screen. First visit downloads the
OCR model; after that it works with no signal.

<br>

## Questions a sales manager actually asks

**Does it send messages automatically?** No, and it cannot. It opens WhatsApp with
the text prepared; the rep taps send. Bulk messaging is not a feature and is
against WhatsApp's terms besides.

**Does it work on iPhone and Android?** Both, in the normal browser. Chrome and
Safari, camera or photo library.

**What if the OCR misreads a card?** Every field is editable before the message is
written. For genuinely hard cards, the optional AI re-read is one tap.

**Does it work offline?** After the first visit, yes — scanning and drafting are
entirely local. Only WhatsApp itself needs a connection.

**Can we keep the data in our own region?** Yes. Pick your Supabase region, or run
with no backend at all and keep everything on the device.

**Who can see the cards we scan?** With no backend: nobody but the rep. With
Supabase: only the rep who scanned it, enforced by row level security in your own
project.

<br>

## What is in here

| Path | |
| --- | --- |
| [`namecard-scanner/src/lib/`](namecard-scanner/src/lib) | The interesting half: `parseCard`, `phone`, `draft`, `draftIntl`, `ocr` |
| [`namecard-scanner/src/components/`](namecard-scanner/src/components) | Six screens, no UI framework, hand-written CSS |
| [`namecard-scanner/supabase/`](namecard-scanner/supabase) | Migrations and three edge functions |
| [`namecard-scanner/tests/`](namecard-scanner/tests) · [`e2e/`](namecard-scanner/e2e) | 191 unit tests and 39 Playwright journeys |
| [`namecard-scanner/marketing/`](namecard-scanner/marketing) | The sell sheet, the QR code and these diagrams |
| [**`namecard-scanner/README.md`**](namecard-scanner/README.md) | The engineering write-up: every decision, and the bug that caused it |

```bash
npm test         # 191 unit tests — parsing, phone resolution, drafting, i18n
npm run e2e      # 39 Playwright journeys, including a fake-camera capture
npm run build    # type-check and production bundle
```

The end-to-end suite is not mocked: it renders a business card to a PNG, feeds it
to the running app, waits for the real OCR engine to read it, and asserts on the
`wa.me` URL that comes out.

<br>

## Contributing

Pull requests welcome, particularly **cards from markets this does not handle
well yet**. Phone number conventions are the hard part and the most valuable
thing an outsider can contribute: add a failing case to
`namecard-scanner/tests/` with the card's real layout, and the fix usually falls
out of it.

## Licence

[MIT](LICENSE) — use it, fork it, ship it inside your own sales org, rebrand it
entirely. No attribution required, though a ⭐ helps other sales teams find it.

<div align="center">
<br>
<sub><a href="https://handshake-olive.vercel.app">handshake-olive.vercel.app</a> · built with Claude Code</sub>
</div>
