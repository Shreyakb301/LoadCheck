'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { APIResponse, Report } from '@/lib/types';
import { normalizeAndValidateUrl } from '@/lib/url-validation';

interface UseAnalysisReturn {
  report: Report | null;
  loading: boolean;
  error: string | null;
  inputURL: string;
  setInputURL: (url: string) => void;
  setError: (error: string | null) => void;
  verbosity: 'simple' | 'developer';
  setVerbosity: (v: 'simple' | 'developer') => void;
  runAnalysis: (url: string) => Promise<void>;
  submitURL: (url: string) => void;
  reset: () => void;
  usingFallback: boolean;
}

async function requestAnalysis(url: string, strategy: 'psi' | 'self-hosted'): Promise<APIResponse> {
  const result = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, strategy }),
  });
  return result.json();
}

function updateShareableURL(analyzedUrl: string | null) {
  if (typeof window === 'undefined') return;
  const next = new URL(window.location.href);
  if (analyzedUrl) {
    next.searchParams.set('url', analyzedUrl);
  } else {
    next.searchParams.delete('url');
  }
  window.history.replaceState(null, '', next.pathname + next.search);
}

export function useAnalysis(): UseAnalysisReturn {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputURL, setInputURL] = useState('');
  const [verbosity, setVerbosity] = useState<'simple' | 'developer'>('simple');
  const [usingFallback, setUsingFallback] = useState(false);
  const ranInitialUrl = useRef(false);

  const runAnalysis = useCallback(async (url: string) => {
    if (!url) return;

    // Check the URL is well-formed before ever showing the "Analyzing your site" progress UI,
    // instead of only finding out after a round trip to the server.
    const validation = normalizeAndValidateUrl(url);
    if (!validation.success) {
      setError(validation.error);
      setReport(null);
      return;
    }

    setLoading(true);
    setError(null);
    setReport(null);
    setUsingFallback(false);

    try {
      // Try Google's PageSpeed Insights first, it's normally the fastest path. If it's
      // unavailable or too slow, fall back to running Lighthouse ourselves, as a genuinely
      // separate request so the "trying another way" UI reflects a real state change rather
      // than a guess based on elapsed time.
      let data = await requestAnalysis(validation.normalizedUrl, 'psi');

      if (!data.success && data.errorCode === 'PSI_UNAVAILABLE') {
        setUsingFallback(true);
        data = await requestAnalysis(validation.normalizedUrl, 'self-hosted');
      }

      if (data.success && data.report) {
        setReport(data.report);
        updateShareableURL(data.report.url);
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to analyze. Check the URL and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  const submitURL = useCallback((url: string) => {
    setInputURL(url);
    runAnalysis(url);
  }, [runAnalysis]);

  const reset = useCallback(() => {
    setReport(null);
    setError(null);
    setInputURL('');
    setLoading(false);
    setUsingFallback(false);
    updateShareableURL(null);
  }, []);

  // If the page was opened with a shared ?url=..., auto-run that analysis once on mount.
  useEffect(() => {
    if (ranInitialUrl.current) return;
    ranInitialUrl.current = true;
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url');
    if (sharedUrl) {
      submitURL(sharedUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    report,
    loading,
    error,
    inputURL,
    setInputURL,
    setError,
    verbosity,
    setVerbosity,
    runAnalysis,
    submitURL,
    reset,
    usingFallback,
  };
}
