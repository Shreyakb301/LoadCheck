# LoadCheck: Why is my website slow?

Google's PageSpeed Insights already measures your site. LoadCheck doesn't try to measure it better, it tells you what to actually do with the numbers.

Paste a URL and LoadCheck turns a Lighthouse report into a short, plain-English list: what's worth fixing, what you can safely ignore, and how real visitors are experiencing your page compared to the lab test.

## What it does

- **Leads with a verdict, not a score.** The headline is "3 things worth fixing," not "62/100." The score is still there if you want it, tucked into a collapsed "Technical details" section.
- **Ranks by impact and effort.** Each issue is tagged Fix now, Fix next, or lower priority, based on how much it matters and how much work it takes, so you know where to start.
- **Tells you what to skip.** A dedicated "Not worth your time right now" list explains, in one line each, why a flagged audit isn't worth chasing.
- **Compares lab data to real visitors.** When Chrome UX Report data is available for the page, LoadCheck shows how real visitors experienced it alongside the synthetic test, so a scary lab number doesn't send you chasing a problem nobody actually has.
- **Calls out what's already working.** A "What's working well" section surfaces the audits that already pass.
- **Explain for Simple or Developer.** Every issue can be read in plain language or in technical terms.

## Setup

### Get a Google PageSpeed Insights API key (optional but recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select one)
3. Enable the **PageSpeed Insights API**
4. Create an API key (Credentials → API keys)
5. Copy the key and add it to `.env.local`:

```
PAGESPEED_API_KEY=your_key_here
```

Without a key, the API works but has very low quota (sometimes 0/day for unverified projects). With a key, you get 25,000 queries/day free.

### Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Deploy to Vercel

```bash
vercel
```

Set `PAGESPEED_API_KEY` in Vercel's environment variables.

## Privacy

We analyze the public URL you provide. No account or project data is stored.
