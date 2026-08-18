export interface PageSpeedAudits {
  [key: string]: {
    title: string;
    description: string;
    score?: number;
    scoreDisplayMode?: string;
    details?: {
      items?: Array<{
        title?: string;
        description?: string;
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
      };
    };
    numericValue?: number;
    numericUnit?: string;
  };
}

export interface PageSpeedLighthouseResult {
  fetchTime: string;
  finalUrl: string;
  displayUrl: string;
  categories: {
    performance: {
      title: string;
      score: number;
      scoreFormatted: string;
    };
  };
  audits: PageSpeedAudits;
}

export interface PageSpeedResponse {
  kind: string;
  status: string;
  title: string;
  score?: number;
  scoreFlow?: unknown[];
  _url: string;
  lighthouseResult?: PageSpeedLighthouseResult;
  pageResolution: string;
  analysisMode: string;
  fieldsMissing: boolean;
}

// Our normalized types

export interface PerformanceMetric {
  label: string;
  value: number;
  unit: string;
  status: 'good' | 'needs-improvement' | 'poor';
  description: string;
  soWhat: string;
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

export type Effort = 'easy' | 'medium' | 'hard';
export type Verdict = 'fix-now' | 'fix-next' | 'leave-it' | 'optional' | 'ignore';

export interface Problem {
  title: string;
  resource?: string;
  sizeBytes?: number;
  sizeLabel?: string;
  impact: 'high' | 'medium' | 'low';
  effort: Effort;
  verdict: Verdict;
  description: string;
  soWhat: string;
  whatToDo: string[];
  savingsBytes?: number;
  savingsLabel?: string;
  details: string;
  auditKey: string;
  simpleExplanation: string;
  developerExplanation: string;
  frameworkTip?: string;
}

export interface SkippedIssue {
  title: string;
  reason: string;
}

export interface Positive {
  title: string;
  description: string;
}

export interface FieldComparison {
  labSeconds: number;
  fieldSeconds: number;
  category: 'FAST' | 'AVERAGE' | 'SLOW';
  scope: 'page' | 'site';
  verdict: string;
}

export interface Report {
  url: string;
  performanceScore: number;
  headline: string;
  headlineDetail: string | null;
  metrics: PerformanceMetric[];
  problems: Problem[];
  notWorthFixing: SkippedIssue[];
  positives: Positive[];
  fieldComparison: FieldComparison | null;
  resourceCategories: ResourceCategory[];
  resourceItems: ResourceItem[];
  framework: string | null;
  fetchedAt: string;
}

export interface LoadStage {
  label: string;
  description: string;
}

export interface APIResponse {
  success: boolean;
  report?: Report;
  error?: string;
  errorMessage?: string;
  errorCode?: string;
}

export function bytesToLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatMetricValue(value: number, unit: string): string {
  if (unit === 'milliseconds') {
    return `${value.toFixed(0)}ms`;
  }
  if (unit === 'seconds') {
    return `${value.toFixed(2)}s`;
  }
  if (unit === 'bytes') {
    return bytesToLabel(value);
  }
  return `${value}`;
}
