// Runs Lighthouse against a URL using our own headless Chrome instance instead of Google's
// hosted PageSpeed Insights API. This removes Google's queue/rate-limit variability, which was
// the main source of analysis timeouts, at the cost of needing a Chrome binary at runtime.
//
// Locally (or anywhere without a Vercel/Lambda-style environment), `puppeteer`'s bundled
// Chromium is used. In a serverless environment, a full desktop Chromium is both too large to
// deploy and often won't launch, so `@sparticuz/chromium` (a build made for exactly this) is
// used with `puppeteer-core` instead. Both imports are dynamic so the unused path's package
// never gets pulled into the other environment's bundle.
import type { Browser, Page, HTTPRequest } from 'puppeteer-core';
import { isBlockedHost } from '@/lib/url-validation';

function isServerlessEnvironment(): boolean {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.LAMBDA_TASK_ROOT);
}

async function launchBrowser(): Promise<Browser> {
  if (isServerlessEnvironment()) {
    const [{ default: chromium }, puppeteerCore] = await Promise.all([
      import('@sparticuz/chromium'),
      import('puppeteer-core'),
    ]);
    return puppeteerCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    }) as unknown as Browser;
  }

  const { default: puppeteer } = await import('puppeteer');
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  }) as unknown as Browser;
}

// We only validate the URL a user types in (and each redirect hop the reachability check
// follows) before this ever runs, but the page itself, once loaded, can still try to navigate
// or fetch resources from anywhere, including internal addresses (a redirect Lighthouse follows
// during its own navigation, or a script/img/fetch on the page reaching for something internal).
// Intercepting every request here and blocking any that resolve to a blocked host closes that
// gap at the one place all of that traffic actually has to pass through.
function guardRequests(page: Page): void {
  page.on('request', (request: HTTPRequest) => {
    let hostname: string;
    try {
      hostname = new URL(request.url()).hostname;
    } catch {
      request.abort('blockedbyclient').catch(() => {});
      return;
    }

    if (isBlockedHost(hostname)) {
      request.abort('blockedbyclient').catch(() => {});
      return;
    }

    request.continue().catch(() => {});
  });
}

// Returns the raw Lighthouse report (LHR). Its shape is what PageSpeed Insights' own
// `lighthouseResult` field already models in ps-api.ts (PSI is itself just a hosted wrapper
// around a Lighthouse run), so callers cast this to that existing type rather than duplicating it.
export async function runLighthouse(url: string, maxWaitForLoadMs: number): Promise<unknown> {
  const lighthouse = (await import('lighthouse')).default;
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    guardRequests(page);

    const result = await lighthouse(url, {
      output: 'json',
      logLevel: 'error',
      onlyCategories: ['performance'],
      formFactor: 'mobile',
      maxWaitForLoad: maxWaitForLoadMs,
      screenEmulation: {
        mobile: true,
        width: 412,
        height: 823,
        deviceScaleFactor: 1.75,
        disabled: false,
      },
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        cpuSlowdownMultiplier: 4,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
      },
    }, undefined, page);

    if (!result?.lhr) {
      throw new Error('Lighthouse did not return a report');
    }

    return result.lhr;
  } finally {
    await browser.close();
  }
}
