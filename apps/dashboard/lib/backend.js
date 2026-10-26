'use strict';

const { catalog, snapshot } = require('./office-snapshot');
const COOKIE = '__Host-aexos-session';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'";
function cookie(token, seconds) { return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${seconds}`; }
function sessionCookie(request) {
  const values = String(request.headers.cookie || '').split(';').map((value) => value.trim()).filter((value) => value.startsWith(COOKIE + '='));
  if (values.length !== 1) return null;
  const value = values[0].slice(COOKIE.length + 1);
  return value.length < 8000 && /^[A-Za-z0-9_.-]+$/.test(value) ? value : null;
}
async function body(request, maximum = 16384) {
  if (!String(request.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('JSON_REQUIRED'), { status: 415 });
  const length = request.headers['content-length'];
  if (length !== undefined && (!/^\d+$/.test(String(length)) || Number(length) > maximum)) throw Object.assign(new Error('BODY_LIMIT'), { status: 413 });
  // Vercel exposes a parsed-body getter; native Node requests remain streams.
  let parsed;
  try { parsed = request.body; } catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
  if (parsed !== undefined) {
    let serialized;
    try { serialized = JSON.stringify(parsed); } catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
    if (Buffer.byteLength(serialized, 'utf8') > maximum) throw Object.assign(new Error('BODY_LIMIT'), { status: 413 });
    return parsed;
  }
  let size = 0; const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > maximum) throw Object.assign(new Error('BODY_LIMIT'), { status: 413 }); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('INVALID_JSON'), { status: 400 }); }
}
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== fields.length || fields.some((key) => !Object.hasOwn(value, key))) throw Object.assign(new Error('INVALID_FIELDS'), { status: 400 });
}
function createHandler(config = process.env, dependencies = {}) {
  const base = new URL(config.AEXOS_SUPABASE_URL);
  if (base.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(base.hostname) || base.pathname !== '/') throw new Error('INVALID_BACKEND_ORIGIN');
  const key = config.AEXOS_SUPABASE_PUBLISHABLE_KEY;
  if (!key) throw new Error('MISSING_BACKEND_KEY');
  const callFetch = dependencies.fetch || fetch;
  async function api(route, token, options = {}) {
    const response = await callFetch(new URL(route, base), { ...options, redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json', ...options.headers },
    });
    let result;
    try { result = await response.json(); } catch { result = null; }
    if (!response.ok) throw Object.assign(new Error('BACKEND_REQUEST_FAILED'), { status: [400, 401, 403, 404, 409, 429].includes(response.status) ? response.status : 502 });
    return result;
  }
  async function identity(request) {
    const token = sessionCookie(request);
    if (!token) throw Object.assign(new Error('AUTHENTICATION_REQUIRED'), { status: 401 });
    return verifiedTokenIdentity(token);
  }
  async function verifiedTokenIdentity(token) {
    const user = await api('/auth/v1/user', token);
    const live = await api('/rest/v1/rpc/aexos_session_live', token, { method: 'POST', body: '{}' });
    if (!user?.id || user.is_anonymous || live !== true) throw Object.assign(new Error('AUTHENTICATION_REQUIRED'), { status: 401 });
    return { user: { id: user.id, email: user.email || null }, token };
  }
  return async function handler(request, response) {
    const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': CSP,
      'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY' };
    function send(status, value, extra = {}) { response.writeHead(status, { ...headers, ...extra }); response.end(JSON.stringify(value)); }
    try {
      const url = new URL(request.url, 'https://dashboard.invalid');
      const route = url.searchParams.has('route') ? '/api/' + url.searchParams.get('route') : url.pathname;
      if (request.method !== 'GET') {
        const origin = request.headers.origin;
        if (!origin || origin !== `https://${request.headers.host}` || request.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'ORIGIN_REJECTED' });
      }
      if (route === '/api/login' && request.method === 'POST') {
        const input = await body(request); exact(input, ['email', 'password']);
        if (typeof input.email !== 'string' || input.email.length > 254 || typeof input.password !== 'string' || input.password.length > 1024) return send(400, { error: 'INVALID_LOGIN' });
        const result = await api('/auth/v1/token?grant_type=password', null, { method: 'POST', body: JSON.stringify(input) });
        const live = await api('/rest/v1/rpc/aexos_session_live', result.access_token, { method: 'POST', body: '{}' });
        if (live !== true || result.user?.is_anonymous || !result.access_token) return send(401, { error: 'LOGIN_FAILED' });
        return send(200, { authenticated: true, user: { id: result.user.id, email: result.user.email } }, { 'Set-Cookie': cookie(result.access_token, Math.min(result.expires_in || 3600, 3600)) });
      }
      if (route === '/api/activate' && request.method === 'POST') {
        const input = await body(request); exact(input, ['accessToken', 'password']);
        if (typeof input.accessToken !== 'string' || input.accessToken.length < 1 || input.accessToken.length >= 8000 || !/^[A-Za-z0-9_.-]+$/.test(input.accessToken)
          || typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 1024) return send(400, { error: 'INVALID_ACTIVATION' });
        const before = await verifiedTokenIdentity(input.accessToken);
        const updated = await api('/auth/v1/user', input.accessToken, { method: 'PUT', body: JSON.stringify({ password: input.password }) });
        if (!updated?.id || updated.id !== before.user.id || updated.is_anonymous) throw Object.assign(new Error('IDENTITY_MISMATCH'), { status: 401 });
        const after = await verifiedTokenIdentity(input.accessToken);
        if (after.user.id !== before.user.id) throw Object.assign(new Error('IDENTITY_MISMATCH'), { status: 401 });
        return send(200, { authenticated: true, user: after.user }, { 'Set-Cookie': cookie(input.accessToken, 3600) });
      }
      if (route === '/api/logout' && request.method === 'POST') {
        const token = sessionCookie(request);
        if (token) { try { await api('/auth/v1/logout?scope=local', token, { method: 'POST' }); } catch (error) {
          if (error.status !== 401) return send(503, { error: 'REVOCATION_UNCONFIRMED', authenticated: false }, { 'Set-Cookie': cookie('', 0) });
        } }
        return send(200, { authenticated: false, user: null }, { 'Set-Cookie': cookie('', 0) });
      }
      let auth;
      try { auth = await identity(request); } catch (error) {
        if (route === '/api/session' && request.method === 'GET' && error.status === 401) return send(200, { authenticated: false, user: null }, { 'Set-Cookie': cookie('', 0) });
        throw error;
      }
      if (route === '/api/session' && request.method === 'GET') return send(200, { authenticated: true, user: auth.user });
      if (route === '/api/catalog' && request.method === 'GET') return send(200, catalog);
      if (route === '/api/projects' && request.method === 'GET') {
        const projects = await api('/rest/v1/aexos_projects?select=id,label,epoch&order=created_at.asc&limit=100', auth.token);
        const rows = await api('/rest/v1/aexos_snapshots?select=project_id,epoch,received_at&limit=100', auth.token);
        return send(200, { projects: projects.map((project) => { const row = rows.find((entry) => entry.project_id === project.id); return { ...project,
          connected: row?.epoch === project.epoch && Date.now() - Date.parse(row.received_at) <= 60000, lastReceivedAt: row?.received_at || null }; }) });
      }
      const rotate = /^\/api\/projects\/([0-9a-f-]{36})\/token$/.exec(route);
      if (request.method === 'POST' && (route === '/api/projects' || rotate)) {
        const input = await body(request); exact(input, rotate ? [] : ['label']);
        if (rotate && !UUID.test(rotate[1])) return send(400, { error: 'INVALID_PROJECT' });
        const result = await api('/rest/v1/rpc/aexos_manage_project', auth.token, { method: 'POST', body: JSON.stringify({ p_label: rotate ? null : input.label, p_project: rotate ? rotate[1] : null }) });
        return send(200, { project: { id: result.id, label: result.label, epoch: result.epoch }, ingestToken: result.token, epoch: result.epoch,
          ingestUrl: new URL('/functions/v1/aexos-telemetry/ingest', base).href, origin: base.origin, expiresAt: result.expiresAt });
      }
      if (route === '/api/snapshot' && request.method === 'GET') {
        const id = url.searchParams.get('projectId');
        if (!UUID.test(id || '')) return send(400, { error: 'INVALID_PROJECT' });
        const projects = await api(`/rest/v1/aexos_projects?id=eq.${id}&select=id,label,epoch&limit=1`, auth.token);
        if (!projects.length) return send(404, { error: 'PROJECT_NOT_FOUND' });
        const rows = await api(`/rest/v1/aexos_snapshots?project_id=eq.${id}&select=payload,received_at&limit=1`, auth.token);
        const history = await api(`/rest/v1/aexos_events?project_id=eq.${id}&observed_at=gte.${Date.now() - 86400000}&select=payload&order=observed_at.desc,event_id.asc&limit=200`, auth.token);
        return send(200, snapshot({ ...rows[0], history: history.map((row) => row.payload) }, projects[0]));
      }
      return send(404, { error: 'NOT_FOUND' });
    } catch (error) {
      const status = error.status || 503;
      return send(status, { error: status === 401 ? 'AUTHENTICATION_REQUIRED' : status === 400 ? 'INVALID_REQUEST' : status === 429 ? 'RATE_LIMITED' : 'REQUEST_FAILED' }, status === 401 ? { 'Set-Cookie': cookie('', 0) } : {});
    }
  };
}
module.exports = { COOKIE, CSP, body, cookie, createHandler, sessionCookie };
