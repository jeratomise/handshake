# LinkedIn launch post

Everything needed for the release announcement. Copy the block, attach
`docs/linkedin-announcement.png`, post, then paste the first comment
immediately.

**Rebuild the image with `npm run linkedin-card`** if any of the numbers or URLs
in it change.

---

## How to post it

1. **Image first.** Attach `docs/linkedin-announcement.png` (1200×1500). LinkedIn
   renders 4:5 portrait uncropped, which on a phone fills most of the screen —
   a landscape image gets roughly half the height.
2. **No link in the post body.** LinkedIn suppresses reach on posts with an
   outbound link. The repo URL goes in the first comment, posted within seconds
   of publishing, and the body says so. The URL is also printed on the image, so
   the destination is visible even to someone who never opens the comments.
3. **Time it** for Tuesday–Thursday, 08:00–09:00 Singapore, when the local feed
   is being read before the day starts.
4. **Answer every comment for the first two hours.** Replies in the first hour
   weigh more than anything else in LinkedIn's ranking, and a reply that adds a
   detail is worth more than "thanks!".
5. Do not edit the post for the first hour. Edits reset its distribution.

---

## The post

> Our BDEs came back from a trade show with 40 business cards.
>
> They followed up on 6.
>
> It was never a motivation problem. Typing a number off a card into WhatsApp,
> then writing something that doesn't read like a template, takes about four
> minutes a card. Times 40, after three days on your feet, on top of a full
> pipeline. The other 34 quietly became nothing.
>
> So we rebuilt those four minutes as twenty seconds.
>
> Point your phone at the card → it reads the name and works out which of the
> four numbers on there is actually the mobile → one question, "where did you
> meet?" → a drafted message you can edit → WhatsApp opens with it ready to go.
>
> Today we're open sourcing the whole thing. MIT licence. Not a demo, not a
> freemium tier — the entire app, including the deployment config.
>
> Three decisions I'd defend in any room:
>
> 𝟭. The card is read on the phone itself. Nothing is uploaded. The person who
> handed over that card gave it to a human, not to a cloud vendor. It also means
> scanning costs $0 forever, however many reps you have — most scanners are
> built on a per-image vision API, so they get more expensive the more your team
> actually uses them.
>
> 𝟮. Nothing sends automatically. Your rep reads every message and taps send.
> Anything else is how a company ends up banned from WhatsApp.
>
> 𝟯. Japanese and Korean contacts get their message in their own language —
> addressed 〜様 by family name, 〜님 by full name. Every English-language tool I
> tried got this backwards, and on a first message it quietly costs you the
> reply.
>
> If you run a sales team and have someone technical, you can have your own
> branded copy running on your own infrastructure in about 15 minutes, for
> nothing a month.
>
> Repo and live demo in the comments. Take it.
>
> #sales #opensource #b2bsales #salesenablement

## The first comment

> Repo (MIT, the whole app): https://github.com/jeratomise/handshake
>
> Live demo, works on any phone: https://handshake-olive.vercel.app
>
> Happy to answer anything about the phone number parsing — it turned out to be
> far harder than the OCR. A beta tester sent in a Malaysian card whose company
> tax number was a perfectly valid Singapore mobile, and it won the WhatsApp
> link outright.

---

## Shorter variant

For a second post a week or two later, or if the long one feels off-brand.

> 40 business cards from a trade show. 6 follow-ups.
>
> Not a motivation problem — typing a number off a card and writing a message
> that isn't a template takes four minutes each.
>
> So we built a scanner that does it in twenty. Point at the card, answer one
> question about where you met, review the draft, send. The OCR runs on the
> phone itself, so nothing is uploaded and scanning costs nothing at any volume.
>
> Open sourced it today under MIT. If you run a sales team and have someone
> technical, it's a fifteen-minute deploy.
>
> Link in the comments.
>
> #sales #opensource

---

## A note on the numbers

"40 cards, 6 follow-ups" is the anecdote this project was built from. If a
sceptical comment asks where the figure comes from, the honest answer is that it
is one team's experience rather than a study — say so. Being straight about it
costs nothing and a fabricated statistic that gets challenged costs the post.
