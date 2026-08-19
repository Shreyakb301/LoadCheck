'use client';

import { useState, useEffect } from 'react';
import { useAnalysis } from '@/lib/use-analysis';
import {
  ScoreDisplay,
  MetricCard,
  ProblemCard,
  PositiveList,
  NotWorthFixingList,
  FieldDataCard,
  TechnicalDetails,
  ResourceBars,
  ResourceList,
  FrameworkBadge,
} from '@/lib/problem-utils';
import {
  Loader2,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  Lightbulb,
  ShieldCheck,
  Link2,
  Search,
  ListChecks,
  CheckCircle2,
} from 'lucide-react';

function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 6v6l4 2" strokeLinecap="round" />
    </svg>
  );
}

const STAGES = [
  { label: 'Testing page', description: 'Loading the page and running initial checks' },
  { label: 'Measuring performance', description: 'Running Lighthouse tests' },
  { label: 'Inspecting resources', description: 'Analyzing images, scripts, fonts, and more' },
  { label: 'Finding biggest bottlenecks', description: 'Identifying what is slowing the page down' },
  { label: 'Building your report', description: 'Almost there!' },
];

const EXAMPLES = ['vercel.com', 'stripe.com', 'airbnb.com'];

const HOW_IT_WORKS = [
  { icon: Link2, title: 'You enter a URL', description: 'We analyze the public page you provide.' },
  { icon: Search, title: 'We run tests', description: 'We run performance tests using Lighthouse.' },
  { icon: ListChecks, title: 'We find problems', description: 'We identify the biggest issues slowing it down.' },
  { icon: CheckCircle2, title: 'You get answers', description: 'You get clear explanations and what to fix first.' },
];

export default function Home() {
  const {
    report,
    loading,
    error,
    inputURL,
    setInputURL,
    setError,
    verbosity,
    setVerbosity,
    submitURL,
    reset,
    usingFallback,
  } = useAnalysis();

  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    if (loading) {
      setStageIndex(0);
      let i = 0;
      const interval = setInterval(() => {
        i = Math.min(i + 1, STAGES.length - 1);
        setStageIndex(i);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [loading]);

  const handleAnalyze = (url: string) => {
    if (url.trim()) {
      submitURL(url.trim());
    }
  };

  const handleTryExample = (domain?: string) => {
    const url = domain ? `https://${domain}` : 'https://example.com';
    setInputURL(url);
    submitURL(url);
  };

  return (
    <div className="flex flex-col min-h-screen">
      {/* Header */}
      <header className="border-b border-border bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <button onClick={reset} className="flex items-center gap-2">
            <Logo className="w-6 h-6 text-foreground" />
            <span className="font-bold text-foreground">LoadCheck</span>
          </button>
          {!report && !loading && (
            <nav className="hidden sm:flex items-center gap-6">
              <a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                How it works
              </a>
              <button
                onClick={() => handleTryExample()}
                className="h-8 px-3 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
              >
                Try example
              </button>
            </nav>
          )}
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">Free · No signup</span>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 flex flex-col">
        {/* Hero */}
        {!report && !loading && !error && (
          <div className="flex-1 flex flex-col">
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
              <div className="max-w-2xl w-full text-center">
                <div className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground bg-muted px-3 py-1.5 rounded-full mb-6">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Free</span>
                  <span className="text-border">·</span>
                  <span>No signup</span>
                  <span className="text-border">·</span>
                  <span>Takes about a minute</span>
                </div>

                <h1 className="text-5xl sm:text-6xl font-bold tracking-tight text-foreground leading-[1.1]">
                  Why is my{' '}
                  <span className="relative inline-block whitespace-nowrap">
                    <span className="relative z-10">website</span>
                    <span className="absolute inset-x-0 bottom-1 h-4 bg-primary/70 -rotate-1 -z-0" />
                  </span>{' '}
                  slow?
                </h1>
                <p className="mt-4 text-xl text-muted-foreground">
                  Paste a URL. We&apos;ll tell you what&apos;s actually worth fixing, and what you can safely ignore.
                </p>

                {/* URL Input */}
                <div className="mt-10 flex flex-col sm:flex-row gap-3 max-w-xl mx-auto">
                  <div className="flex-1 relative">
                    <input
                      type="url"
                      value={inputURL}
                      onChange={(e) => setInputURL(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && inputURL.trim()) {
                          handleAnalyze(inputURL.trim());
                        }
                      }}
                      placeholder="https://yourwebsite.com"
                      className="w-full h-14 px-4 text-lg rounded-xl border border-border bg-white text-foreground placeholder:text-muted-foreground outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 transition-all"
                    />
                  </div>
                  <button
                    onClick={() => handleAnalyze(inputURL)}
                    disabled={!inputURL.trim()}
                    className="h-14 px-6 rounded-xl bg-primary text-primary-foreground font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-all flex items-center justify-center gap-2 min-w-[150px]"
                  >
                    Analyze site
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Try example */}
                <div className="mt-6">
                  <p className="text-base text-muted-foreground mb-3">Don&apos;t have a URL? Try an example</p>
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
                    {EXAMPLES.map((domain) => (
                      <button
                        key={domain}
                        onClick={() => handleTryExample(domain)}
                        className="w-full sm:w-auto flex items-center justify-between sm:justify-center gap-2 px-4 py-2 rounded-lg border border-border text-base font-medium text-foreground hover:bg-muted transition-colors"
                      >
                        https://{domain}
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    ))}
                  </div>
                </div>

                <p className="mt-8 text-sm text-muted-foreground">
                  We analyze the public URL you provide. No account or project data is stored.
                </p>
              </div>
            </div>

            {/* How it works */}
            <div id="how-it-works" className="border-t border-border bg-muted/40 px-6 py-16 scroll-mt-16">
              <div className="max-w-4xl mx-auto">
                <h2 className="text-3xl font-bold text-foreground text-center mb-1">How LoadCheck works</h2>
                <p className="text-base text-muted-foreground text-center mb-10">
                  We analyze using Lighthouse under the hood, then turn the results into simple, actionable advice.
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
                  {HOW_IT_WORKS.map((step, i) => (
                    <div key={step.title} className="flex flex-col items-center text-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                        <step.icon className="w-5 h-5 text-foreground" />
                      </div>
                      <div>
                        <div className="text-base font-semibold text-foreground">
                          {i + 1}. {step.title}
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Loading stages */}
        {loading && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-16">
            <div className="max-w-md w-full">
              <h2 className="text-2xl font-bold text-foreground text-center">Analyzing your site</h2>
              <p className="mt-1 text-sm text-muted-foreground text-center">This usually takes 30&ndash;60 seconds</p>

              {usingFallback && (
                <div className="mt-4 flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-xl p-4">
                  <Loader2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-700 animate-spin" />
                  <p className="text-sm text-amber-900">
                    Google servers are slow, trying other ways&hellip;
                  </p>
                </div>
              )}

              <div className="mt-10">
                {STAGES.map((stage, i) => {
                  const state = i < stageIndex ? 'done' : i === stageIndex ? 'active' : 'upcoming';
                  return (
                    <div key={stage.label} className="relative flex gap-3 pb-6 last:pb-0">
                      {i < STAGES.length - 1 && (
                        <div className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
                      )}
                      <div
                        className={`relative z-10 shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                          state === 'done'
                            ? 'bg-primary text-primary-foreground'
                            : state === 'active'
                            ? 'bg-primary/20 border-2 border-primary'
                            : 'bg-muted'
                        }`}
                      >
                        {state === 'done' ? (
                          <Check className="w-3.5 h-3.5" strokeWidth={3} />
                        ) : state === 'active' ? (
                          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                        ) : (
                          <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40" />
                        )}
                      </div>
                      <div>
                        <div className={`text-sm font-medium ${state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'}`}>
                          {stage.label}
                        </div>
                        <p className="text-xs text-muted-foreground">{stage.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex items-start gap-3 bg-accent border border-primary/30 rounded-xl p-4">
                <Lightbulb className="w-4 h-4 shrink-0 mt-0.5 text-foreground" />
                <p className="text-sm text-foreground">
                  Please keep this tab open while we analyze your site. LoadCheck works best with public, accessible pages.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
            <div className="max-w-md w-full text-center">
              <div className="mt-4 flex items-center justify-center gap-2">
                <svg className="w-8 h-8 text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4m0 4h.01" />
                </svg>
              </div>
              <h2 className="mt-4 text-lg font-semibold text-foreground">Analysis failed</h2>
              <p className="mt-2 text-sm text-muted-foreground">{error}</p>
              <button
                onClick={() => { setError(null); setInputURL(''); }}
                className="mt-6 h-10 px-5 rounded-lg bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Results */}
        {report && (
          <div className="flex-1 overflow-auto">
            <div className="max-w-4xl mx-auto px-6 py-8 pb-16">
              {/* Header row */}
              <div className="flex items-center justify-between mb-2 gap-3">
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Analyze another URL
                </button>
                <button
                  onClick={reset}
                  className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors inline-flex items-center gap-1.5 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  New analysis
                </button>
              </div>

              {/* URL */}
              <div className="flex items-center gap-2 mb-2 mt-4">
                <span className="text-sm text-muted-foreground truncate font-mono">{report.url}</span>
                <button
                  onClick={() => window.open(report.url, '_blank')}
                  className="shrink-0 p-1 rounded hover:bg-muted transition-colors"
                  title="Open in new tab"
                >
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground mb-8">
                Analyzed on {new Date(report.fetchedAt).toLocaleString()}
              </p>

              {/* Verdict hero */}
              <div className="rounded-2xl border border-border bg-card p-8 mb-8">
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <ScoreDisplay score={report.performanceScore} />
                  <div className="flex-1 text-center sm:text-left">
                    <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
                      {report.headline}
                    </h1>
                    {report.headlineDetail && (
                      <p className="mt-3 text-base text-muted-foreground max-w-lg">
                        {report.headlineDetail}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-6 text-xs text-muted-foreground text-center sm:text-left">
                  The score is a lab-test snapshot, not a grade. It can shift a little between runs. The list below is what actually matters.
                </p>
              </div>

              {/* What to fix */}
              <div id="worth-fixing" className="mb-8 scroll-mt-20">
                <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-foreground">
                    What to fix
                  </h2>
                  {report.problems.length > 0 && (
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">Explain for</span>
                      <div className="flex rounded-lg border border-border overflow-hidden">
                        <button
                          onClick={() => setVerbosity('simple')}
                          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                            verbosity === 'simple'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-white text-foreground hover:bg-muted'
                          }`}
                        >
                          Simple
                        </button>
                        <button
                          onClick={() => setVerbosity('developer')}
                          className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                            verbosity === 'developer'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-white text-foreground hover:bg-muted'
                          }`}
                        >
                          Developer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-6">
                  Ranked by impact and effort. The ones worth your time first.
                </p>
                {report.problems.length > 0 ? (
                  <div className="space-y-4">
                    {report.problems.map((problem, i) => (
                      <ProblemCard
                        key={i}
                        problem={problem}
                        index={i + 1}
                        verbosity={verbosity}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                    Nothing here needs your attention right now.
                  </div>
                )}
              </div>

              {/* Positives */}
              {report.positives.length > 0 && (
                <div className="mb-8">
                  <PositiveList positives={report.positives} />
                </div>
              )}

              {/* Not worth fixing */}
              {report.notWorthFixing.length > 0 && (
                <div className="mb-8">
                  <NotWorthFixingList items={report.notWorthFixing} />
                </div>
              )}

              {/* Lab vs real users */}
              {report.fieldComparison && (
                <div className="mb-8">
                  <FieldDataCard comparison={report.fieldComparison} />
                </div>
              )}

              {/* Technical details */}
              <TechnicalDetails>
                <div className="grid grid-cols-2 gap-3 pt-4">
                  {report.metrics.map((metric) => (
                    <MetricCard
                      key={metric.label}
                      label={metric.label}
                      value={
                        // metric.value is already converted to the right unit by getMetrics()
                        // in ps-api.ts, no further guessing/conversion needed here.
                        metric.unit === 'seconds'
                          ? `${metric.value.toFixed(1)}s`
                          : metric.unit === 'milliseconds'
                          ? `${metric.value.toFixed(0)}ms`
                          : metric.value.toFixed(2)
                      }
                      status={metric.status}
                    />
                  ))}
                </div>

                {report.framework && <FrameworkBadge framework={report.framework} />}

                <ResourceBars categories={report.resourceCategories} />

                {report.resourceCategories.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {report.resourceCategories.map((cat) => (
                      <ResourceList
                        key={cat.name}
                        items={report.resourceItems}
                        category={cat.name}
                      />
                    ))}
                  </div>
                )}
              </TechnicalDetails>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
