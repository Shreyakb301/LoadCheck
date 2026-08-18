import { bytesToLabel } from './types';

interface ParsedAudit {
  key: string;
  title: string;
  score: number | null;
  wastedBytes: number;
  wastedMs: number;
  numericValue: number | null;
  numericUnit: string | null;
  details: {
    items: Array<{
      url?: string;
      size?: number;
      wastedBytes?: number;
      wastedMS?: number;
      title?: string;
    }>;
    totals: {
      bytes?: number;
      ms?: number;
    };
  };
}

type Verbosity = 'simple' | 'developer';

type Problem = {
  title: string;
  resource?: string;
  sizeBytes?: number;
  sizeLabel?: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  soWhat: string;
  whatToDo: string[];
  savingsBytes?: number;
  savingsLabel?: string;
  details: string;
  auditKey: string;
  simpleExplanation: string;
  developerExplanation: string;
};

function createProblem(
  key: string,
  parsed: ParsedAudit,
  framework: string,
  verbosity: Verbosity
): Problem | null {
  const { wastedBytes, wastedMs, numericValue, details, title } = parsed;

  if (wastedBytes <= 0 && wastedMs <= 0 && !numericValue) return null;

  // --- Image audits ---
  if (['uses-optimized-images', 'serve-images-webp', 'efficient-images', 'next-gen-formats'].includes(key)) {
    const items = details.items.filter((i) => i.url && i.size);
    if (items.length === 0) return null;

    const biggest = items.reduce((a, b) => (a.size || 0) > (b.size || 0) ? a : b);
    const savings = items.reduce((sum, i) => sum + (i.wastedBytes || 0), 0) + wastedBytes;

    return {
      title: 'Large images are slowing down the page',
      resource: biggest.url,
      sizeBytes: biggest.size || wastedBytes,
      sizeLabel: biggest.size ? bytesToLabel(biggest.size) : bytesToLabel(wastedBytes),
      impact: savings > 500_000 ? 'high' : savings > 100_000 ? 'medium' : 'low',
      description: `${biggest.url ? biggest.url.split('/').pop() : 'An image'} is ${biggest.size ? bytesToLabel(biggest.size) : bytesToLabel(wastedBytes)} and is one of the largest resources loaded when the page opens.`,
      soWhat: verbosity === 'simple'
        ? 'Visitors download a large image before they can see your content.'
        : `${biggest.url ? biggest.url.split('/').pop() : 'An image'} contributes ${biggest.size ? bytesToLabel(biggest.size) : bytesToLabel(wastedBytes)} to the initial network payload.`,
      whatToDo: [
        'Convert it to WebP or AVIF',
        'Resize it closer to its displayed dimensions',
        'Compress it',
        verbosity === 'simple' ? 'Lazy-load it if it is below the fold' : 'Lazy-load below-the-fold images',
      ].filter(Boolean),
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}. Found ${items.length} image(s) that could be optimized.`,
      auditKey: key,
      simpleExplanation: 'Your page loads large image files that slow down the initial view.',
      developerExplanation: `${biggest.url ? biggest.url.split('/').pop() : 'Images'} contribute significant payload. Serve as WebP/AVIF with responsive srcset.`,
    };
  }

  if (key === 'unused-css-rules') {
    const savings = wastedBytes;
    return {
      title: "Your CSS has rules that aren't used on this page",
      impact: savings > 100_000 ? 'high' : savings > 30_000 ? 'medium' : 'low',
      description: `About ${bytesToLabel(savings)} of CSS could potentially be avoided during the initial page load.`,
      soWhat: 'Extra CSS forces the browser to do unnecessary work parsing and applying styles.',
      whatToDo: [
        'Remove unused CSS rules',
        'Split CSS into page-specific bundles',
        "Use tools like PurgeCSS or Tailwind's tree-shaking",
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: "The page loads CSS that isn't used on this page, slowing things down.",
      developerExplanation: `${bytesToLabel(savings)} of unused CSS is loaded. Remove dead rules and split critical CSS.`,
    };
  }

  if (key === 'unused-javascript') {
    const savings = wastedBytes;
    return {
      title: "You're downloading JavaScript visitors don't immediately need",
      impact: savings > 300_000 ? 'high' : savings > 100_000 ? 'medium' : 'low',
      description: `About ${bytesToLabel(savings)} of JavaScript could potentially be avoided during the initial page load.`,
      soWhat: 'Extra JavaScript blocks the main thread, delaying interactivity.',
      whatToDo: [
        'Lazy-load large components',
        'Split large bundles (code splitting)',
        'Remove unused dependencies',
        'Delay non-essential third-party scripts',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page downloads more JavaScript than it needs right away.',
      developerExplanation: `${bytesToLabel(savings)} of unused JavaScript is in the initial bundle. Implement code splitting and lazy loading.`,
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
      savingsBytes: wastedBytes,
      savingsLabel: bytesToLabel(wastedBytes),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page is heavy — it downloads a lot of data before it can be used.',
      developerExplanation: `Total page weight: ${bytesToLabel(wastedBytes)}. Aim to reduce payload size through compression and code splitting.`,
    };
  }

  if (key === 'render-blocking-resources') {
    const items = details.items.filter((i) => i.url);
    if (items.length === 0) return null;

    const cssItems = items.filter((i) => i.title?.toLowerCase().includes('css') || i.url?.toLowerCase().endsWith('.css'));
    const savings = wastedBytes || cssItems.reduce((s, i) => s + (i.size || 0), 0);

    return {
      title: 'Render-blocking resources are delaying the first paint',
      resource: cssItems[0]?.url,
      impact: savings > 50_000 ? 'high' : savings > 10_000 ? 'medium' : 'low',
      description: `${cssItems.length} CSS file(s) are blocking the page from rendering. The browser waits for these to load before showing anything.`,
      soWhat: 'Visitors see a blank screen until these files finish downloading.',
      whatToDo: [
        'Inline critical CSS',
        'Defer non-critical CSS with media queries or rel="preload"',
        'Reduce the size of render-blocking CSS',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}. Found ${cssItems.length} render-blocking CSS resource(s).`,
      auditKey: key,
      simpleExplanation: 'Some stylesheets are stopping the page from showing up quickly.',
      developerExplanation: `${cssItems.length} render-blocking CSS file(s) delay FCP. Inline critical CSS and defer the rest.`,
    };
  }

  if (key === 'uses-responsive-images') {
    return {
      title: 'Images are not optimized for different screen sizes',
      impact: 'medium',
      description: 'Some images may be larger than necessary for the device loading the page.',
      soWhat: "Mobile users download desktop-sized images they don't need.",
      whatToDo: [
        'Use srcset and sizes attributes',
        'Serve appropriately sized images per breakpoint',
        'Use <picture> for art direction',
      ],
      savingsBytes: wastedBytes,
      savingsLabel: bytesToLabel(wastedBytes),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'Some images are bigger than they need to be for mobile visitors.',
      developerExplanation: 'Serve responsive images using srcset/sizes to avoid over-downloading on smaller screens.',
    };
  }

  if (key === 'offscreen-images') {
    const savings = wastedBytes;
    return {
      title: 'Images below the fold are loaded immediately',
      impact: savings > 500_000 ? 'high' : savings > 100_000 ? 'medium' : 'low',
      description: `About ${bytesToLabel(savings)} of images could be lazy-loaded since they aren't visible when the page first opens.`,
      soWhat: "The browser downloads images the visitor can't even see yet.",
      whatToDo: [
        'Add loading="lazy" to below-the-fold images',
        'Use Intersection Observer for custom lazy-loading',
        'Consider responsive loading strategies',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page loads images that are off-screen, wasting bandwidth.',
      developerExplanation: `${bytesToLabel(savings)} of offscreen images are eagerly loaded. Add loading="lazy" to defer them.`,
    };
  }

  if (key === 'unminified-css') {
    const savings = wastedBytes;
    return {
      title: 'CSS is not minified',
      impact: savings > 50_000 ? 'high' : savings > 10_000 ? 'medium' : 'low',
      description: `About ${bytesToLabel(savings)} could be saved by minifying CSS.`,
      soWhat: 'Unminified CSS takes longer to download and parse.',
      whatToDo: [
        'Minify CSS in your build process',
        "Use tools like cssnano or your framework's production mode",
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The CSS files are larger than they need to be because they aren\'t compressed.',
      developerExplanation: `${bytesToLabel(savings)} of minification savings available. Enable production CSS minification.`,
    };
  }

  if (key === 'unminified-javascript') {
    const savings = wastedBytes;
    return {
      title: 'JavaScript is not minified',
      impact: savings > 100_000 ? 'high' : savings > 30_000 ? 'medium' : 'low',
      description: `About ${bytesToLabel(savings)} could be saved by minifying JavaScript.`,
      soWhat: 'Unminified JavaScript takes longer to download and parse on the main thread.',
      whatToDo: [
        'Minify JavaScript in your build process',
        'Enable production mode in your framework',
        "Use Terser, esbuild, or your bundler's minifier",
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The JavaScript files are larger than they need to be.',
      developerExplanation: `${bytesToLabel(savings)} of minification savings available. Enable JS minification in production builds.`,
    };
  }

  if (key === 'large-contentful-paint') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    const seconds = typeof value === 'number' && value < 100 ? value : value / 1000;
    return {
      title: 'The largest content takes too long to appear',
      impact: seconds > 2 ? 'high' : seconds > 1 ? 'medium' : 'low',
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
    const seconds = typeof value === 'number' && value < 100 ? value : value / 1000;
    return {
      title: 'The server takes too long to respond',
      impact: seconds > 1.5 ? 'high' : seconds > 0.8 ? 'medium' : 'low',
      description: `The server responds in about ${seconds.toFixed(1)}s. Everything else waits on this.`,
      soWhat: 'A slow server delays every other metric — FCP, LCP, and interactivity all suffer.',
      whatToDo: [
        'Use a CDN to serve static assets closer to visitors',
        'Optimize server-side rendering or caching',
        'Upgrade hosting if the server itself is slow',
        'Reduce backend query time',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}. Server response: ${seconds.toFixed(1)}s.`,
      auditKey: key,
      simpleExplanation: 'The server takes too long to start sending the page.',
      developerExplanation: `TTFB is ${seconds.toFixed(1)}s. Reduce server processing time, use a CDN, and implement caching.`,
    };
  }

  if (key === 'main-thread-work') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    return {
      title: 'Too much work is happening on the main thread',
      impact: value > 2500 ? 'high' : value > 1000 ? 'medium' : 'low',
      description: `The browser's main thread is busy for about ${value.toFixed(0)}ms during load. This delays interactivity.`,
      soWhat: "Visitors can't click or scroll smoothly because the browser is busy processing JavaScript.",
      whatToDo: [
        'Break up long tasks into smaller chunks',
        'Move work off the main thread with Web Workers where possible',
        'Reduce unnecessary JavaScript execution',
        'Defer non-critical scripts',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}. Main-thread work duration: ${value.toFixed(0)}ms.`,
      auditKey: key,
      simpleExplanation: 'The browser is overloaded processing JavaScript while the page loads.',
      developerExplanation: `Main-thread work: ${value.toFixed(0)}ms. Break up long tasks and reduce JavaScript execution time.`,
    };
  }

  if (key === 'javascript-execution') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    return {
      title: 'JavaScript execution is taking too long',
      impact: value > 2500 ? 'high' : value > 1000 ? 'medium' : 'low',
      description: `JavaScript execution takes about ${value.toFixed(0)}ms. This blocks the page from becoming interactive.`,
      soWhat: 'Long execution times delay when visitors can actually use the page.',
      whatToDo: [
        'Reduce the amount of JavaScript executed on load',
        'Defer non-essential scripts',
        'Optimize expensive computations',
        'Consider server-side rendering for heavier logic',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}. Execution time: ${value.toFixed(0)}ms.`,
      auditKey: key,
      simpleExplanation: 'JavaScript takes too long to run, delaying when the page becomes usable.',
      developerExplanation: `Script execution: ${value.toFixed(0)}ms. Reduce bundle size and defer non-critical scripts.`,
    };
  }

  if (key === 'total-blocking-time') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    return {
      title: 'The page becomes interactive slowly',
      impact: value > 600 ? 'high' : value > 200 ? 'medium' : 'low',
      description: `Total Blocking Time is ${value.toFixed(0)}ms. This measures how long the main thread is blocked after the page starts loading.`,
      soWhat: "Visitors try to interact with the page but it doesn't respond because JavaScript is blocking.",
      whatToDo: [
        'Reduce JavaScript execution time',
        'Break up long tasks',
        'Defer non-critical scripts',
        'Optimize third-party scripts',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}. TBT: ${value.toFixed(0)}ms.`,
      auditKey: key,
      simpleExplanation: 'The page feels unresponsive for too long after it starts loading.',
      developerExplanation: `TBT: ${value.toFixed(0)}ms. Reduce main-thread work and split long tasks.`,
    };
  }

  if (key === 'cumulative-layout-shift') {
    const value = numericValue || 0;
    if (!value) return null;
    return {
      title: 'Elements shift around while the page loads',
      impact: value > 0.25 ? 'high' : value > 0.1 ? 'medium' : 'low',
      description: `Cumulative Layout Shift is ${value.toFixed(2)}. Content moves unexpectedly, which frustrates visitors.`,
      soWhat: 'Visitors click the wrong thing when buttons or links move under them.',
      whatToDo: [
        'Set explicit width and height on images and iframes',
        'Reserve space for ads and dynamic content',
        'Avoid inserting content above existing content',
        'Use font-display: swap carefully with size-adjust',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}. CLS: ${value.toFixed(2)}.`,
      auditKey: key,
      simpleExplanation: 'Elements jump around as the page loads, which is disorienting.',
      developerExplanation: `CLS: ${value.toFixed(2)}. Set explicit dimensions on media and reserve ad slots.`,
    };
  }

  if (key === 'speed-index') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    const seconds = typeof value === 'number' && value < 100 ? value : value / 1000;
    return {
      title: 'The page takes too long to visually populate',
      impact: seconds > 2.5 ? 'high' : seconds > 1.2 ? 'medium' : 'low',
      description: `Speed Index is ${seconds.toFixed(1)}s. This measures how quickly the visible parts of the page appear.`,
      soWhat: 'Visitors see a mostly blank or partially loaded page for too long.',
      whatToDo: [
        'Optimize the critical rendering path',
        'Reduce render-blocking resources',
        'Improve LCP',
        'Use a CDN and optimize server response',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}. Speed Index: ${seconds.toFixed(1)}s.`,
      auditKey: key,
      simpleExplanation: 'The page takes too long to show what it looks like.',
      developerExplanation: `Speed Index: ${seconds.toFixed(1)}s. Optimize the critical path and reduce render-blocking resources.`,
    };
  }

  if (key === 'first-contentful-paint') {
    const value = numericValue || wastedMs || 0;
    if (!value) return null;
    const seconds = typeof value === 'number' && value < 100 ? value : value / 1000;
    return {
      title: 'The first content appears slowly',
      impact: seconds > 1.8 ? 'high' : seconds > 0.8 ? 'medium' : 'low',
      description: `First Contentful Paint is ${seconds.toFixed(1)}s. This is when the browser first renders text or an image.`,
      soWhat: 'Visitors stare at a blank or loading screen longer than they should.',
      whatToDo: [
        'Remove render-blocking resources',
        'Improve server response time',
        'Optimize the critical rendering path',
        'Preload critical assets',
      ],
      savingsBytes: undefined,
      savingsLabel: undefined,
      details: `Lighthouse audit: ${title}. FCP: ${seconds.toFixed(1)}s.`,
      auditKey: key,
      simpleExplanation: 'It takes too long for anything to appear on the screen.',
      developerExplanation: `FCP: ${seconds.toFixed(1)}s. Reduce TTFB, remove render-blocking CSS/JS, and optimize the critical path.`,
    };
  }

  if (key === 'uses-legacy-javascript') {
    const savings = wastedBytes;
    return {
      title: 'The page uses old JavaScript syntax',
      impact: savings > 100_000 ? 'medium' : 'low',
      description: `About ${bytesToLabel(savings)} of legacy JavaScript is loaded. Modern browsers don't need it.`,
      soWhat: 'Older JavaScript syntax adds unnecessary bytes for modern visitors.',
      whatToDo: [
        'Remove or update polyfills for modern browsers',
        'Use module/nomodule pattern',
        'Target modern JavaScript in your build',
      ],
      savingsBytes: savings,
      savingsLabel: bytesToLabel(savings),
      details: `Lighthouse audit: ${title}.`,
      auditKey: key,
      simpleExplanation: 'The page loads old JavaScript that modern browsers don\'t need.',
      developerExplanation: `${bytesToLabel(savings)} of legacy JS loaded. Use module/nomodule split and target modern syntax.`,
    };
  }

  // Generic fallback for any audit with wasted bytes
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

function impactScore(problem: Problem): number {
  let score = 0;
  if (problem.impact === 'high') score += 3;
  else if (problem.impact === 'medium') score += 2;
  else score += 1;

  if (problem.sizeBytes) {
    score += Math.log2(problem.sizeBytes / 1024 + 1);
  }

  const what = (problem.soWhat || problem.description || '').toLowerCase();
  if (what.includes('lcp') || what.includes('content')) score += 2;
  if (what.includes('cls') || what.includes('layout')) score += 1.5;
  if (what.includes('tbt') || what.includes('interact')) score += 1.5;

  return score;
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

export interface ResourceCategory {
  name: string;
  totalBytes: number;
  totalLabel: string;
  color: string;
  percentage: number;
}

export interface ResourceItem {
  name: string;
  url: string;
  size: number;
  sizeLabel: string;
  category: string;
}

export type ProblemResult = Problem;

export function diagnosePerformance(
  audits: Record<string, any>,
  options: { verbosity?: Verbosity; framework?: string } = {}
): {
  problems: Problem[];
  fixPriority: Array<{ rank: number; problem: string; impact: 'high' | 'medium' | 'low'; reason: string }>;
  resourceCategories: ResourceCategory[];
  resourceItems: ResourceItem[];
  framework: string;
} {
  const verbosity = options.verbosity || 'simple';
  const framework = options.framework || detectFramework(audits);

  const problems: Problem[] = [];

  Object.entries(audits).forEach(([key, audit]) => {
    const parsed = parseAudit(key, audit);
    if (!parsed) return;

    const problem = createProblem(key, parsed, framework, verbosity);
    if (problem) problems.push(problem);
  });

  // Sort by impact score
  problems.sort((a, b) => impactScore(b) - impactScore(a));

  // Deduplicate
  const seen = new Set<string>();
  const deduped = problems.filter((p) => {
    if (seen.has(p.auditKey)) return false;
    seen.add(p.auditKey);
    return true;
  });

  // Build fix priority
  const fixPriority = deduped.slice(0, 5).map((p, i) => ({
    rank: i + 1,
    problem: p.title,
    impact: p.impact,
    reason: p.soWhat,
  }));

  // Build resource breakdown
  const { resourceCategories, resourceItems } = buildResourceBreakdown(audits);

  return {
    problems: deduped.slice(0, 3),
    fixPriority,
    resourceCategories,
    resourceItems,
    framework,
  };
}

function parseAudit(key: string, audit: any): ParsedAudit | null {
  if (audit.scoreDisplayMode === 'notApplicable' || audit.scoreDisplayMode === 'notLoaded' || audit.scoreDisplayMode === 'informative') {
    return null;
  }

  const details = audit.details || {};
  const items = details.items || [];
  const totals = details.totals || {};

  let wastedBytes = totals.bytes || 0;
  let wastedMs = totals.ms || 0;

  // Some audits report numericValue as the metric value
  const numericValue = audit.numericValue;
  const numericUnit = audit.numericUnit;

  if (key === 'server-response-time' && typeof numericValue === 'number') {
    wastedMs = numericValue;
  }

  if (key === 'main-thread-work' && typeof numericValue === 'number') {
    wastedMs = numericValue;
  }

  if (key === 'javascript-execution' && typeof numericValue === 'number') {
    wastedMs = numericValue;
  }

  // Items may have individual entries
  items.forEach((item: any) => {
    if (typeof item.wastedBytes === 'number') wastedBytes += item.wastedBytes;
    if (typeof item.wastedMS === 'number') wastedMs += item.wastedMS;
  });

  let score = audit.score;
  if (typeof score === 'number' && score < 0) score = 0;
  if (typeof score === 'number' && score > 1) score = 1;

  return {
    key,
    title: audit.title || key,
    score,
    wastedBytes,
    wastedMs,
    numericValue,
    numericUnit,
    details: {
      items,
      totals,
    },
  };
}

function buildResourceBreakdown(audits: Record<string, any>): {
  resourceCategories: ResourceCategory[];
  resourceItems: ResourceItem[];
} {
  const categories: Record<string, { name: string; totalBytes: number; color: string; items: Array<{ name: string; url: string; size: number }> }> = {
    Images: { name: 'Images', totalBytes: 0, color: '#6366f1', items: [] },
    JavaScript: { name: 'JavaScript', totalBytes: 0, color: '#f59e0b', items: [] },
    Fonts: { name: 'Fonts', totalBytes: 0, color: '#10b981', items: [] },
    CSS: { name: 'CSS', totalBytes: 0, color: '#ec4899', items: [] },
    Other: { name: 'Other', totalBytes: 0, color: '#8b8b8b', items: [] },
  };

  const allItems: Array<{ name: string; url: string; size: number; category: string }> = [];

  Object.values(audits).forEach((audit: any) => {
    if (!audit.details?.items) return;
    audit.details.items.forEach((item: any) => {
      if (!item.url) return;
      let category = 'Other';
      const url = item.url.toLowerCase();
      if (url.match(/\.(png|jpe?g|gif|webp|avif|svg|ico|tiff?)/) || url.includes('image')) {
        category = 'Images';
      } else if (url.match(/\.js$/) || url.includes('javascript') || url.includes('bundle') || url.includes('chunk')) {
        category = 'JavaScript';
      } else if (url.match(/\.css$/) || url.includes('stylesheet')) {
        category = 'CSS';
      } else if (url.match(/\.woff2?$/) || url.match(/\.ttf$/) || url.match(/\.otf$/) || url.includes('font')) {
        category = 'Fonts';
      }

      const size = typeof item.size === 'number' ? item.size : typeof item.resourceSize === 'number' ? item.resourceSize : 0;
      if (size > 0) {
        allItems.push({
          name: extractFileName(item.url),
          url: item.url,
          size,
          category,
        });
      }
    });
  });

  allItems.forEach((item) => {
    const cat = categories[item.category];
    if (cat) {
      cat.totalBytes += item.size;
      cat.items.push(item);
    } else {
      categories.Other.totalBytes += item.size;
      categories.Other.items.push(item);
    }
  });

  const totalBytes = Object.values(categories).reduce((sum, c) => sum + c.totalBytes, 0);

  const resourceCategories = Object.values(categories)
    .filter((c) => c.totalBytes > 0)
    .map((c) => ({
      name: c.name,
      totalBytes: c.totalBytes,
      totalLabel: bytesToLabel(c.totalBytes),
      color: c.color,
      percentage: totalBytes > 0 ? (c.totalBytes / totalBytes) * 100 : 0,
    }))
    .sort((a, b) => b.totalBytes - a.totalBytes);

  const resourceItems = allItems
    .sort((a, b) => b.size - a.size)
    .slice(0, 20)
    .map((item) => ({
      name: item.name,
      url: item.url,
      size: item.size,
      sizeLabel: bytesToLabel(item.size),
      category: item.category,
    }));

  return { resourceCategories, resourceItems };
}

function detectFramework(audits: Record<string, any>): string {
  const allTitles = Object.values(audits)
    .map((a: any) => (a.title || '').toLowerCase())
    .join(' ');

  if (allTitles.includes('next.js') || allTitles.includes('nextjs')) return 'Next.js';
  if (allTitles.includes('react')) return 'React';

  Object.values(audits).forEach((audit: any) => {
    const title = (audit.title || '').toLowerCase();
    if (title.includes('next.js') || title.includes('nextjs')) return 'Next.js';
    if (title.includes('react')) return 'React';
    if (title.includes('wordpress')) return 'WordPress';
    if (title.includes('shopify')) return 'Shopify';
  });

  return '';
}
