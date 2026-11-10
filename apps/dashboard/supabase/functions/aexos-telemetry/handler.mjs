import { LIMITS, validateEnvelope } from './schema.mjs';

async function boundedJson(request) {
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') throw Object.assign(new Error('JSON_REQUIRED'), { status: 415 });
  const reader = request.body?.getReader();
  if (!reader) throw Object.assign(new Error('BODY_REQUIRED'), { status: 400 });
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > LIMITS.bytes) { await reader.cancel(); throw Object.assign(new Error('BYTE_LIMIT'), { status: 413 }); }
      chunks.push(value);
    }
    const joined = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.length; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined));
  } catch (error) { if (!error.status) error.status = 400; throw error; }
  finally { reader.releaseLock(); }
}
export function createIngestHandler({ supabaseUrl, serviceKey, catalogKeys, fetch: send = fetch, now = Date.now }) {
  const base = new URL(supabaseUrl);
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || !serviceKey) throw new Error('INVALID_INGEST_CONFIG');
  return async (request) => {
    const json = (status, value) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
    try {
      const url = new URL(request.url);
      if (request.method !== 'POST' || url.pathname !== '/aexos-telemetry/ingest') return json(404, { error: 'NOT_FOUND' });
      const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(request.headers.get('Authorization') || '');
      if (!match) return json(401, { error: 'INGEST_DENIED' });
      const tokenHash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(match[1]))), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const payload = validateEnvelope(await boundedJson(request), catalogKeys, now());
      const response = await send(new URL('/rest/v1/rpc/aexos_ingest', base), {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apikey: serviceKey, 'Content-Type': 'application/json',
          ...(serviceKey.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${serviceKey}` }) },
        body: JSON.stringify({ p_token_hash: tokenHash, p_payload: payload }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        if (error.message === 'RATE_LIMIT') return json(429, { error: 'RATE_LIMITED' });
        if (error.message === 'OLD_SEQUENCE') {
          // The database checks token, project and epoch before producing this
          // numeric detail. Never forward arbitrary database error details.
          const raw = error.details;
          const lastSequence = typeof raw === 'string' && /^(0|[1-9][0-9]{0,15})$/.test(raw) ? Number(raw) : null;
          return json(409, Number.isSafeInteger(lastSequence) && lastSequence >= payload.sequence && lastSequence < Number.MAX_SAFE_INTEGER
            ? { error: 'OLD_SEQUENCE', lastSequence } : { error: 'OLD_SEQUENCE' });
        }
        return json(response.status >= 500 ? 503 : 401, { error: 'INGEST_DENIED' });
      }
      return json(200, { accepted: true, sequence: payload.sequence });
    } catch (error) { return json(error.status || (error instanceof TypeError ? 503 : 400), { error: 'REQUEST_REJECTED' }); }
  };
}
