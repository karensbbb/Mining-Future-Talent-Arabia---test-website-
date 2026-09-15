# MINING @ Future Talent Arabia

The mining and metals practice site: a landing page plus five inner pages, built
as plain static HTML/CSS/JS with no build step. Open any `.html` file directly or
serve the folder.

## Running it

```bash
npm run serve     # http://localhost:4321
npm test          # 120 behavioural checks against the running server
npm run shot -- http://localhost:4321/ --all --scale 1
```

`npm test` needs the server running in another terminal. It checks that every
page loads, that links and assets resolve, that the mobile drawer opens and
closes, that nothing is clipped between 320px and 1440px, that the forms refuse
an empty submit, and that every form still points at the mining desk address.

## Pages

| File | Purpose |
| --- | --- |
| `index.html` | Landing page — hero, proof, mandate, **commitments**, capabilities, commodities, employers, disciplines, lifecycle, Saudization, candidates, process, FAQ, enquiry form, insights |
| `services.html` | The seven services in detail, plus the engagement stages |
| `commodities.html` | Commodity-by-commodity coverage with anchors (`#gold`, `#phosphate`, …) |
| `for-candidates.html` | Candidate path — what registering gets you, disciplines, registration form, candidate FAQ |
| `contact.html` | Enquiry form, what happens next, direct contact details |
| `insights.html` | Three long-form market briefs with anchors (`#salary-guide`, `#saudization`, `#rampup`) |

## Files

```
assets/css/site.css        design tokens, primitives, and the v1 sections kept from the old build
assets/css/components.css  the conversion layer added in v2 (nav drawer, forms, cards, inner pages)
assets/js/site.js          header state, mobile drawer, reveal, counters, form handling, FAQ accordion
tools/serve.js             static dev server
tools/smoke.js             behavioural test suite
tools/screenshot.js        deterministic screenshots via Puppeteer
archive/                   the previous single-page build. NOT the live site — it still
                           has the old STAGE 01-05 labels and no lifecycle buttons.
```

Header and footer markup is duplicated per page rather than templated. If you
change navigation, change it in all six files — `npm test` will catch broken
links but not a missing menu item.

---

## Forms — where enquiries go

There are three, and they are deliberately different lengths:

| Form | Where | Fields |
| --- | --- | --- |
| **Brief card** | `index.html` — split-panel card, photo left, fields right | Name, Company, Email address, Brief |
| **Detailed brief** | `contact.html` | Name, email, phone, company, enquiry type, service, commodity, location, timing, message |
| **Candidate registration** | `for-candidates.html` | Name, email, phone, discipline, experience, location, arrangement, commodities, message |

The landing page one is short on purpose — it is the low-friction route in, and
it links across to the detailed form for anyone who wants to give full context
up front. `npm test` asserts it stays at those four fields.

All three deliver to **recruitment@futuretalentarabia.com**. Each is wired the
same way:

```html
<form class="form" data-enquiry
      data-endpoint="https://formsubmit.co/ajax/recruitment@futuretalentarabia.com"
      data-mailto="recruitment@futuretalentarabia.com"
      data-subject="Mining talent enquiry">
```

- `data-endpoint` — the relay that forwards the submission to the inbox as email.
- `data-mailto` — the fallback. If the POST fails for any reason (relay down,
  visitor offline, extension blocking it), `site.js` opens a pre-filled mail
  draft to the same address. An enquiry is never silently lost.
- `data-subject` — the subject line the desk will see.

Each form also carries a honeypot (`_honey`) that is stripped before send, and
`_captcha=false` so submitters are not bounced through a challenge page.

### One-time activation — required before the first real enquiry

FormSubmit will not forward mail to an address it has not verified. **Submit the
contact form once yourself.** A confirmation email arrives at
recruitment@futuretalentarabia.com; click the link in it. Every submission after
that is delivered straight to the inbox. Until you do, submissions will not
arrive.

### If you would rather not use a third-party relay

Submissions pass through formsubmit.co, which means enquiry contents transit a
third party. Given the confidentiality commitment this site makes, you may
prefer not to. Swapping is a one-line change per form — replace the
`data-endpoint` value with any handler that accepts a `multipart/form-data` POST
and returns 2xx:

- your own mail handler on the site's hosting;
- your ATS or CRM's inbound webhook;
- Formspree / Basin / Web3Forms, if you want an account-backed service.

`data-mailto` stays as it is either way, so the fallback keeps working.
`npm test` asserts that every form on the site points at the desk address — it
will fail loudly if a form is ever wired somewhere else.

---

## Before this goes live

### The figures on the page

Two kinds of number appear, and they are not the same thing:

**Sector data** — the hero stat strip. Sourced to the Ministry of Industry &
Mineral Resources and Vision 2030 programme targets, and captioned as
sector-wide beneath the strip. Not a claim about FTA.

**Service commitments** — the employer image chips (`48h` first longlist, `14`
disciplines, `6` GCC markets) and the four process SLA chips (response within 1
business day · first longlist in 48 hours · shortlist inside 10 working days ·
tracked to your start date). These state what the desk undertakes to do, not
past performance. The SLA chips appear on three pages — `index.html`,
`services.html` and `contact.html` — so change all three together.

The FAQ's commercial answers (fee model, replacement guarantee) should track
your terms of business.

**No awards, client logos, testimonials or placement counts appear anywhere on
this site.** If you add them later the slots are ready: `.trust__track` takes
logo images in place of the wordmarks (keep the list duplicated so the marquee
loops), `.proofcard` takes awards or testimonials as-is, and both `.chip` and
`.strip__fig` support `data-count` for the count-up animation.

### Other launch items

- Canonical URLs assume the site lives at `https://www.futuretalentarabia.com/mining/`. Change them if the path differs.
- Replace `assets/img/fta-logo.png` as the favicon with a proper favicon set — a 180×150 PNG is not ideal at 16px.
- The LinkedIn URL in the footer is a guess; confirm it.
- Add a privacy policy and link it from the form consent checkboxes.

---

## What changed from the previous build

The old single page is in `archive/index-v1.html`. It was well-made but was a
brochure, not a site that converts. The gaps it had:

1. **No mobile navigation.** The nav was hidden below 62rem with nothing in its place — the site was unnavigable on a phone. Now a full drawer.
2. **No form.** A `mailto:` link was the only way to make contact.
3. **No candidate path.** Entirely client-facing; half the audience had nowhere to go.
4. **No proof layer.** Nothing about FTA's own credibility.
5. **No commodity coverage**, the most obvious mining-specific SEO and qualification surface.
6. **No process or service levels** — nothing answering "what happens after I contact you".
7. **No FAQ**, which is where objections and long-tail search both live.
8. **Thin SEO** — no Open Graph, no Twitter card, no structured data, no canonical.
9. **One CTA type.** No separation of hire / apply / consult intents.
10. **No inner pages** at all, so no room for depth.

All ten are addressed. The palette, typography and the strongest v1 sections
(disciplines, lifecycle, Saudization) were kept.
