import { handler as activityLog } from './netlify/functions/activity-log.js';
import { handler as agentBadge } from './netlify/functions/agent-badge.js';
import { handler as grokChat } from './netlify/functions/grok-chat.js';
import { handler as hello } from './netlify/functions/hello.js';
import { handler as liveFeed } from './netlify/functions/live-feed.js';

const ROUTES = {
  'activity-log': activityLog,
  'agent-badge': agentBadge,
  'grok-chat': grokChat,
  'hello': hello,
  'live-feed': liveFeed
};

async function invokeNetlifyHandler(fn, request, env) {
  if (typeof process !== 'undefined' && process.env) {
    for (const [k, v] of Object.entries(env)) {
      if (typeof v === 'string') process.env[k] = v;
    }
  }
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const queryStringParameters = {};
  url.searchParams.forEach((v, k) => { queryStringParameters[k] = v; });
  const body = request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined;

  const event = {
    httpMethod: request.method,
    path: url.pathname,
    rawUrl: request.url,
    rawQuery: url.search.replace(/^\?/, ''),
    headers,
    queryStringParameters,
    body,
    isBase64Encoded: false
  };

  const result = await fn(event, {});
  const outHeaders = new Headers(result?.headers || {});
  return new Response(result?.body ?? '', {
    status: result?.statusCode || 200,
    headers: outHeaders
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    if (p === '/api/grok-chat') return invokeNetlifyHandler(grokChat, request, env);
    if (p === '/api/live-feed') return invokeNetlifyHandler(liveFeed, request, env);
    if (p.startsWith('/.netlify/functions/')) {
      const name = p.slice('/.netlify/functions/'.length).split('/')[0];
      if (ROUTES[name]) return invokeNetlifyHandler(ROUTES[name], request, env);
      return new Response(JSON.stringify({ error: `Unknown function: ${name}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }
    return env.ASSETS.fetch(request);
  }
};
