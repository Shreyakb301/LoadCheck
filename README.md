# LoadCheck: Why is my website slow?

Google's PageSpeed Insights already measures your site. LoadCheck doesn't try to measure it better, it tells you what to actually do with the numbers.

Paste a URL and LoadCheck turns a Lighthouse report into a short, plain-English list: what's worth fixing, what you can safely ignore, and how real visitors are experiencing your page compared to the lab test.

LoadCheck runs Lighthouse itself, using its own headless Chrome instance, rather than calling Google's hosted PageSpeed Insights API. This removes the queue/rate-limit delays that API can have under load, which used to cause slow or timed-out analyses.

## What it does

- **Leads with a verdict, not a score.** The headline is "3 things worth fixing," not "62/100." The score is still there if you want it, tucked into a collapsed "Technical details" section.
- **Ranks by impact and effort.** Each issue is tagged Fix now, Fix next, or lower priority, based on how much it matters and how much work it takes, so you know where to start.
- **Tells you what to skip.** A dedicated "Not worth your time right now" list explains, in one line each, why a flagged audit isn't worth chasing.
- **Compares lab data to real visitors.** When Chrome UX Report data is available for the page, LoadCheck shows how real visitors experienced it alongside the synthetic test, so a scary lab number doesn't send you chasing a problem nobody actually has.
- **Calls out what's already working.** A "What's working well" section surfaces the audits that already pass.
- **Explain for Simple or Developer.** Every issue can be read in plain language or in technical terms.

## Setup

### Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

The first `npm install` downloads a local copy of Chromium for `puppeteer` (used only in
development). This is a one-time ~200-300MB download and needs a bit of free disk space.

### Real-visitor comparison data (optional)

The "how real visitors experienced this page" comparison uses Google's Chrome UX Report (CrUX)
API, which is separate from PageSpeed Insights and needs its own API key setup:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select one)
3. Enable the **Chrome UX Report API**
4. Create an API key (Credentials → API keys)
5. Copy the key and add it to `.env.local`:

```
PAGESPEED_API_KEY=your_key_here
```

Without this, LoadCheck still fully works, the real-visitor comparison card just won't appear
(most sites also don't have enough Chrome UX Report traffic for this data to exist anyway).

## Deploy to Vercel

```bash
vercel
```

Production needs `@sparticuz/chromium` + `puppeteer-core` to launch Chrome inside a serverless
function (already a regular dependency, `puppeteer`'s own bundled Chromium is dev-only since it's
too large to ship there). This is the standard, well-established pattern for running headless
Chrome on Vercel/Lambda, but hasn't been verified against a live deployment yet, worth a real
test analysis right after deploying. If it needs more memory than the function gets by default,
that's configured via a `functions` block in `vercel.json`.

Set `PAGESPEED_API_KEY` in Vercel's environment variables if you want real-visitor comparison data.

## Privacy

We analyze the public URL you provide. No account or project data is stored.
