'use client';

import { useState } from 'react';
import {
  Image as ImageIcon,
  Code2,
  Palette,
  Server,
  Zap,
  Package,
  ChevronRight,
  CheckCircle2,
  MinusCircle,
} from 'lucide-react';

export interface MetricCardProps {
  label: string;
  value: string;
  status: 'good' | 'needs-improvement' | 'poor';
}

const STATUS_TEXT_COLOR = {
  good: 'text-good',
  'needs-improvement': 'text-warn',
  poor: 'text-bad',
};

const STATUS_LABEL = {
  good: 'Good',
  'needs-improvement': 'Needs improvement',
  poor: 'Slow',
};

function scoreStatus(score: number): 'good' | 'needs-improvement' | 'poor' {
  return score >= 90 ? 'good' : score >= 50 ? 'needs-improvement' : 'poor';
}

const SIGNAL_HEX = {
  good: '#16a34a',
  'needs-improvement': '#d97706',
  poor: '#dc2626',
};

export function ScoreDisplay({ score }: { score: number }) {
  const status = scoreStatus(score);
  const size = 160;
  const stroke = 12;
  const trackRadius = size / 2 - stroke / 2 - 2;
  const circumference = 2 * Math.PI * trackRadius;
  const offset = circumference * (1 - score / 100);
  const center = size / 2;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle cx={center} cy={center} r={trackRadius} fill="none" stroke="var(--border)" strokeWidth={stroke} />
          <circle
            cx={center}
            cy={center}
            r={trackRadius}
            fill="none"
            stroke={SIGNAL_HEX[status]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: 'stroke-dashoffset 700ms ease-out' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold tracking-tight text-foreground">{score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>
      <span className="text-sm font-semibold" style={{ color: SIGNAL_HEX[status] }}>
        {STATUS_LABEL[status]}
      </span>
    </div>
  );
}

const METRIC_PLAIN_LABEL: Record<string, string> = {
  LCP: 'Loading speed',
  FCP: 'First paint',
  TBT: 'Responsiveness',
  CLS: 'Visual stability',
  'Speed Index': 'Visual fill speed',
};

export function MetricCard({ label, value, status }: MetricCardProps) {
  const plainLabel = METRIC_PLAIN_LABEL[label];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        {plainLabel && <span className="normal-case"> &middot; {plainLabel}</span>}
      </div>
      <div className={`text-2xl font-bold mt-1 ${STATUS_TEXT_COLOR[status]}`}>{value}</div>
      <div className={`text-xs font-medium mt-0.5 ${STATUS_TEXT_COLOR[status]}`}>
        {STATUS_LABEL[status]}
      </div>
    </div>
  );
}

function getProblemIcon(auditKey: string) {
  const key = auditKey.toLowerCase();
  if (key.includes('image')) return ImageIcon;
  if (key.includes('css') || key.includes('render-blocking')) return Palette;
  if (key.includes('javascript') || key.includes('script') || key.includes('thread') || key.includes('blocking-time')) return Code2;
  if (key.includes('server')) return Server;
  if (key.includes('byte-weight')) return Package;
  return Zap;
}

export function ProblemCard({
  problem,
  index,
  verbosity,
}: {
  problem: any;
  index: number;
  verbosity: 'simple' | 'developer';
}) {
  const [open, setOpen] = useState(false);
  const Icon = getProblemIcon(problem.auditKey || '');

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-lg bg-muted flex items-center justify-center">
            <Icon className="w-5 h-5 text-muted-foreground" />
          </div>
          <div className="absolute -top-2 -left-2 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[11px] font-bold flex items-center justify-center">
            {index}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground leading-snug">
            {problem.title}
          </h3>

          {problem.resource && (
            <div className="mt-1.5 text-xs text-muted-foreground font-mono truncate">
              {problem.resource}
            </div>
          )}

          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {problem.description}
          </p>

          {problem.savingsLabel && (
            <div className="mt-2 text-sm">
              <span className="text-muted-foreground">Potential savings: </span>
              <span className="font-semibold text-foreground">{problem.savingsLabel}</span>
            </div>
          )}
        </div>

        <button
          onClick={() => setOpen((v) => !v)}
          className="hidden sm:inline-flex shrink-0 items-center gap-1 h-9 px-3.5 rounded-lg border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          {open ? 'Hide details' : 'Show what causes this'}
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="sm:hidden mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground"
      >
        {open ? 'Hide details' : 'Show what causes this'}
        <ChevronRight className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="mt-5 pt-5 border-t border-border grid sm:grid-cols-2 gap-5">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Why this matters
            </div>
            <p className="text-sm text-foreground leading-relaxed">
              {verbosity === 'simple' ? problem.soWhat : problem.developerExplanation}
            </p>
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              What to do
            </div>
            <ul className="space-y-1.5">
              {(verbosity === 'simple' ? problem.whatToDo : (problem.devWhatToDo || problem.whatToDo)).map((item: string, i: number) => (
                <li key={i} className="text-sm text-foreground flex items-start gap-2 leading-relaxed">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-primary" fill="currentColor" fillOpacity={0.15} />
                  <span className={verbosity === 'developer' ? 'font-mono text-[13px]' : ''}>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

export function NotWorthFixingList({ items }: { items: Array<{ title: string; reason: string }> }) {
  if (items.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold text-foreground mb-1">
        Not worth your time right now
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        Lighthouse flags these too, but fixing them won&apos;t meaningfully change what visitors experience.
      </p>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-3">
            <MinusCircle className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium text-foreground">{item.title}</div>
              <p className="text-sm text-muted-foreground mt-0.5">{item.reason}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FieldDataCard({
  comparison,
}: {
  comparison: { labSeconds: number; fieldSeconds: number; category: string; scope: 'page' | 'site'; verdict: string } | null;
}) {
  if (!comparison) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold text-foreground mb-1">
        Your visitors
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        {comparison.scope === 'page'
          ? 'How real Chrome users experienced this exact page over the last 28 days.'
          : 'Not enough real-visitor data for this exact page yet, so this is site-wide instead.'}
      </p>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">This test</div>
          <div className="text-2xl font-bold text-foreground mt-1">{comparison.labSeconds.toFixed(1)}s</div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Real visitors</div>
          <div className="text-2xl font-bold text-foreground mt-1">{comparison.fieldSeconds.toFixed(1)}s</div>
        </div>
      </div>
      <p className="text-sm text-foreground leading-relaxed">{comparison.verdict}</p>
    </div>
  );
}

export function TechnicalDetails({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="p-5 text-sm font-medium text-foreground">
        Technical details
      </div>
      <div className="px-5 pb-5 pt-1 border-t border-border space-y-6">
        {children}
      </div>
    </div>
  );
}

function categoryIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('image')) return ImageIcon;
  if (n.includes('javascript')) return Code2;
  if (n.includes('css')) return Palette;
  if (n.includes('font')) return Package;
  return Server;
}

export function ResourceBars({ categories }: { categories: Array<{ name: string; totalBytes: number; totalLabel: string; color: string; percentage: number }> }) {
  const total = categories.reduce((sum, c) => sum + c.totalBytes, 0);
  if (categories.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-foreground mb-1">
        Resource breakdown
      </h3>
      <p className="text-sm text-muted-foreground mb-4">See what visitors download.</p>
      <div className="space-y-3">
        {categories.map((cat) => {
          const Icon = categoryIcon(cat.name);
          return (
            <div key={cat.name}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4" style={{ color: cat.color }} />
                  <span className="text-sm font-medium text-foreground">{cat.name}</span>
                </div>
                <span className="text-sm text-muted-foreground">
                  {cat.totalLabel}
                  <span className="ml-1 text-xs">({cat.percentage.toFixed(0)}%)</span>
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${cat.percentage}%`, backgroundColor: cat.color }}
                />
              </div>
            </div>
          );
        })}
        {total > 0 && (
          <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
            <span className="text-sm font-medium text-foreground">Total transfer size</span>
            <span className="text-sm font-semibold text-foreground">
              {total < 1024 * 1024
                ? `${(total / 1024).toFixed(0)} KB`
                : `${(total / (1024 * 1024)).toFixed(1)} MB`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export function ResourceList({
  items,
  category,
  onSelect,
}: {
  items: Array<{ name: string; url: string; size: number; sizeLabel: string; category: string }>;
  category: string;
  onSelect?: (item: any) => void;
}) {
  const filtered = items.filter((i) => i.category === category).sort((a, b) => b.size - a.size);

  if (filtered.length === 0) return null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-3">
        Largest {category.toLowerCase()}
      </h4>
      <div className="space-y-1">
        {filtered.slice(0, 10).map((item, i) => (
          <div
            key={i}
            className="flex items-center justify-between py-2 px-3 -mx-3 rounded-lg hover:bg-muted cursor-pointer transition-colors"
            onClick={() => onSelect?.(item)}
          >
            <span className="text-sm text-foreground font-mono truncate">{item.name}</span>
            <span className="text-sm text-muted-foreground font-mono shrink-0 ml-2">
              {item.sizeLabel}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PositiveList({ positives }: { positives: Array<{ title: string; description: string }> }) {
  if (positives.length === 0) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-lg font-semibold text-foreground mb-4">
        What&apos;s working well
      </h3>
      <ul className="space-y-3">
        {positives.map((p, i) => (
          <li key={i} className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-good" fill="currentColor" fillOpacity={0.15} />
            <div>
              <div className="text-sm font-medium text-foreground">{p.title}</div>
              <p className="text-sm text-muted-foreground mt-0.5">{p.description}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function FrameworkBadge({ framework }: { framework: string | null }) {
  if (!framework) return null;

  return (
    <div className="inline-flex items-center gap-1.5 text-sm bg-muted px-3 py-1 rounded-full">
      <Code2 className="w-3.5 h-3.5 text-muted-foreground" />
      <span className="text-muted-foreground">Detected:</span>
      <span className="font-medium text-foreground">{framework}</span>
    </div>
  );
}
