import { NextRequest, NextResponse } from 'next/server';
import { Report, APIResponse, bytesToLabel } from '@/lib/types';
import { normalizeAndValidateUrl, isBlockedHost } from '@/lib/url-validation';
import { runLighthouse } from '@/lib/lighthouse-runner';

const CRUX_API_URL = 'https://chromeuxreport.googleapis.com/v1/records:queryRecord';

interface RawAudit {
  title: string;
  description: string;
  score?: number | string;
  scoreDisplayMode?: string;
  details?: {
    items?: Array<{
      title?: string;
      url?: string;
      size?: number;
      wastedBytes?: number;
      wastedMS?: number;
      wastedMs?: number;
      resourceSize?: number;
      resourceBytes?: number;
      totalBytes?: number;
      totalMS?: number;
      node?: string;
      snippet?: string;
      displayString?: string;
      entity?: string | { type?: string; text?: string; url?: string };
      transferSize?: number;
      blockingTime?: number;
      mainThreadTime?: number;
      reasons?: {
        items?: Array<{
          size?: number;
          url?: string;
          node?: string;
          snippet?: string;
          resourceSize?: number;
          resourceBytes?: number;
          wastedBytes?: number;
          wastedMS?: number;
          totalBytes?: number;
          totalMS?: number;
        }>;
      };
    }>;
    totals?: {
      bytes?: number;
      ms?: number;
      score?: number;
    };
    summary?: {
      wastedBytes?: number;
      wastedMs?: number;
    };
    chains?: Record<string, unknown>;
    longestChain?: {
      duration?: number;
      length?: number;
      transferSize?: number;
    };
    overall?: number;
    baseScore?: number;
  };
  numericValue?: number;
  numericUnit?: string;
  displayValue?: string;
}

interface LighthouseResult {
  fetchTime: string;
  finalUrl: string;
  displayUrl: string;
  categories: {
    performance: {
      title: string;
      score: number;
      scoreDisplayMode: string;
      icon?: string;
    };
  };
  audits: Record<string, RawAudit>;
  runtimeError?: {
    code: string;
    message: string;
  };
  abnormalTermination?: boolean;
}

interface CrUXMetric {
  percentile: number;
  category: 'FAST' | 'AVERAGE' | 'SLOW';
}

interface CrUXLoadingExperience {
  id?: string;
  metrics?: {
    LARGEST_CONTENTFUL_PAINT_MS?: CrUXMetric;
    CUMULATIVE_LAYOUT_SHIFT_SCORE?: CrUXMetric;
    FIRST_CONTENTFUL_PAINT_MS?: CrUXMetric;
    INTERACTION_TO_NEXT_PAINT?: CrUXMetric;
    EXPERIMENTAL_TIME_TO_FIRST_BYTE?: CrUXMetric;
  };
  overall_category?: 'FAST' | 'AVERAGE' | 'SLOW';
}

function extractNumericValue(audit: RawAudit): number | null {
  if (typeof audit.numericValue === 'number') return audit.numericValue;
  if (typeof audit.score === 'number' && audit.numericUnit) return audit.score;
  return null;
}

function extractWastedBytes(audit: RawAudit): number {
  let total = 0;

  if (audit.details?.totals?.bytes) {
    total += audit.details.totals.bytes;
  }

  if (audit.details?.summary?.wastedBytes) {
    total += audit.details.summary.wastedBytes;
  }

  if (Array.isArray(audit.details?.items)) {
    for (const item of audit.details.items) {
      if (typeof item.wastedBytes === 'number') total += item.wastedBytes;
      if (typeof item.resourceBytes === 'number') total += item.resourceBytes;
      if (typeof item.totalBytes === 'number') total += item.totalBytes;
    }
  }

  if (Array.isArray(audit.details?.items)) {
    for (const item of audit.details.items) {
      if (Array.isArray(item.reasons?.items)) {
        for (const reason of item.reasons.items) {
          if (typeof reason.wastedBytes === 'number') total += reason.wastedBytes;
          if (typeof reason.resourceBytes === 'number') total += reason.resourceBytes;
        }
      }
    }
  }

  return total;
}

function extractWastedMs(audit: RawAudit): number {
  let total = 0;

  if (audit.details?.totals?.ms) {
    total += audit.details.totals.ms;
  }

  if (audit.details?.summary?.wastedMs) {
    total += audit.details.summary.wastedMs;
  }

  if (Array.isArray(audit.details?.items)) {
    for (const item of audit.details.items) {
      if (typeof item.wastedMS === 'number') total += item.wastedMS;
      else if (typeof item.wastedMs === 'number') total += item.wastedMs;
      if (typeof item.totalMS === 'number') total += item.totalMS;
      if (typeof item.mainThreadTime === 'number') total += item.mainThreadTime;
    }
  }

  return total;
}

function extractItems(audit: RawAudit): Array<{ url?: string; name?: string; size?: number; wastedBytes?: number; wastedMS?: number; }> {
  const items: Array<{ url?: string; name?: string; size?: number; wastedBytes?: number; wastedMS?: number; }> = [];

  if (!Array.isArray(audit.details?.items)) return items;

  for (const item of audit.details.items) {
    const entry: { url?: string; name?: string; size?: number; wastedBytes?: number; wastedMS?: number; } = {};

    if (typeof item.url === 'string') entry.url = item.url;
    if (typeof item.title === 'string') entry.name = item.title;
    if (!entry.name && typeof item.entity === 'string') entry.name = item.entity;
    if (!entry.name && typeof item.entity === 'object' && typeof item.entity?.text === 'string') entry.name = item.entity.text;
    if (typeof item.size === 'number') entry.size = item.size;
    if (typeof item.resourceSize === 'number') entry.size = item.resourceSize;
    if (entry.size === undefined && typeof item.transferSize === 'number') entry.size = item.transferSize;
    if (entry.size === undefined && typeof item.totalBytes === 'number') entry.size = item.totalBytes;
    if (typeof item.wastedBytes === 'number') entry.wastedBytes = item.wastedBytes;
    if (typeof item.wastedMS === 'number') entry.wastedMS = item.wastedMS;
    else if (typeof item.wastedMs === 'number') entry.wastedMS = item.wastedMs;
    if (entry.wastedMS === undefined && typeof item.blockingTime === 'number') entry.wastedMS = item.blockingTime;
    if (entry.wastedMS === undefined && typeof item.mainThreadTime === 'number') entry.wastedMS = item.mainThreadTime;

    if (Array.isArray(item.reasons?.items)) {
      for (const reason of item.reasons.items) {
        if (typeof reason.url === 'string' && !entry.url) entry.url = reason.url;
        if (typeof reason.size === 'number' && !entry.size) entry.size = reason.size;
        if (typeof reason.wastedBytes === 'number') entry.wastedBytes = (entry.wastedBytes || 0) + reason.wastedBytes;
        if (typeof reason.wastedMS === 'number') entry.wastedMS = (entry.wastedMS || 0) + reason.wastedMS;
      }
    }

    items.push(entry);
  }

  return items;
}

function getMetricValue(audits: Record<string, RawAudit>, key: string): number | null {
  const audit = audits[key];
  if (!audit) return null;

  return extractNumericValue(audit);
}

function parseScore(score: number | string | undefined): number | null {
  if (typeof score === 'number') {
    if (score >= 0 && score <= 1) return Math.round(score * 100);
    if (score > 1) return Math.round(score);
    return null;
  }
  return null;
}

function detectFramework(audits: Record<string, RawAudit>, finalUrl: string): string | null {
  const allTitles = Object.values(audits)
    .map(a => (a.title || '').toLowerCase())
    .join(' ');

  if (allTitles.includes('next.js') || allTitles.includes('nextjs')) return 'Next.js';
  if (allTitles.includes('react')) return 'React';

  const url = finalUrl.toLowerCase();
  if (url.includes('wp-') || url.includes('wordpress') || url.includes('wp-content') || url.includes('wp-json')) return 'WordPress';
  if (url.includes('myshopify') || url.includes('shopify') || url.includes('/cart') || url.includes('cdn.shopify')) return 'Shopify';

  return null;
}

function parseAudits(audits: Record<string, RawAudit>) {
  return Object.entries(audits)
    .map(([key, audit]) => ({
      key,
      title: audit.title || key,
      description: audit.description || '',
      score: typeof audit.score === 'number' ? audit.score : null,
      scoreDisplayMode: audit.scoreDisplayMode || '',
      wastedBytes: extractWastedBytes(audit),
      wastedMs: extractWastedMs(audit),
      numericValue: extractNumericValue(audit),
      numericUnit: audit.numericUnit || null,
      displayValue: audit.displayValue || null,
      items: extractItems(audit),
    }))
    .filter(a => a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'notLoaded' && a.scoreDisplayMode !== 'informative');
}

const POSITIVE_METRIC_COPY: Record<string, { title: string; description: string }> = {
  'largest-contentful-paint': {
    title: 'Main content loads fast',
    description: 'Visitors see your main content quickly, so they don\'t wait around.',
  },
  'first-contentful-paint': {
    title: 'Something appears right away',
    description: 'The page starts rendering fast, so visitors aren\'t staring at a blank screen.',
  },
  'total-blocking-time': {
    title: 'The page responds quickly',
    description: 'Clicks and taps register right away instead of being blocked by JavaScript.',
  },
  'cumulative-layout-shift': {
    title: 'Nothing jumps around',
    description: 'Elements stay put while the page loads, so visitors don\'t misclick.',
  },
  'speed-index': {
    title: 'The page fills in quickly',
    description: 'Visible content appears fast instead of loading in slowly.',
  },
};

function getMetrics(audits: Record<string, RawAudit>) {
  const metrics: Array<{ label: string; value: number; unit: string; status: 'good' | 'needs-improvement' | 'poor'; description: string; soWhat: string; }> = [];
  const positives: Array<{ title: string; description: string }> = [];

  const addMetric = (label: string, key: string, unit: string, description: string, soWhat: string) => {
    const audit = audits[key];
    if (!audit) return;
    const value = extractNumericValue(audit);
    if (value === null) return;

    let numericValue = value;
    let displayUnit = unit;

    if (unit === 'seconds' && typeof value === 'number') {
      // Lighthouse returns time metrics in milliseconds
      numericValue = value / 1000;
    } else if (unit === 'milliseconds' && typeof value === 'number') {
      numericValue = value;
    } else if (unit === 'bytes' && typeof value === 'number') {
      numericValue = value;
    } else {
      return;
    }

    let status: 'good' | 'needs-improvement' | 'poor' = 'needs-improvement';

    if (key === 'largest-contentful-paint') {
      if (numericValue <= 1.8) status = 'good';
      else if (numericValue <= 3.0) status = 'needs-improvement';
      else status = 'poor';
    } else if (key === 'first-contentful-paint') {
      if (numericValue <= 0.8) status = 'good';
      else if (numericValue <= 1.8) status = 'needs-improvement';
      else status = 'poor';
    } else if (key === 'total-blocking-time') {
      if (numericValue <= 200) status = 'good';
      else if (numericValue <= 600) status = 'needs-improvement';
      else status = 'poor';
    } else if (key === 'cumulative-layout-shift') {
      if (numericValue <= 0.1) status = 'good';
      else if (numericValue <= 0.25) status = 'needs-improvement';
      else status = 'poor';
    } else if (key === 'speed-index') {
      if (numericValue <= 1.2) status = 'good';
      else if (numericValue <= 2.5) status = 'needs-improvement';
      else status = 'poor';
    }

    metrics.push({
      label,
      value: numericValue,
      unit: displayUnit,
      status,
      description,
      soWhat,
    });

    if (status === 'good') {
      const copy = POSITIVE_METRIC_COPY[key];
      if (copy) positives.push(copy);
    }
  };

  addMetric('LCP', 'largest-contentful-paint', 'seconds',
    'Largest Contentful Paint: the time until the main content appears',
    'Visitors wait too long for the main content to appear.');

  addMetric('FCP', 'first-contentful-paint', 'seconds',
    'First Contentful Paint: the time until any content appears',
    'Visitors stare at a blank screen longer than they should.');

  addMetric('TBT', 'total-blocking-time', 'milliseconds',
    'Total Blocking Time: how long the page is unresponsive after load',
    'Visitors try to interact but the page doesn\'t respond.');

  addMetric('CLS', 'cumulative-layout-shift', 'unit',
    'Cumulative Layout Shift: how much elements jump around',
    'Content moves unexpectedly, causing misclicks.');

  addMetric('Speed Index', 'speed-index', 'seconds',
    'Speed Index: how quickly the page visually fills in',
    'The page takes too long to show what it looks like.');

  return { metrics, positives };
}

const POSITIVE_AUDIT_COPY: Record<string, { title: string; description: string }> = {
  'unused-css-rules': {
    title: 'CSS is lean',
    description: 'You\'re not shipping much unused CSS.',
  },
  'unused-javascript': {
    title: 'JavaScript is lean',
    description: 'You\'re not shipping much unused JavaScript.',
  },
  'render-blocking-insight': {
    title: 'Nothing blocks the first paint',
    description: 'No render-blocking resources are delaying the page from rendering.',
  },
  'unminified-css': {
    title: 'CSS is minified',
    description: 'Your CSS is already compressed for production.',
  },
  'unminified-javascript': {
    title: 'JavaScript is minified',
    description: 'Your JavaScript is already compressed for production.',
  },
  'image-delivery-insight': {
    title: 'Images are delivered efficiently',
    description: 'Your images are appropriately sized and compressed for how they\'re displayed.',
  },
  'legacy-javascript-insight': {
    title: 'No legacy JavaScript',
    description: 'You\'re not shipping unnecessary polyfills to modern browsers.',
  },
};

function getAuditPositives(parsedAudits: ReturnType<typeof parseAudits>, excludeKeys: Set<string>) {
  const positives: Array<{ title: string; description: string }> = [];

  for (const audit of parsedAudits) {
    if (excludeKeys.has(audit.key)) continue;
    const copy = POSITIVE_AUDIT_COPY[audit.key];
    if (!copy) continue;
    if (audit.wastedBytes === 0 && audit.wastedMs === 0) {
      positives.push(copy);
    }
  }

  return positives;
}

// Quick reachability check so a dead/unreachable site fails in seconds instead of burning
// the full ~60s PageSpeed timeout. Only network-level failures (DNS, connection refused,
// no response in time) count as unreachable, any actual HTTP response (even 404 or 500)
// means the host is up, so PageSpeed gets a chance to analyze it.
// Kept short: the route's total execution budget (maxDuration = 60s) has to cover this check
// plus the actual PageSpeed call below, so this can't eat too much of that budget.
const REACHABILITY_TIMEOUT_MS = 5000;

// Bounds the worst case: each hop gets its own REACHABILITY_TIMEOUT_MS, and this check needs to
// stay small relative to the PSI/Lighthouse budgets that follow it.
const MAX_REDIRECTS = 3;

export async function checkReachable(normalizedUrl: string): Promise<{ reachable: true } | { reachable: false; error: string }> {
  // GET rather than HEAD: some servers reject HEAD at the connection level (not even a 405
  // response), and GET is the more universally supported method for a one-shot reachability probe.
  //
  // redirect: 'manual' + a hand-rolled loop, not 'follow': a URL can look public but redirect to
  // an internal address (cloud metadata endpoints, localhost, an internal service). We only
  // block hosts at the URL a user typed in, so blindly following redirects would let that
  // straight through to a real network request. Each hop gets re-validated the same way.
  try {
    let currentUrl = normalizedUrl;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(REACHABILITY_TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        if (hop === MAX_REDIRECTS) {
          return { reachable: false, error: 'This website redirects too many times. It may be misconfigured.' };
        }
        const nextUrl = new URL(response.headers.get('location')!, currentUrl);
        if (nextUrl.protocol !== 'http:' && nextUrl.protocol !== 'https:') {
          return { reachable: false, error: 'We can only analyze http:// and https:// URLs.' };
        }
        if (isBlockedHost(nextUrl.hostname)) {
          return { reachable: false, error: 'We can only analyze public websites. Localhost and private networks aren\'t reachable from our servers.' };
        }
        response.body?.cancel();
        currentUrl = nextUrl.toString();
        continue;
      }

      response.body?.cancel();
      return { reachable: true };
    }
    return { reachable: false, error: 'This website redirects too many times. It may be misconfigured.' };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'AbortError' || name === 'TimeoutError') {
      return { reachable: false, error: `This website didn't respond within ${REACHABILITY_TIMEOUT_MS / 1000} seconds. It may be down, very slow, or blocking automated requests.` };
    }

    // Node's fetch (undici) exposes the underlying DNS/socket error on `cause`. ENOTFOUND
    // specifically means the domain doesn't resolve at all (no such domain), distinct from a
    // domain that resolves but refuses the connection, times out, or has a bad certificate.
    // (EAI_AGAIN is a transient resolver hiccup, not "doesn't exist", so it's left out of this
    // and falls through to the generic message below.)
    const cause = err instanceof Error ? (err.cause as { code?: string } | undefined) : undefined;
    if (cause?.code === 'ENOTFOUND') {
      return { reachable: false, error: 'This website doesn\'t exist. Double-check the domain name for typos.' };
    }

    return { reachable: false, error: 'We couldn\'t reach this website. Double-check the URL is correct and the site is publicly accessible.' };
  }
}

// runLighthouse's own maxWaitForLoad only bounds the page-load phase; this bounds the whole
// operation (Chrome launch + navigation + audit computation) so a slow post-load phase can't
// blow the route's overall time budget. Doesn't cancel the underlying run, it just stops
// waiting on it, the browser still closes itself once that run finishes in the background.
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error(`Timed out after ${ms}ms`), { name: 'TimeoutError' }));
    }, ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Best-effort: field data is a nice-to-have comparison, not something the analysis should ever
// fail over. Requires the Chrome UX Report API to be enabled for PAGESPEED_API_KEY separately
// from the PageSpeed Insights API; if it isn't (or the URL has no CrUX data, which is common for
// smaller sites), this quietly returns {} and the report just omits the field comparison.
async function fetchCruxFieldData(normalizedUrl: string): Promise<{ loadingExperience?: CrUXLoadingExperience; originLoadingExperience?: CrUXLoadingExperience }> {
  if (!process.env.PAGESPEED_API_KEY) return {};

  const queryCrux = async (body: Record<string, string>): Promise<CrUXLoadingExperience | undefined> => {
    try {
      const res = await fetch(`${CRUX_API_URL}?key=${process.env.PAGESPEED_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, formFactor: 'PHONE' }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return undefined;
      const data = await res.json();
      const rawMetrics = data?.record?.metrics;
      if (!rawMetrics) return undefined;

      const toMetric = (m: { percentiles?: { p75?: number } } | undefined, thresholds: [number, number]): CrUXMetric | undefined => {
        const percentile = m?.percentiles?.p75;
        if (typeof percentile !== 'number') return undefined;
        const category = percentile <= thresholds[0] ? 'FAST' : percentile <= thresholds[1] ? 'AVERAGE' : 'SLOW';
        return { percentile, category };
      };

      return {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: toMetric(rawMetrics.largest_contentful_paint, [2500, 4000]),
          CUMULATIVE_LAYOUT_SHIFT_SCORE: toMetric(rawMetrics.cumulative_layout_shift, [0.1, 0.25]),
          FIRST_CONTENTFUL_PAINT_MS: toMetric(rawMetrics.first_contentful_paint, [1800, 3000]),
        },
      };
    } catch {
      return undefined;
    }
  };

  try {
    const origin = new URL(normalizedUrl).origin;
    const [pageResult, originResult] = await Promise.all([
      queryCrux({ url: normalizedUrl }),
      queryCrux({ origin }),
    ]);
    return { loadingExperience: pageResult, originLoadingExperience: originResult };
  } catch {
    return {};
  }
}

// Shared by both the PageSpeed Insights path and the self-hosted Lighthouse fallback: turns a
// Lighthouse report (whichever produced it) into our own report shape. Assumes `lighthouse` has
// already been checked for runtimeError/empty audits by the caller.
function buildReportFromLighthouse(
  lighthouse: LighthouseResult,
  fieldData: { loadingExperience?: CrUXLoadingExperience; originLoadingExperience?: CrUXLoadingExperience },
  normalizedUrl: string
): Report {
    const audits = lighthouse.audits;
    const parsedAudits = parseAudits(audits);

    const score = parseScore(lighthouse.categories?.performance?.score);
    const performanceScore = score !== null ? score : 0;

    const { metrics, positives: metricPositives } = getMetrics(audits);

    const framework = detectFramework(audits, lighthouse.finalUrl || normalizedUrl);

    // Build resource categories
    const categories: Record<string, { name: string; totalBytes: number; color: string; }> = {
      Images: { name: 'Images', totalBytes: 0, color: '#6366f1' },
      JavaScript: { name: 'JavaScript', totalBytes: 0, color: '#f59e0b' },
      Fonts: { name: 'Fonts', totalBytes: 0, color: '#10b981' },
      CSS: { name: 'CSS', totalBytes: 0, color: '#ec4899' },
      Other: { name: 'Other', totalBytes: 0, color: '#8b8b8b' },
    };

    const resourceItems: Array<{ name: string; url: string; size: number; sizeLabel: string; category: string; }> = [];

    for (const audit of parsedAudits) {
      for (const item of audit.items) {
        if (!item.url) continue;
        let category = 'Other';
        const urlLower = item.url.toLowerCase();
        if (urlLower.match(/\.(png|jpe?g|gif|webp|avif|svg|ico|tiff?)/) || urlLower.includes('image')) {
          category = 'Images';
        } else if (urlLower.match(/\.js$/) || urlLower.includes('javascript') || urlLower.includes('bundle') || urlLower.includes('chunk')) {
          category = 'JavaScript';
        } else if (urlLower.match(/\.css$/) || urlLower.includes('stylesheet') || urlLower.includes('css')) {
          category = 'CSS';
        } else if (urlLower.match(/\.woff2?$/) || urlLower.match(/\.ttf$/) || urlLower.match(/\.otf$/) || urlLower.includes('font')) {
          category = 'Fonts';
        }

        const size = typeof item.size === 'number' ? item.size : 0;
        if (size > 0) {
          categories[category].totalBytes += size;
          resourceItems.push({
            name: extractFileName(item.url),
            url: item.url,
            size,
            sizeLabel: bytesToLabel(size),
            category,
          });
        }
      }
    }

    // Also check for image-specific audit items
    const imageAudits = ['image-delivery-insight'];
    for (const key of imageAudits) {
      const audit = audits[key];
      if (!Array.isArray(audit?.details?.items)) continue;
      for (const item of audit.details.items) {
        if (!item.url) continue;
        const size = typeof item.size === 'number' ? item.size : typeof item.resourceSize === 'number' ? item.resourceSize : typeof item.totalBytes === 'number' ? item.totalBytes : 0;
        if (size > 0) {
          const category = 'Images';
          categories[category].totalBytes += size;
          if (!resourceItems.some(i => i.url === item.url)) {
            resourceItems.push({
              name: extractFileName(item.url),
              url: item.url,
              size,
              sizeLabel: bytesToLabel(size),
              category,
            });
          }
        }
      }
    }

    const totalBytes = Object.values(categories).reduce((sum, c) => sum + c.totalBytes, 0);

    const resourceCategories = Object.values(categories)
      .filter(c => c.totalBytes > 0)
      .map(c => ({
        name: c.name,
        totalBytes: c.totalBytes,
        totalLabel: bytesToLabel(c.totalBytes),
        color: c.color,
        percentage: totalBytes > 0 ? (c.totalBytes / totalBytes) * 100 : 0,
      }))
      .sort((a, b) => b.totalBytes - a.totalBytes);

    resourceItems.sort((a, b) => b.size - a.size);

    // Build problems using diagnosis engine
    const { worthFixing, notWorthFixing, allAuditKeys } = buildProblems(parsedAudits, framework, 'simple', performanceScore, audits);

    const auditPositives = getAuditPositives(parsedAudits, new Set(allAuditKeys));
    const positives = [...metricPositives, ...auditPositives].slice(0, 6);

    const labLcp = metrics.find(m => m.label === 'LCP')?.value ?? null;
    const fieldComparison = buildFieldComparison(fieldData, labLcp);

    let headline: string;
    let headlineDetail: string | null;
    if (worthFixing.length === 0) {
      headline = 'Nothing major is slowing this page down.';
      headlineDetail = null;
    } else if (performanceScore >= 90) {
      // A good score deserves a good-news framing, even if a small thing is worth polishing.
      headline = worthFixing.length === 1
        ? 'Your site is in great shape. One thing could make it even better.'
        : `Your site is in great shape. ${worthFixing.length} things could make it even better.`;
      headlineDetail = `Consider: ${worthFixing[0].title.charAt(0).toLowerCase()}${worthFixing[0].title.slice(1)}.`;
    } else {
      headline = `${worthFixing.length} thing${worthFixing.length === 1 ? '' : 's'} worth fixing.`;
      headlineDetail = `${worthFixing[0].title}. Start there.`;
    }

  return {
    url: normalizedUrl,
    performanceScore,
    headline,
    headlineDetail,
    metrics,
    problems: worthFixing,
    notWorthFixing,
    positives,
    fieldComparison,
    resourceCategories,
    resourceItems: resourceItems.slice(0, 20),
    framework,
    fetchedAt: new Date().toISOString(),
  };
}

const PS_API_BASE_URL = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

// The original approach: ask Google's hosted PageSpeed Insights API to run Lighthouse for us.
// Usually fine, but Google's queue can get slow or rate-limited under load. Throws on any
// failure (network, timeout, non-2xx, missing result) so the caller can uniformly fall back
// to running Lighthouse ourselves rather than needing to branch on every failure mode here.
async function runPageSpeedInsights(normalizedUrl: string, timeoutMs: number): Promise<LighthouseResult> {
  const urlParams = new URLSearchParams({
    url: normalizedUrl,
    category: 'performance',
    strategy: 'mobile',
  });
  if (process.env.PAGESPEED_API_KEY) {
    urlParams.set('key', process.env.PAGESPEED_API_KEY);
  }

  const response = await fetch(`${PS_API_BASE_URL}?${urlParams.toString()}`, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`PageSpeed Insights returned ${response.status}`);
  }

  const data = await response.json();

  if (data.errorIssues && data.errorIssues.length > 0) {
    throw new Error(data.errorIssues.map((e: { message: string }) => e.message).join('. '));
  }
  if (!data.lighthouseResult) {
    throw new Error('PageSpeed Insights returned no lighthouseResult');
  }

  return data.lighthouseResult as LighthouseResult;
}

async function runSelfHostedLighthouse(normalizedUrl: string, timeoutMs: number): Promise<LighthouseResult> {
  const raw = await withTimeout(runLighthouse(normalizedUrl, timeoutMs), timeoutMs);
  return raw as LighthouseResult;
}

function validateLighthouseResult(lighthouse: LighthouseResult): string | null {
  if (lighthouse.runtimeError) {
    return `The analysis couldn't complete: ${lighthouse.runtimeError.message || lighthouse.runtimeError.code}. The page may block automated browsers or require login.`;
  }
  if (!lighthouse.audits || Object.keys(lighthouse.audits).length === 0) {
    return 'The analysis didn\'t return results. The website may block automated testing.';
  }
  return null;
}

// Tries Google's PageSpeed Insights API first (fast when Google isn't under load), and falls
// back to running our own headless Chrome + Lighthouse if that fails or times out. The two
// strategies are separate requests from the client (see route.ts/use-analysis.ts) rather than
// one long request internally, so the client can show "Google is slow, trying another way"
// truthfully at the moment the fallback actually starts, and so each attempt gets its own full
// timeout budget instead of splitting one budget across both.
export async function analyzeURL(url: string, strategy: 'psi' | 'self-hosted' = 'psi'): Promise<APIResponse> {
  const validation = normalizeAndValidateUrl(url);
  if (!validation.success) {
    return { success: false, error: validation.error };
  }
  const normalizedUrl = validation.normalizedUrl;

  const reachability = await checkReachable(normalizedUrl);
  if (!reachability.reachable) {
    return { success: false, error: reachability.error };
  }

  if (strategy === 'psi') {
    try {
      // Kept comfortably under the route's 60s maxDuration so a slow Google response still
      // leaves the client time to see this fail and kick off the fallback request.
      const PSI_TIMEOUT_MS = 25000;
      const [lighthouse, fieldData] = await Promise.all([
        runPageSpeedInsights(normalizedUrl, PSI_TIMEOUT_MS),
        fetchCruxFieldData(normalizedUrl),
      ]);

      const validationError = validateLighthouseResult(lighthouse);
      if (validationError) {
        return { success: false, error: validationError, errorCode: 'PSI_UNAVAILABLE' };
      }

      return { success: true, report: buildReportFromLighthouse(lighthouse, fieldData, normalizedUrl) };
    } catch {
      // Any failure here (timeout, rate limit, transient 5xx, etc.) just means "Google wasn't
      // available this time" — the fallback runs its own independent analysis regardless of why.
      return { success: false, error: 'Google\'s PageSpeed servers didn\'t respond in time.', errorCode: 'PSI_UNAVAILABLE' };
    }
  }

  // strategy === 'self-hosted'
  try {
    // Left with headroom under the route's 60s maxDuration for the reachability check above
    // and building the response, so our own graceful timeout message fires instead of the
    // platform hard-killing the function first. This bounds the whole Lighthouse run (Chrome
    // launch + page load + audit computation), not just the page-load phase.
    const LIGHTHOUSE_TIMEOUT_MS = 45000;
    const [lighthouse, fieldData] = await Promise.all([
      runSelfHostedLighthouse(normalizedUrl, LIGHTHOUSE_TIMEOUT_MS),
      fetchCruxFieldData(normalizedUrl),
    ]);

    const validationError = validateLighthouseResult(lighthouse);
    if (validationError) {
      return { success: false, error: validationError };
    }

    return { success: true, report: buildReportFromLighthouse(lighthouse, fieldData, normalizedUrl) };
  } catch (err: any) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return { success: false, error: 'The analysis timed out. The website may be very slow or unreachable. Try again.' };
    }
    console.error('Lighthouse analysis error:', err);
    return { success: false, error: 'Something went wrong analyzing this URL. Please try again.' };
  }
}

function extractFileName(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const parts = pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  } catch {
    return url.split('/').pop() || url;
  }
}

// How much work a fix typically takes, independent of how much it matters.
const EFFORT_BY_KEY: Record<string, 'easy' | 'medium' | 'hard'> = {
  'image-delivery-insight': 'easy',
  'unminified-css': 'easy',
  'unminified-javascript': 'easy',
  'legacy-javascript-insight': 'easy',
  'cache-insight': 'easy',
  'lcp-discovery-insight': 'easy',
  'unused-css-rules': 'medium',
  'unused-javascript': 'medium',
  'render-blocking-insight': 'medium',
  'third-parties-insight': 'medium',
  'network-dependency-tree-insight': 'medium',
  'cumulative-layout-shift': 'medium',
  'first-contentful-paint': 'medium',
  'speed-index': 'medium',
  'largest-contentful-paint': 'medium',
  'server-response-time': 'hard',
  'total-byte-weight': 'hard',
  'mainthread-work-breakdown': 'hard',
  'bootup-time': 'hard',
  'total-blocking-time': 'hard',
};

// Impact x effort -> what a person should actually do about it.
function getVerdict(impact: 'high' | 'medium' | 'low', effort: 'easy' | 'medium' | 'hard'): 'fix-now' | 'fix-next' | 'leave-it' | 'optional' | 'ignore' {
  if (impact === 'high') return effort === 'easy' ? 'fix-now' : 'fix-next';
  if (impact === 'medium') {
    if (effort === 'easy') return 'fix-now';
    if (effort === 'medium') return 'fix-next';
    return 'leave-it';
  }
  // low impact
  return effort === 'easy' ? 'optional' : 'ignore';
}

function getIgnoreReason(problem: { verdict: string; savingsLabel?: string }): string {
  if (problem.verdict === 'leave-it') {
    return 'Fixing this would take significant work for a modest gain.';
  }
  if (problem.verdict === 'optional') {
    return problem.savingsLabel
      ? `Low impact, but easy to do if you want to (${problem.savingsLabel}).`
      : 'Low impact, but easy to do if you want to.';
  }
  return problem.savingsLabel
    ? `Savings are too small to prioritize right now (${problem.savingsLabel}).`
    : 'This has minimal effect on your visitors right now.';
}

// network-dependency-tree-insight is marked "informative" by Lighthouse (so it never reaches the
// normal parseAudits/createProblemByKey pipeline) and its useful data sits inside a "list-section"
// item rather than the top-level "chains"/"longestChain" fields the old critical-request-chains
// audit used. It's read directly from the raw audits and walked defensively; any unexpected shape
// just results in no problem, never a crash.
function buildWaterfallProblem(
  rawAudits: Record<string, RawAudit>,
  framework: string | null,
  performanceScore: number
) {
  try {
    const audit = rawAudits['network-dependency-tree-insight'];
    if (!audit) return null;

    const items = audit.details?.items;
    if (!Array.isArray(items)) return null;

    const treeItem = (items as unknown as Array<{ value?: { type?: string; chains?: Record<string, unknown>; longestChain?: { duration?: number } } }>)
      .find((i) => i?.value?.type === 'network-tree');
    if (!treeItem?.value) return null;

    const chains = treeItem.value.chains;
    const durationMs = typeof treeItem.value.longestChain?.duration === 'number' ? treeItem.value.longestChain.duration : 0;

    type ChainNode = { children?: Record<string, unknown> };
    const depthOf = (node: unknown, depth: number): number => {
      const n = node as ChainNode;
      const children = n?.children;
      if (!children || typeof children !== 'object' || Object.keys(children).length === 0) return depth;
      let max = depth;
      for (const key of Object.keys(children)) {
        max = Math.max(max, depthOf(children[key], depth + 1));
      }
      return max;
    };

    let length = 0;
    if (chains && typeof chains === 'object') {
      for (const key of Object.keys(chains)) {
        length = Math.max(length, depthOf((chains as Record<string, unknown>)[key], 1));
      }
    }

    if (!length || length < 3) return null; // shallow chains aren't worth flagging

    const seconds = durationMs / 1000;
    const scoresWell = performanceScore >= 90;

    return {
      title: scoresWell ? 'Some requests could start a bit sooner' : 'Your page waits for one request before starting the next',
      impact: (length >= 5 || seconds > 1.5 ? 'high' : 'low') as 'high' | 'low',
      description: `We found a chain of ${length} requests that load one after another instead of in parallel${seconds > 0.05 ? `, taking about ${seconds.toFixed(1)}s` : ''}.`,
      soWhat: 'Each request waits for the previous one to finish, so the page is slower than the sum of its parts would suggest.',
      whatToDo: [
        'Fetch independent data in parallel instead of one request after another',
        'Move data fetching earlier (server-side) instead of waiting for the page to mount first',
        'Preload critical requests you already know you\'ll need',
      ],
      devWhatToDo: [
        'Check the Network tab waterfall for requests that only start after a previous one finishes',
        'If using useEffect + fetch, combine independent requests with Promise.all instead of sequential awaits',
        'Consider fetching in a Server Component or route loader instead of client-side after mount',
        'Add <link rel="preload"> or <link rel="preconnect"> for requests you can predict early',
      ].filter(Boolean),
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: network-dependency-tree-insight. Longest chain: ${length} requests.`,
      auditKey: 'network-dependency-tree-insight',
      simpleExplanation: 'Your page waits for one request before starting the next. These could load together.',
      developerExplanation: `Longest critical request chain is ${length} requests deep${seconds > 0.05 ? ` (about ${seconds.toFixed(1)}s)` : ''}. Parallelize independent fetches or move them earlier in the render.`,
      frameworkTip: framework === 'Next.js' ? 'Fetch in a Server Component instead of a client useEffect where possible.' : undefined,
    };
  } catch {
    return null;
  }
}

// lcp-discovery-insight is a checklist audit (details.type "list"), not the table/items shape
// the normal pipeline expects, so it's read directly from the raw audits.
function buildLcpDiscoveryProblem(
  rawAudits: Record<string, RawAudit>,
  framework: string | null,
  performanceScore: number
) {
  try {
    const audit = rawAudits['lcp-discovery-insight'];
    if (!audit) return null;

    const items = audit.details?.items;
    if (!Array.isArray(items)) return null;

    const checklistItem = (items as unknown as Array<{ type?: string; items?: Record<string, { label?: string; value?: boolean }> }>)
      .find((i) => i?.type === 'checklist');
    const checklist = checklistItem?.items;
    if (!checklist) return null;

    const lazyLoaded = checklist.eagerlyLoaded?.value === false;
    const notDiscoverable = checklist.requestDiscoverable?.value === false;
    const noPriorityHint = checklist.priorityHinted?.value === false;

    if (!lazyLoaded && !notDiscoverable && !noPriorityHint) return null; // all checks pass, nothing to report

    const scoresWell = performanceScore >= 90;
    const highImpact = lazyLoaded || notDiscoverable;

    const issues: string[] = [];
    if (lazyLoaded) issues.push('it\'s marked loading="lazy"');
    if (notDiscoverable) issues.push('it isn\'t discoverable directly in the HTML');
    if (noPriorityHint) issues.push('it\'s missing a fetchpriority="high" hint');

    return {
      title: scoresWell ? 'Your main image could be discovered a bit sooner' : 'Your most important image loads later than it should',
      impact: (highImpact ? 'high' : 'low') as 'high' | 'low',
      description: `The largest visible element on the page is slower to load because ${issues.join(' and ')}.`,
      soWhat: 'The browser can\'t start downloading the main image as early as it could, which delays when visitors see it.',
      whatToDo: [
        lazyLoaded ? 'Remove loading="lazy" from your largest above-the-fold image' : '',
        notDiscoverable ? 'Make sure the image URL is present directly in the HTML, not injected by JavaScript' : '',
        noPriorityHint ? 'Add fetchpriority="high" so the browser prioritizes it' : '',
        framework === 'Next.js' ? 'Use Next.js <Image priority> for the LCP image, it handles all of this automatically' : '',
      ].filter(Boolean),
      devWhatToDo: [
        'Find the LCP element in DevTools Performance panel (Timings > LCP)',
        lazyLoaded ? 'Confirm it does not have loading="lazy", only below-the-fold images should be lazy' : '',
        notDiscoverable ? 'Ensure the <img src> or <picture> markup is in the initial server-rendered HTML, not added after hydration' : '',
        noPriorityHint ? 'Add fetchpriority="high" and consider <link rel="preload" as="image"> for the same resource' : '',
        framework === 'Next.js' ? '<Image priority /> disables lazy-loading and adds a preload hint automatically' : '',
      ].filter(Boolean),
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: lcp-discovery-insight.`,
      auditKey: 'lcp-discovery-insight',
      simpleExplanation: 'Your most important image could be found and loaded sooner.',
      developerExplanation: `LCP discovery checklist failed: ${issues.join(', ')}. Fix the HTML/attributes so the browser can prioritize this resource immediately.`,
    };
  } catch {
    return null;
  }
}

// third-parties-insight is scoreDisplayMode "informative" so it's filtered out of the normal
// parseAudits pipeline; read directly from the raw audits instead. Its score is always 1 and
// doesn't indicate severity, so impact is judged from aggregate main-thread time and bytes.
function buildThirdPartiesProblem(
  rawAudits: Record<string, RawAudit>,
  framework: string | null,
  performanceScore: number
) {
  try {
    const audit = rawAudits['third-parties-insight'];
    if (!audit) return null;

    const items = audit.details?.items;
    if (!Array.isArray(items) || items.length === 0) return null;

    let totalMainThreadMs = 0;
    let totalTransferBytes = 0;
    let biggest: { entity?: string; mainThreadTime?: number } | null = null;

    for (const raw of items as unknown as Array<{ entity?: string; mainThreadTime?: number; transferSize?: number }>) {
      const mtt = typeof raw.mainThreadTime === 'number' ? raw.mainThreadTime : 0;
      const ts = typeof raw.transferSize === 'number' ? raw.transferSize : 0;
      totalMainThreadMs += mtt;
      totalTransferBytes += ts;
      if (!biggest || mtt > (biggest.mainThreadTime || 0)) biggest = raw;
    }

    if (totalMainThreadMs < 150) return null; // negligible main-thread cost, not worth flagging

    const biggestName = typeof biggest?.entity === 'string' ? biggest.entity : null;
    const scoresWell = performanceScore >= 90;

    return {
      title: scoresWell ? 'Third-party scripts add a little overhead' : 'Third-party scripts are slowing down your page',
      impact: (totalMainThreadMs > 500 ? 'high' : totalMainThreadMs > 150 ? 'medium' : 'low') as 'high' | 'medium' | 'low',
      description: biggestName
        ? `${biggestName} is the biggest third-party contributor, using about ${totalMainThreadMs.toFixed(0)}ms of main-thread time across ${items.length} services.`
        : `Third-party scripts use about ${totalMainThreadMs.toFixed(0)}ms of main-thread time across ${items.length} services.`,
      soWhat: 'Analytics, ad, and tracking scripts compete with your own code for the same network and CPU time.',
      whatToDo: [
        biggestName ? `Check whether ${biggestName} is actually needed on this page` : 'Audit which third-party scripts are actually needed on this page',
        'Load non-critical third-party scripts after the page becomes interactive',
        'Remove tracking or ad scripts that duplicate each other',
      ],
      devWhatToDo: [
        'Open DevTools Performance panel and group by "3rd party" to see exact cost per script',
        'Defer non-critical third-party scripts (Next.js: <Script strategy="lazyOnload" or "worker">)',
        'Check for duplicate tracking pixels/tags doing the same job, common after stacking multiple marketing tools',
      ],
      savingsBytes: totalTransferBytes > 0 ? totalTransferBytes : undefined,
      savingsLabel: totalTransferBytes > 0 ? bytesToLabel(totalTransferBytes) : undefined,
      details: `Lighthouse audit: third-parties-insight.`,
      auditKey: 'third-parties-insight',
      simpleExplanation: 'External scripts are adding extra load time before visitors can use the page.',
      developerExplanation: biggestName
        ? `${biggestName} accounts for the largest share of third-party main-thread time (~${totalMainThreadMs.toFixed(0)}ms total across all third parties). Defer or remove non-essential scripts.`
        : `Third-party scripts use ~${totalMainThreadMs.toFixed(0)}ms of main-thread time total. Defer or remove non-essential scripts.`,
    };
  } catch {
    return null;
  }
}

function buildProblems(audits: Array<{ key: string; title: string; description: string; score: number | null; scoreDisplayMode: string; wastedBytes: number; wastedMs: number; numericValue: number | null; numericUnit: string | null; displayValue: string | null; items: Array<{ url?: string; name?: string; size?: number; wastedBytes?: number; wastedMS?: number; }>; }>, framework: string | null, verbosity: 'simple' | 'developer', performanceScore: number, rawAudits: Record<string, RawAudit>) {
  const problems: Array<{
    title: string;
    resource?: string;
    sizeBytes?: number;
    sizeLabel?: string;
    impact: 'high' | 'medium' | 'low';
    effort: 'easy' | 'medium' | 'hard';
    verdict: 'fix-now' | 'fix-next' | 'leave-it' | 'optional' | 'ignore';
    description: string;
    soWhat: string;
    whatToDo: string[];
    devWhatToDo: string[];
    savingsBytes?: number;
    savingsLabel?: string;
    details: string;
    auditKey: string;
    simpleExplanation: string;
    developerExplanation: string;
    frameworkTip?: string;
  }> = [];

  const addProblem = (problem: any) => {
    if (!problem) return;
    const effort = EFFORT_BY_KEY[problem.auditKey] || 'medium';
    problem.effort = effort;
    problem.verdict = getVerdict(problem.impact, effort);
    problems.push(problem);
  };

  for (const audit of audits) {
    const result = createProblemByKey(audit, framework, verbosity, performanceScore);
    addProblem(result);
  }

  addProblem(buildWaterfallProblem(rawAudits, framework, performanceScore));
  addProblem(buildLcpDiscoveryProblem(rawAudits, framework, performanceScore));
  addProblem(buildThirdPartiesProblem(rawAudits, framework, performanceScore));

  // Sort: fix-now first, then fix-next, then by impact within each group
  const VERDICT_RANK: Record<string, number> = { 'fix-now': 0, 'fix-next': 1, 'leave-it': 2, 'optional': 3, 'ignore': 4 };
  problems.sort((a, b) => {
    const rankDiff = VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict];
    if (rankDiff !== 0) return rankDiff;
    return impactScore(b) - impactScore(a);
  });

  // Deduplicate
  const seen = new Set<string>();
  const deduped = problems.filter(p => {
    if (seen.has(p.auditKey)) return false;
    seen.add(p.auditKey);
    return true;
  });

  const worthFixing = deduped.filter(p => p.verdict === 'fix-now' || p.verdict === 'fix-next').slice(0, 5);
  const notWorthFixing = deduped
    .filter(p => p.verdict === 'leave-it' || p.verdict === 'optional' || p.verdict === 'ignore')
    .slice(0, 8)
    .map(p => ({ title: p.title, reason: getIgnoreReason(p) }));

  return { worthFixing, notWorthFixing, allAuditKeys: deduped.map(p => p.auditKey) };
}

function buildFieldComparison(
  data: { loadingExperience?: CrUXLoadingExperience; originLoadingExperience?: CrUXLoadingExperience },
  labLcpSeconds: number | null
) {
  if (labLcpSeconds === null) return null;

  const pageMetric = data.loadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS;
  const originMetric = data.originLoadingExperience?.metrics?.LARGEST_CONTENTFUL_PAINT_MS;
  const field = pageMetric || originMetric;
  if (!field) return null;

  const fieldSeconds = field.percentile / 1000;
  const category = field.category;
  const diff = labLcpSeconds - fieldSeconds;

  let verdict: string;
  if (category === 'FAST' || diff > 0.5) {
    verdict = 'Real visitors are having a better experience than this test suggests. Don\'t panic about the numbers above.';
  } else if (category === 'SLOW' || diff < -0.5) {
    verdict = 'Real visitors are experiencing this page as slow too. This is worth fixing.';
  } else {
    verdict = 'This roughly matches what real visitors experience.';
  }

  return {
    labSeconds: labLcpSeconds,
    fieldSeconds,
    category,
    scope: (pageMetric ? 'page' : 'site') as 'page' | 'site',
    verdict,
  };
}

function impactScore(problem: any): number {
  let score = 0;
  if (problem.impact === 'high') score += 3;
  else if (problem.impact === 'medium') score += 2;
  else score += 1;

  if (problem.sizeBytes) {
    score += Math.log2(problem.sizeBytes / 1024 + 1);
  }

  if (problem.soWhat?.toLowerCase().includes('lcp') || problem.soWhat?.toLowerCase().includes('content')) {
    score += 2;
  }
  if (problem.soWhat?.toLowerCase().includes('cls') || problem.soWhat?.toLowerCase().includes('layout')) {
    score += 1.5;
  }
  if (problem.soWhat?.toLowerCase().includes('tbt') || problem.soWhat?.toLowerCase().includes('interact')) {
    score += 1.5;
  }

  return score;
}

function biggestWaster(items: Array<{ url?: string; name?: string; size?: number; wastedBytes?: number }>): { url?: string; name?: string; size?: number; wastedBytes?: number } | null {
  const candidates = items.filter(i => (i.wastedBytes || 0) > 0 || (i.size || 0) > 0);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => {
    const aWeight = a.wastedBytes || a.size || 0;
    const bWeight = b.wastedBytes || b.size || 0;
    return bWeight > aWeight ? b : a;
  });
}

function fileNameOf(url?: string): string | null {
  if (!url) return null;
  try {
    const parts = new URL(url).pathname.split('/').filter(Boolean);
    return parts[parts.length - 1] || url;
  } catch {
    return url.split('/').filter(Boolean).pop() || url;
  }
}

function createProblemByKey(audit: { key: string; title: string; description: string; score: number | null; scoreDisplayMode: string; wastedBytes: number; wastedMs: number; numericValue: number | null; numericUnit: string | null; displayValue: string | null; items: Array<{ url?: string; name?: string; size?: number; wastedBytes?: number; wastedMS?: number; }>; }, framework: string | null, verbosity: 'simple' | 'developer', performanceScore: number) {
  const { key, title, wastedBytes, wastedMs, numericValue, items } = audit;
  const scoresWell = performanceScore >= 90;

  if (wastedBytes <= 0 && wastedMs <= 0 && !numericValue) return null;

  // --- Images ---
  if (key === 'image-delivery-insight') {
    const biggest = items.reduce((a, b) => (a.size || 0) > (b.size || 0) ? a : b);
    const savings = items.reduce((sum, i) => sum + (i.wastedBytes || 0), 0) + wastedBytes;

    return {
      title: 'Large images are slowing down the page',
      resource: biggest?.url,
      sizeBytes: biggest?.size || wastedBytes,
      sizeLabel: biggest?.size ? bytesToLabel(biggest.size) : bytesToLabel(wastedBytes),
      impact: savings > 500_000 ? 'high' : savings > 100_000 ? 'medium' : 'low',
      description: `${biggest?.url ? biggest.url.split('/').pop() : 'An image'} is ${biggest?.size ? bytesToLabel(biggest.size) : bytesToLabel(wastedBytes)} and is one of the largest resources loaded when the page opens.`,
      soWhat: verbosity === 'simple'
        ? 'Visitors download a large image before they can see your content.'
        : `${biggest?.url ? biggest.url.split('/').pop() : 'An image'} contributes ${biggest?.size ? bytesToLabel(biggest.size) : bytesToLabel(wastedBytes)} to the initial network payload.`,
      whatToDo: [
        'Convert it to WebP or AVIF',
        'Resize it closer to its displayed dimensions',
        'Compress it',
        verbosity === 'simple' ? 'Lazy-load it if it is below the fold' : 'Lazy-load below-the-fold images',
        framework === 'Next.js' ? 'Serve it through Next.js <Image> with appropriate dimensions' : '',
      ].filter(Boolean),
      devWhatToDo: [
        'Serve via <picture> with AVIF/WebP sources and a JPEG/PNG fallback',
        'Resize server-side to the largest rendered dimension, check your srcset/sizes',
        `Run it through sharp or squoosh-cli at quality 75-80${biggest?.url ? ` (${biggest.url.split('/').pop()})` : ''}`,
        'Add loading="lazy" and decoding="async" below the fold',
        framework === 'Next.js' ? 'Use next/image, priority only on the LCP image, default lazy elsewhere' : 'Use an image CDN (Cloudinary, Imgix) for automatic format negotiation',
      ].filter(Boolean),
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'Your page loads large image files that slow down the initial view.',
      developerExplanation: `${biggest?.url ? biggest.url.split('/').pop() : 'Images'} contribute significant payload. Serve as WebP/AVIF with responsive srcset.`,
    };
  }

  if (key === 'unused-css-rules') {
    const savings = wastedBytes;
    const biggest = biggestWaster(items);
    const biggestName = fileNameOf(biggest?.url);
    return {
      title: "Your CSS has rules that aren't used on this page",
      resource: biggest?.url,
      impact: savings > 100_000 ? 'high' : savings > 30_000 ? 'medium' : 'low',
      description: biggestName
        ? `${biggestName} alone carries about ${bytesToLabel(biggest?.wastedBytes || savings)} of unused CSS, out of ${bytesToLabel(savings)} total.`
        : `About ${bytesToLabel(savings)} of CSS could potentially be avoided during the initial page load.`,
      soWhat: 'Extra CSS forces the browser to do unnecessary work parsing and applying styles.',
      whatToDo: [
        biggestName ? `Start with ${biggestName}, the largest offender` : 'Remove unused CSS rules',
        'Split CSS into page-specific bundles',
        'Use tools like PurgeCSS or Tailwind\'s tree-shaking',
      ],
      devWhatToDo: [
        'Open DevTools > Coverage (Cmd+Shift+P > "Show Coverage") to see exactly which rules are unused',
        'Run PurgeCSS or `tailwindcss` with your real template/content globs, not a default config',
        'Split global CSS into per-route or per-component bundles instead of one shared stylesheet',
        'If using CSS-in-JS, confirm critical CSS extraction is enabled for SSR',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page loads CSS that isn\'t used on this page.',
      developerExplanation: biggestName
        ? `${biggestName} carries ${bytesToLabel(biggest?.wastedBytes || savings)} of unused rules (${bytesToLabel(savings)} total across all stylesheets). Remove dead rules and split critical CSS.`
        : `${bytesToLabel(savings)} of unused CSS loaded. Remove dead rules and split critical CSS.`,
    };
  }

  if (key === 'unused-javascript') {
    const savings = wastedBytes;
    const biggest = biggestWaster(items);
    const biggestName = fileNameOf(biggest?.url);
    return {
      title: "You're downloading JavaScript visitors don't immediately need",
      resource: biggest?.url,
      impact: savings > 300_000 ? 'high' : savings > 100_000 ? 'medium' : 'low',
      description: biggestName
        ? `${biggestName} alone wastes about ${bytesToLabel(biggest?.wastedBytes || savings)}, out of ${bytesToLabel(savings)} total unused JavaScript.`
        : `About ${bytesToLabel(savings)} of JavaScript could potentially be avoided during the initial page load.`,
      soWhat: 'Extra JavaScript blocks the main thread, delaying interactivity.',
      whatToDo: [
        biggestName ? `Start with ${biggestName}, the largest offender` : 'Lazy-load large components',
        'Split large bundles (code splitting)',
        'Remove unused dependencies',
        'Delay non-essential third-party scripts',
      ],
      devWhatToDo: [
        'Wrap non-critical components in React.lazy() or dynamic(() => import(...))',
        `Run a bundle analyzer (webpack-bundle-analyzer or next build --profile) to see what's actually in${biggestName ? ` ${biggestName}` : ' that chunk'}`,
        'Check for duplicate package versions with `npm ls <package>`, a common source of bloat',
        'Defer third-party scripts (Next.js: <Script strategy="lazyOnload">, otherwise defer/async)',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page downloads more JavaScript than it needs right away.',
      developerExplanation: biggestName
        ? `${biggestName} alone accounts for ${bytesToLabel(biggest?.wastedBytes || savings)} of unused code (${bytesToLabel(savings)} total). Implement code splitting and lazy loading for this bundle specifically.`
        : `${bytesToLabel(savings)} of unused JavaScript in the initial bundle. Implement code splitting and lazy loading.`,
    };
  }

  if (key === 'total-byte-weight') {
    return {
      title: 'The page is loading a large amount of data',
      impact: wastedBytes > 1_500_000 ? 'high' : wastedBytes > 500_000 ? 'medium' : 'low',
      description: `The total page weight is ${bytesToLabel(wastedBytes)}. Large pages take longer to download, especially on mobile networks.`,
      soWhat: 'Heavy pages keep visitors waiting, especially those on slower connections.',
      whatToDo: [
        'Compress images and serve next-gen formats',
        'Minify and compress JavaScript and CSS',
        'Remove unused code',
        'Lazy-load non-critical resources',
      ],
      devWhatToDo: [
        'Sort the Network tab by size and tackle the top 3 resources first',
        'Enable Brotli or gzip at your CDN/edge, check the content-encoding response header',
        'Add an image CDN or next/image with automatic format negotiation',
        'Add preconnect/dns-prefetch hints for third-party origins you can\'t remove',
      ],
      savingsBytes: wastedBytes,
      savingsLabel: bytesToLabel(wastedBytes),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page is heavy. It downloads a lot of data before it can be used.',
      developerExplanation: `Total page weight: ${bytesToLabel(wastedBytes)}. Reduce payload through compression and code splitting.`,
    };
  }

  if (key === 'render-blocking-insight') {
    const blockingMs = wastedMs;
    const totalBlockingBytes = wastedBytes;
    const biggest = biggestWaster(items);
    const biggestName = fileNameOf(biggest?.url);

    return {
      title: 'Render-blocking resources are delaying the first paint',
      resource: biggest?.url,
      impact: blockingMs > 750 ? 'high' : blockingMs > 250 ? 'medium' : 'low',
      description: `${items.length} resource(s), ${bytesToLabel(totalBlockingBytes)} total, are blocking the page from rendering for about ${blockingMs.toFixed(0)}ms. The browser waits for these before showing anything.`,
      soWhat: 'Visitors see a blank screen until these files finish downloading.',
      whatToDo: [
        'Inline critical CSS',
        'Defer non-critical CSS with media queries or rel="preload"',
        'Reduce the size of render-blocking CSS and JS',
      ],
      devWhatToDo: [
        'Extract above-the-fold CSS with `critical` or `criticters` and inline it in <head>',
        'Load the rest via <link rel="preload" as="style" onload="this.rel=\'stylesheet\'">',
        'Move blocking <script> tags to the end of <body> or add defer',
        framework === 'Next.js' ? 'Use next/script with strategy="afterInteractive" for non-critical scripts' : 'Add defer or async to non-critical <script> tags',
      ],
      savingsBytes: totalBlockingBytes,
      savingsLabel: bytesToLabel(totalBlockingBytes),
      details: `Lighthouse audit: ${title}. Found ${items.length} render-blocking resource(s), longest ${blockingMs.toFixed(0)}ms.`,
      auditKey: key,
      simpleExplanation: 'Some files are stopping the page from showing up quickly.',
      developerExplanation: biggestName
        ? `${biggestName} is the largest render-blocking resource. ${items.length} render-blocking resource(s) delay FCP by up to ${blockingMs.toFixed(0)}ms. Inline critical CSS and defer the rest.`
        : `${items.length} render-blocking resource(s) delay FCP by up to ${blockingMs.toFixed(0)}ms. Inline critical CSS and defer the rest.`,
    };
  }

  if (key === 'unminified-css') {
    const savings = wastedBytes;
    const biggest = biggestWaster(items);
    const biggestName = fileNameOf(biggest?.url);
    return {
      title: 'CSS is not minified',
      resource: biggest?.url,
      impact: savings > 50_000 ? 'high' : savings > 10_000 ? 'medium' : 'low',
      description: biggestName
        ? `${biggestName} isn't minified and could shrink by about ${bytesToLabel(biggest?.wastedBytes || savings)}.`
        : `About ${bytesToLabel(savings)} could be saved by minifying CSS.`,
      soWhat: 'Unminified CSS takes longer to download and parse.',
      whatToDo: [
        'Minify CSS in your build process',
        'Use tools like cssnano or your framework\'s production mode',
      ],
      devWhatToDo: [
        'Confirm NODE_ENV=production at build time, some bundlers skip minification otherwise',
        'Add cssnano or postcss-preset-env with minify: true if using a custom build',
        'Check your CDN isn\'t serving a stale unminified cached copy',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The CSS files are larger than they need to be because they aren\'t compressed.',
      developerExplanation: biggestName
        ? `${biggestName} is unminified (${bytesToLabel(biggest?.wastedBytes || savings)} of savings available there alone). Enable production CSS minification.`
        : `${bytesToLabel(savings)} of minification savings available. Enable production CSS minification.`,
    };
  }

  if (key === 'unminified-javascript') {
    const savings = wastedBytes;
    const biggest = biggestWaster(items);
    const biggestName = fileNameOf(biggest?.url);
    return {
      title: 'JavaScript is not minified',
      resource: biggest?.url,
      impact: savings > 100_000 ? 'high' : savings > 30_000 ? 'medium' : 'low',
      description: biggestName
        ? `${biggestName} isn't minified and could shrink by about ${bytesToLabel(biggest?.wastedBytes || savings)}.`
        : `About ${bytesToLabel(savings)} could be saved by minifying JavaScript.`,
      soWhat: 'Unminified JavaScript takes longer to download and parse on the main thread.',
      whatToDo: [
        'Minify JavaScript in your build process',
        'Enable production mode in your framework',
        'Use Terser, esbuild, or your bundler\'s minifier',
      ],
      devWhatToDo: [
        'Confirm NODE_ENV=production, staging environments sometimes ship dev builds by mistake',
        'Check optimization.minimize isn\'t disabled in a custom webpack/esbuild config',
        'Verify source maps aren\'t accidentally inflating the shipped file size',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The JavaScript files are larger than they need to be.',
      developerExplanation: biggestName
        ? `${biggestName} is unminified (${bytesToLabel(biggest?.wastedBytes || savings)} of savings available there alone). Enable JS minification in production builds.`
        : `${bytesToLabel(savings)} of minification savings available. Enable JS minification in production builds.`,
    };
  }

  if (key === 'cache-insight') {
    const savings = wastedBytes;
    const biggest = biggestWaster(items);
    const biggestName = biggest?.name || fileNameOf(biggest?.url);
    return {
      title: 'Visitors re-download files they already have',
      resource: biggest?.url,
      impact: savings > 200_000 ? 'medium' : 'low',
      description: biggestName
        ? `${biggestName} isn't cached efficiently, so returning visitors download it again.`
        : 'Static files aren\'t cached efficiently, so returning visitors re-download data they already have.',
      soWhat: 'Repeat visitors wait for files that didn\'t need to change since their last visit.',
      whatToDo: [
        'Set long max-age cache headers on static assets (JS, CSS, images, fonts)',
        'Use content-hashed filenames so long caching is safe',
        'Check your CDN\'s default cache-control settings',
      ],
      devWhatToDo: [
        'Set Cache-Control: public, max-age=31536000, immutable on hashed static assets',
        'Next.js: files under /_next/static are already immutable, check custom routes and /public assets',
        'Verify your CDN/edge isn\'t overriding origin cache-control with a shorter TTL',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'Visitors are waiting for data that could have been reused.',
      developerExplanation: biggestName
        ? `${biggestName} has a short or missing cache lifetime. Set a long max-age with a content hash in the filename.`
        : `${bytesToLabel(savings)} could be saved with better cache headers on static assets.`,
    };
  }

  if (key === 'largest-contentful-paint') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    // numericValue for a timing audit is always in milliseconds (Lighthouse's own convention,
    // numericUnit is always "millisecond"), never pre-converted to seconds. No guessing needed.
    const seconds = value / 1000;
    if (seconds <= 1.8) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'Main content could appear a bit sooner' : 'Your main content appears too late',
      impact: seconds > 3.0 ? 'high' : 'low',
      description: `The largest visible element appears at ${seconds.toFixed(1)}s. Visitors wait too long for the main content.`,
      soWhat: 'Users perceive the page as slow when the main content takes too long to show.',
      whatToDo: [
        'Optimize the LCP element (often an image or text block)',
        'Preload the LCP image or font',
        'Improve server response time',
        'Remove render-blocking resources',
        'Reduce main-thread work',
        framework === 'Next.js' ? 'Use Next.js <Image> with priority for the LCP image' : '',
      ].filter(Boolean),
      devWhatToDo: [
        'Find the LCP element in DevTools Performance panel (Timings > LCP)',
        'If it\'s an image: add fetchpriority="high" and <link rel="preload" as="image">',
        'If it\'s text: check the font isn\'t render-blocking (font-display: swap + preload the file)',
        framework === 'Next.js' ? 'Set priority on the LCP <Image> so it skips lazy-loading' : 'Preload the hero asset with <link rel="preload">',
      ].filter(Boolean),
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The main content of the page takes too long to show up.',
      developerExplanation: `LCP element displays at ${seconds.toFixed(1)}s. Optimize the LCP resource, preconnect to origins, and reduce TBT.`,
    };
  }

  if (key === 'server-response-time') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    const seconds = value / 1000;
    if (seconds <= 0.8) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'Server response could be a bit faster' : 'The server takes too long to respond',
      impact: seconds > 1.5 ? 'high' : 'low',
      description: `The server responds in about ${seconds.toFixed(1)}s. Everything else waits on this. Lighthouse doesn't factor server response time directly into your performance score, so this can stay hidden even on a page that scores well.`,
      soWhat: 'A slow server delays every other metric: FCP, LCP, and interactivity all suffer.',
      whatToDo: [
        'Use a CDN to serve static assets closer to visitors',
        'Optimize server-side rendering or caching',
        'Upgrade hosting if the server itself is slow',
        'Reduce backend query time',
      ],
      devWhatToDo: [
        'Check the TTFB breakdown in DevTools Network tab (DNS / Connect / SSL / Wait)',
        'Add server-side caching (Redis or an edge cache) for expensive queries or SSR renders',
        'Move static/SSG-able pages off SSR where possible (getStaticProps or ISR in Next.js)',
        'Check for N+1 queries or missing database indexes if the backend is the bottleneck',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The server takes too long to start sending the page.',
      developerExplanation: `TTFB is ${seconds.toFixed(1)}s. Reduce server processing time, use a CDN, and implement caching.`,
    };
  }

  if (key === 'mainthread-work-breakdown') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    if (value <= 2000) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'Main-thread work could be trimmed down' : 'Too much work is happening on the main thread',
      impact: value > 4000 ? 'high' : 'low',
      description: `The browser\'s main thread is busy for about ${value.toFixed(0)}ms during load. This delays interactivity.`,
      soWhat: 'Visitors can\'t click or scroll smoothly because the browser is busy processing JavaScript.',
      whatToDo: [
        'Break up long tasks into smaller chunks',
        'Move work off the main thread with Web Workers where possible',
        'Reduce unnecessary JavaScript execution',
        'Defer non-critical scripts',
      ],
      devWhatToDo: [
        'Use DevTools Performance panel to find tasks over 50ms, flagged as "Long Tasks"',
        'Break large loops/renders into chunks with requestIdleCallback or scheduler.postTask',
        'Move CPU-heavy work (parsing, sorting large lists) to a Web Worker',
        'Check for layout thrashing: reading then writing DOM properties in a loop',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The browser is overloaded processing JavaScript while the page loads.',
      developerExplanation: `Main-thread work: ${value.toFixed(0)}ms. Break up long tasks and reduce JavaScript execution time.`,
    };
  }

  if (key === 'bootup-time') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    if (value <= 2000) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'JavaScript execution could be a bit leaner' : 'JavaScript execution is taking too long',
      impact: value > 3500 ? 'high' : 'low',
      description: `JavaScript execution takes about ${value.toFixed(0)}ms. This blocks the page from becoming interactive.`,
      soWhat: 'Long execution times delay when visitors can actually use the page.',
      whatToDo: [
        'Reduce the amount of JavaScript executed on load',
        'Defer non-essential scripts',
        'Optimize expensive computations',
        'Consider server-side rendering for heavier logic',
      ],
      devWhatToDo: [
        'Profile in DevTools Performance, check "Scripting" time in the summary panel',
        'Look for large third-party SDKs (analytics, chat widgets) loaded synchronously; defer them',
        'Tree-shake unused exports, set "sideEffects": false in package.json where accurate',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'JavaScript takes too long to run, delaying when the page becomes usable.',
      developerExplanation: `Script execution: ${value.toFixed(0)}ms. Reduce bundle size and defer non-critical scripts.`,
    };
  }

  if (key === 'total-blocking-time') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    if (value <= 200) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'The page could respond a bit faster' : 'The page becomes interactive slowly',
      impact: value > 600 ? 'high' : 'low',
      description: `Total Blocking Time is ${value.toFixed(0)}ms. This measures how long the main thread is blocked after the page starts loading.`,
      soWhat: 'Visitors try to interact with the page but it doesn\'t respond because JavaScript is blocking.',
      whatToDo: [
        'Reduce JavaScript execution time',
        'Break up long tasks',
        'Defer non-critical scripts',
        'Optimize third-party scripts',
      ],
      devWhatToDo: [
        'Same root cause as main-thread work: find Long Tasks (>50ms) in DevTools Performance',
        'Audit third-party scripts individually, analytics/ad tags are often the biggest single contributor',
        'Use requestIdleCallback for non-urgent initialization code',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page feels unresponsive for too long after it starts loading.',
      developerExplanation: `TBT: ${value.toFixed(0)}ms. Reduce main-thread work and split long tasks.`,
    };
  }

  if (key === 'cumulative-layout-shift') {
    const value = numericValue || 0;
    if (!value) return null;
    if (value <= 0.1) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'A little layout shift could be tightened up' : 'Elements shift around while the page loads',
      impact: value > 0.25 ? 'high' : 'low',
      description: `Cumulative Layout Shift is ${value.toFixed(2)}. Content moves unexpectedly, which frustrates visitors.`,
      soWhat: 'Visitors click the wrong thing when buttons or links move under them.',
      whatToDo: [
        'Set explicit width and height on images and iframes',
        'Reserve space for ads and dynamic content',
        'Avoid inserting content above existing content',
        'Use font-display: swap carefully with size-adjust',
      ],
      devWhatToDo: [
        'Add explicit width/height or aspect-ratio on every <img> and <iframe>',
        'Reserve space for ads/embeds with a fixed-size container before they load',
        'Use font-display: optional or preload web fonts to avoid FOIT/FOUT shifts',
        'Check DevTools > Rendering > "Layout Shift Regions" to see exactly what\'s moving',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'Elements jump around as the page loads, which is disorienting.',
      developerExplanation: `CLS: ${value.toFixed(2)}. Set explicit dimensions on media and reserve ad slots.`,
    };
  }

  if (key === 'speed-index') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    const seconds = value / 1000;
    if (seconds <= 1.2) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'The page could visually fill in a bit faster' : 'The page takes too long to visually populate',
      impact: seconds > 2.5 ? 'high' : 'low',
      description: `Speed Index is ${seconds.toFixed(1)}s. This measures how quickly the visible parts of the page appear.`,
      soWhat: 'Visitors see a mostly blank or partially loaded page for too long.',
      whatToDo: [
        'Optimize the critical rendering path',
        'Reduce render-blocking resources',
        'Improve LCP',
        'Use a CDN and optimize server response',
      ],
      devWhatToDo: [
        'Speed Index is downstream of FCP/LCP, fixing those usually fixes this too',
        'Check the Lighthouse "Filmstrip" view to see which frame is slow to fill in',
        'Reduce main-thread contention during paint (see Total Blocking Time fixes)',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page takes too long to show what it looks like.',
      developerExplanation: `Speed Index: ${seconds.toFixed(1)}s. Optimize the critical path and reduce render-blocking resources.`,
    };
  }

  if (key === 'first-contentful-paint') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    const seconds = value / 1000;
    if (seconds <= 0.8) return null; // already good, nothing to report
    return {
      title: scoresWell ? 'First content could appear a bit sooner' : 'The first content appears slowly',
      impact: seconds > 1.8 ? 'high' : 'low',
      description: `First Contentful Paint is ${seconds.toFixed(1)}s. This is when the browser first renders text or an image.`,
      soWhat: 'Visitors stare at a blank or loading screen longer than they should.',
      whatToDo: [
        'Remove render-blocking resources',
        'Improve server response time',
        'Optimize the critical rendering path',
        'Preload critical assets',
      ],
      devWhatToDo: [
        'Check TTFB first, FCP can never beat server response time',
        'Inline critical CSS (see the render-blocking resources fix) to unblock first paint',
        'Preload the font and hero asset with <link rel="preload">',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'It takes too long for anything to appear on the screen.',
      developerExplanation: `FCP: ${seconds.toFixed(1)}s. Reduce TTFB, remove render-blocking CSS/JS, and optimize the critical path.`,
    };
  }

  if (key === 'legacy-javascript-insight') {
    const savings = wastedBytes;
    const biggest = biggestWaster(items);
    const biggestName = fileNameOf(biggest?.url);
    return {
      title: 'The page uses old JavaScript syntax',
      resource: biggest?.url,
      impact: savings > 100_000 ? 'medium' : 'low',
      description: biggestName
        ? `${biggestName} ships legacy syntax that modern browsers don't need (about ${bytesToLabel(biggest?.wastedBytes || savings)}).`
        : `About ${bytesToLabel(savings)} of legacy JavaScript is loaded. Modern browsers don't need it.`,
      soWhat: 'Older JavaScript syntax adds unnecessary bytes for modern visitors.',
      whatToDo: [
        'Remove or update polyfills for modern browsers',
        'Use module/nomodule pattern',
        'Target modern JavaScript in your build',
      ],
      devWhatToDo: [
        'Set your bundler\'s browserslist target to modern browsers (e.g. "> 0.5%, last 2 versions")',
        'Use <script type="module"> for the modern bundle plus a nomodule fallback for legacy',
        'Check for core-js polyfills you may not need if you\'re not supporting IE11',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page loads old JavaScript that modern browsers don\'t need.',
      developerExplanation: biggestName
        ? `${biggestName} contains legacy syntax/polyfills (${bytesToLabel(biggest?.wastedBytes || savings)} of ${bytesToLabel(savings)} total). Use module/nomodule split and target modern syntax.`
        : `${bytesToLabel(savings)} of legacy JS loaded. Use module/nomodule split and target modern syntax.`,
    };
  }

  // Generic fallback
  if (wastedBytes > 0) {
    return {
      title: title,
      impact: wastedBytes > 500_000 ? 'high' : wastedBytes > 100_000 ? 'medium' : 'low',
      description: `This audit found ${bytesToLabel(wastedBytes)} of potential savings.`,
      soWhat: 'Addressing this can reduce page weight and improve load time.',
      whatToDo: [
        'Review the Lighthouse audit details for this issue',
        'Follow the specific recommendation for this audit',
      ],
      devWhatToDo: [
        `Run npx lighthouse <url> --view locally to inspect the "${key}" audit's raw item list`,
        'Check the Lighthouse docs for this specific audit ID for the recommended fix',
      ],
      savingsBytes: wastedBytes,
      savingsLabel: bytesToLabel(wastedBytes),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'This audit found an opportunity to make the page faster.',
      developerExplanation: `${title}: ${bytesToLabel(wastedBytes)} savings available.`,
    };
  }

  return null;
}
