// Spotify: login (PKCE) e chamadas feitas pelo próprio aparelho
// (busca e tocar músicas). O "ouvindo agora" de cada um é lido pelo banco.

const C = window.NOS_CONFIG || {};
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

export const spotifyConfigured = () => !!C.SPOTIFY_CLIENT_ID;

export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

function randomString(len) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function base64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function startSpotifyLogin(api) {
  if (api.demo) {
    await api.spotify.connectDemo();
    return 'demo';
  }
  const verifier = randomString(64);
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const redirect = redirectUri();
  const state = await api.spotify.begin(verifier, C.SPOTIFY_CLIENT_ID, redirect);
  const p = new URLSearchParams({
    client_id: C.SPOTIFY_CLIENT_ID,
    response_type: 'code',
    redirect_uri: redirect,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
    scope: SCOPES,
  });
  location.href = 'https://accounts.spotify.com/authorize?' + p.toString();
  return 'redirect';
}

async function call(api, method, path, body) {
  let token = await api.spotify.token();
  if (!token) {
    const e = new Error('Conecte seu Spotify primeiro.');
    e.code = 'not_connected';
    throw e;
  }
  const run = (tok) => fetch('https://api.spotify.com/v1' + path, {
    method,
    headers: { Authorization: 'Bearer ' + tok, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let r = await run(token);
  if (r.status === 401) {
    token = await api.spotify.token(true);
    r = await run(token);
  }
  if (r.status === 204 || r.status === 202) return null;
  const text = await r.text();
  let j = null;
  try { j = text ? JSON.parse(text) : null; } catch { /* resposta sem JSON */ }
  if (!r.ok) {
    const e = new Error(j?.error?.message || 'Erro no Spotify (' + r.status + ')');
    e.status = r.status;
    e.reason = j?.error?.reason;
    throw e;
  }
  return j;
}

export async function searchTracks(api, q) {
  if (api.demo) return api.spotify.searchDemo(q);
  if (!q.trim()) return [];
  const j = await call(api, 'GET', '/search?type=track&limit=10&q=' + encodeURIComponent(q));
  return (j?.tracks?.items || []).filter(Boolean).map((t) => ({
    id: t.id,
    name: t.name,
    artists: (t.artists || []).map((a) => a.name).join(', '),
    image: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify || 'https://open.spotify.com/track/' + t.id,
    uri: t.uri,
  }));
}

export function trackLink(id) {
  return 'https://open.spotify.com/track/' + id;
}

// Tenta tocar no Spotify do próprio usuário. Se não houver aparelho ativo
// ou a conta não for Premium, devolve o motivo pra abrir o link em vez disso.
export async function playTrack(api, id, positionMs = 0) {
  if (api.demo) return { ok: false, reason: 'demo' };
  try {
    await call(api, 'PUT', '/me/player/play', { uris: ['spotify:track:' + id], position_ms: Math.max(0, Math.floor(positionMs)) });
    return { ok: true };
  } catch (e) {
    if (e.code === 'not_connected') return { ok: false, reason: 'not_connected' };
    if (e.status === 404 || e.reason === 'NO_ACTIVE_DEVICE') return { ok: false, reason: 'no_device' };
    if (e.status === 403) return { ok: false, reason: 'premium' };
    return { ok: false, reason: 'error', message: e.message };
  }
}
