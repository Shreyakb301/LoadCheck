# LoadCheck: Why is my website slow?

A minimal, visual performance report tool. Paste a URL, get the top 3 reasons it's slow.

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
