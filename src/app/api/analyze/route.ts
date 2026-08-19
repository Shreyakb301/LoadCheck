import { analyzeURL } from '@/lib/ps-api';

export { analyzeURL };

// Running our own headless Chrome + Lighthouse (reachability check + browser launch + page
// load + audits) can take a while, especially for heavier sites.
export const maxDuration = 60;

async function handler(request: Request) {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let body: { url?: string; strategy?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid request body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = body.url;
  if (!url || typeof url !== 'string') {
    return new Response(JSON.stringify({ success: false, error: 'URL is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const strategy = body.strategy === 'self-hosted' ? 'self-hosted' : 'psi';
  const result = await analyzeURL(url, strategy);
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const POST = handler;
