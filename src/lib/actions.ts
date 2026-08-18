'use server';

import { analyzeURL } from '@/lib/ps-api';
import { APIResponse } from '@/lib/types';

export async function analyzeWebsite(url: string): Promise<APIResponse> {
  return analyzeURL(url);
}