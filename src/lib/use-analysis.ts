'use client';

import { useState, useCallback } from 'react';
import { APIResponse, Report } from '@/lib/types';

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
}

export function useAnalysis(): UseAnalysisReturn {
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputURL, setInputURL] = useState('');
  const [verbosity, setVerbosity] = useState<'simple' | 'developer'>('simple');

  const runAnalysis = useCallback(async (url: string) => {
    if (!url) return;
    setLoading(true);
    setError(null);
    setReport(null);

    try {
      const result = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data: APIResponse = await result.json();

      if (data.success && data.report) {
        setReport(data.report);
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
  };
}
