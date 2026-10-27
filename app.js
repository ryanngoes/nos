import { makeSupabaseApi, friendlyError } from './api.js';
import { makeDemoApi } from './demo.js';
import { startSpotifyLogin, searchTracks, playTrack, trackLink, spotifyConfigured, redirectUri } from './spotify.js';

const C = window.NOS_CONFIG || {};
const params = new URLSearchParams(location.search);
const $app = document.getElementById('app');

const S = {
  api: null,
  me: null, // { profile, couple, partner }
  cleanups: [],
  onData: null,
  unsub: null,
  matchShown: false,
};

/* ───────────────────────── helpers ───────────────────────── */

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  add(el, kids);
  return el;
}
function add(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

const ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="m20 16-4.5-4.5L7 20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  music: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.1A4.4 4.4 0 0 1 12 7.4a4.4 4.4 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  chat: '<path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5z"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
  mic: '<rect x="9" y="3.5" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v2.5"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  play: '<path d="M8 5.5v13l10-6.5z"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M6 12v7h12v-7"/>',
  pin: '<path d="M12 21s6-5.6 6-11a6 6 0 0 0-12 0c0 5.4 6 11 6 11z"/><circle cx="12" cy="10" r="2"/>',
};
function icon(name, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = ICONS[name];
  return s;
}
// O "nó": dois anéis entrelaçados. É a marca do app.
function knot(cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 120 80');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = '<circle cx="44" cy="40" r="28" fill="none" stroke="var(--cherry)" stroke-width="9"/><circle cx="76" cy="40" r="28" fill="none" stroke="var(--ink)" stroke-width="9"/><path d="M60.5 17.5a28 28 0 0 1 0 45" fill="none" stroke="var(--cherry)" stroke-width="9"/>';
  return s;
}

let toastTimer;
function toast(msg, ms = 2600) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

function sheet(title, body, opts = {}) {
  const wrap = h('div', { class: 'sheet-wrap' });
  const close = () => { wrap.remove(); opts.onClose?.(); };
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'grabber' }),
    title ? h('h2', null, title) : null,
    body,
  );
  wrap.append(panel);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.body.append(wrap);
  const first = panel.querySelector('input, textarea, button');
  if (first && opts.focus !== false) setTimeout(() => first.focus(), 250);
  return { close, panel };
}

function confirmSheet(title, text, okLabel, onOk) {
  let s;
  const ok = h('button', { class: 'btn block', onclick: async () => { ok.disabled = true; try { await onOk(); s.close(); } catch (e) { toast(friendlyError(e)); ok.disabled = false; } } }, okLabel);
  s = sheet(title, h('div', { class: 'stack' }, h('p', { class: 'muted' }, text), ok, h('button', { class: 'btn ghost block', onclick: () => s.close() }, 'Cancelar')), { focus: false });
}

const pad = (n) => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const parseDay = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
const fmtDay = (iso, long) => iso ? parseDay(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' }).replace(/\./g, '') : '';
function daysSince(iso) {
  const a = parseDay(iso);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((t - a) / 86400000);
}
function monthsary(iso) {
  const a = parseDay(iso);
  const t = new Date();
  if (t.getDate() !== a.getDate()) return null;
  const months = (t.getFullYear() - a.getFullYear()) * 12 + (t.getMonth() - a.getMonth());
  if (months <= 0) return null;
  if (months % 12 === 0) return months === 12 ? 'Hoje faz 1 ano. Feliz aniversário de namoro!' : `Hoje fazem ${months / 12} anos. Feliz aniversário de namoro!`;
  return months === 1 ? 'Hoje faz 1 mês juntos.' : `Hoje fazem ${months} meses juntos.`;
}
function ago(ts) {
  const s = (Date.now() - new Date(ts).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `há ${Math.floor(s / 86400)} d`;
  return new Date(ts).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace(/\./g, '');
}
const fmtTime = (ms) => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };

function avatar(p, size) {
  const cls = 'avatar' + (size ? ' ' + size : '');
  if (p?.avatar_url) return h('img', { class: cls, src: p.avatar_url, alt: '' });
  return h('div', { class: cls, 'aria-hidden': 'true' }, (p?.display_name || '?').trim().charAt(0).toUpperCase());
}
const person = (id) => (id === S.me?.profile?.id ? S.me.profile : S.me?.partner);
const nameOf = (id) => (id === S.me?.profile?.id ? 'Você' : (S.me?.partner?.display_name || 'Seu amor'));

function every(ms, fn) {
  const t = setInterval(() => { if (!document.hidden) fn(); }, ms);
  S.cleanups.push(() => clearInterval(t));
}

/* ───────────────────────── layout ───────────────────────── */

const TABS = [
  ['inicio', 'Início', 'home'],
  ['memorias', 'Memórias', 'photo'],
  ['nova', '', 'plus'],
  ['musica', 'Música', 'music'],
  ['perfil', 'Perfil', 'user'],
];

function shell(tab, top, ...content) {
  const nav = h('nav', { class: 'tabbar', 'aria-label': 'Navegação' },
    TABS.map(([id, label, ic]) => id === 'nova'
      ? h('a', { href: '#nova', class: 'plus', 'aria-label': 'Nova memória' }, icon(ic))
      : h('a', { href: '#' + id, 'aria-current': tab === id ? 'page' : null }, icon(ic), label)));
  return h('div', { class: 'shell' }, top, h('main', { class: 'page' }, content), nav);
}

function topbar({ title, back, right } = {}) {
  const left = back
    ? h('button', { class: 'back', onclick: () => (history.length > 1 ? history.back() : go(back)) }, icon('back', 'ic'), title || '')
    : title ? h('h1', { class: 'title' }, title) : h('span', { class: 'wordmark' }, 'nós');
  const backIcon = left.querySelector?.('.ic');
  if (backIcon) backIcon.style.cssText = 'width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round';
  return h('header', { class: 'topbar' }, left, h('div', { class: 'row', style: 'gap:6px' }, S.api?.demo ? h('span', { class: 'demo-pill' }, 'demonstração') : null, right));
}

function render(node) {
  $app.replaceChildren(node);
  window.scrollTo(0, 0);
}

const go = (path) => { location.hash = '#' + path; };

/* ───────────────────────── router ───────────────────────── */

async function route() {
  S.cleanups.forEach((f) => f());
  S.cleanups = [];
  S.onData = null;
  document.querySelectorAll('.sheet-wrap').forEach((x) => x.remove());

  const raw = location.hash.replace(/^#\/?/, '');
  const [path, arg] = raw.startsWith('memoria-') ? ['memoria', raw.slice(8)] : raw.split('/');
  const logged = !!S.api.uid;

  if (!logged) {
    if (path === 'entrar') return viewLogin();
    if (path === 'criar') return viewSignup();
    return viewWelcome();
  }
  if (!S.me?.profile) return viewBroken();
  if (!S.me.couple) return viewPair();

  switch (path) {
    case 'memorias': return viewMemories();
    case 'memoria': return viewMemory(arg);
    case 'nova': return viewNew();
    case 'musica': return viewMusic();
    case 'perfil': return viewProfile();
    default:
      if (path !== 'inicio') history.replaceState(null, '', '#inicio');
      return viewHome();
  }
}

async function refreshMe() {
  S.me = S.api.uid ? await S.api.me() : null;
}

function startRealtime() {
  S.unsub?.();
  S.unsub = null;
  if (!S.api.uid) return;
  let t;
  S.unsub = S.api.subscribe((table) => {
    clearTimeout(t);
    t = setTimeout(async () => {
      if (table === 'profiles' || table === 'couples') {
        const wasPaired = !!S.me?.couple;
        await refreshMe();
        if (!wasPaired && S.me?.couple) return showMatch();
        if (table === 'couples') return route();
      }
      S.onData?.(table);
    }, 250);
  });
}

/* ───────────────────────── entrada ───────────────────────── */

function viewWelcome() {
  render(h('div', { class: 'welcome' },
    knot('knot'),
    h('h1', null, 'nós'),
    h('p', { class: 'lead' }, 'Um cantinho só de vocês dois, com as memórias, as músicas e tudo o que é de vocês.'),
    h('div', { class: 'actions' },
      h('a', { class: 'btn block', href: '#criar' }, 'Criar conta'),
      h('a', { class: 'btn ghost block', href: '#entrar' }, 'Já tenho conta'),
    ),
  ));
}

function formError(form, msg) {
  let box = form.querySelector('.form-error');
  if (!msg) return box?.remove();
  if (!box) { box = h('div', { class: 'form-error', role: 'alert' }); form.prepend(box); }
  box.textContent = msg;
}

function viewSignup() {
  const name = h('input', { class: 'input', name: 'name', autocomplete: 'given-name', required: true, maxlength: 40 });
  const user = h('input', { class: 'input', name: 'username', autocapitalize: 'none', autocomplete: 'username', spellcheck: false, required: true, maxlength: 20 });
  const email = h('input', { class: 'input', type: 'email', name: 'email', autocomplete: 'email', required: true });
  const pass = h('input', { class: 'input', type: 'password', name: 'password', autocomplete: 'new-password', minlength: 6, required: true });
  const hint = h('small', null, 'Letras minúsculas, números, ponto ou _ (3 a 20).');
  let userOk = false;
  let t;
  user.addEventListener('input', () => {
    user.value = user.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    userOk = false;
    clearTimeout(t);
    const v = user.value;
    if (v.length < 3) { hint.className = ''; hint.textContent = 'Letras minúsculas, números, ponto ou _ (3 a 20).'; return; }
    hint.className = ''; hint.textContent = 'Verificando…';
    t = setTimeout(async () => {
      try {
        const ok = await S.api.usernameAvailable(v);
        if (user.value !== v) return;
        userOk = ok;
        hint.className = ok ? 'ok' : 'bad';
        hint.textContent = ok ? `@${v} está livre.` : `@${v} já está em uso.`;
      } catch { hint.textContent = ''; }
    }, 400);
  });
  const btn = h('button', { class: 'btn block', type: 'submit' }, 'Criar conta');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      formError(form, null);
      if (user.value.length < 3) return formError(form, 'Escolha um @ com pelo menos 3 caracteres.');
      if (!userOk && hint.className === 'bad') return formError(form, `@${user.value} já está em uso.`);
      btn.disabled = true; btn.textContent = 'Criando…';
      try {
        const r = await S.api.signUp({ email: email.value.trim(), password: pass.value, username: user.value, display_name: name.value.trim() });
        if (r.needsConfirm) {
          render(h('div', { class: 'auth' },
            knot('knot'),
            h('h1', null, 'Confirme seu e-mail'),
            h('p', { class: 'lead' }, `Mandamos um link para ${email.value.trim()}. Abra o link e depois volte aqui pra entrar.`),
            h('a', { class: 'btn block', href: '#entrar' }, 'Ir para o login')));
        }
      } catch (err) {
        formError(form, friendlyError(err));
        btn.disabled = false; btn.textContent = 'Criar conta';
      }
    },
  },
    h('label', { class: 'field' }, h('span', null, 'Seu nome'), name),
    h('label', { class: 'field' }, h('span', null, 'Seu @'), h('div', { class: 'input-at' }, user), hint),
    h('label', { class: 'field' }, h('span', null, 'E-mail'), email),
    h('label', { class: 'field' }, h('span', null, 'Senha'), pass, h('small', null, 'Pelo menos 6 caracteres.')),
    btn,
  );
  render(h('div', { class: 'auth' },
    h('a', { class: 'back btn ghost small', href: '#' }, 'Voltar'),
    h('h1', null, 'Criar sua conta'),
    h('p', { class: 'lead' }, 'Depois você encontra seu amor pelo @ e vocês dão match.'),
    form,
  ));
}

function viewLogin() {
  const email = h('input', { class: 'input', type: 'email', autocomplete: 'email', required: true });
  const pass = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const btn = h('button', { class: 'btn block', type: 'submit' }, 'Entrar');
  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      formError(form, null);
      btn.disabled = true; btn.textContent = 'Entrando…';
      try { await S.api.signIn({ email: email.value.trim(), password: pass.value }); }
      catch (err) { formError(form, friendlyError(err)); btn.disabled = false; btn.textContent = 'Entrar'; }
    },
  },
    h('label', { class: 'field' }, h('span', null, 'E-mail'), email),
    h('label', { class: 'field' }, h('span', null, 'Senha'), pass),
    btn,
    h('p', { class: 'muted small', style: 'text-align:center;margin-top:18px' }, 'Ainda não tem conta? ', h('a', { class: 'link', href: '#criar' }, 'Criar conta')),
  );
  render(h('div', { class: 'auth' },
    h('a', { class: 'back btn ghost small', href: '#' }, 'Voltar'),
    h('h1', null, 'Entrar'),
    h('p', { class: 'lead' }, 'Que bom te ver de novo.'),
    form,
  ));
}

function viewBroken() {
  render(h('div', { class: 'auth' },
    h('h1', null, 'Seu perfil não foi encontrado'),
    h('p', { class: 'lead' }, 'A conta existe, mas o perfil não foi criado. Isso costuma acontecer quando o banco ainda não foi configurado. Rode o arquivo schema.sql no Supabase e crie a conta de novo.'),
    h('button', { class: 'btn block', onclick: () => S.api.signOut() }, 'Sair'),
  ));
}

/* ───────────────────────── match ───────────────────────── */

function viewPair() {
  const me = S.me.profile;
  const results = h('div');
  const incomingBox = h('div');
  const outgoingBox = h('div');
  const q = h('input', { class: 'input', placeholder: 'usuario', autocapitalize: 'none', spellcheck: false, 'aria-label': 'Buscar pelo @' });
  let sentTo = new Set();

  const userRow = (p, action) => h('div', { class: 'user-row' }, avatar(p, 'md'), h('div', { class: 'grow' }, h('div', { class: 'name ellipsis' }, p.display_name), h('div', { class: 'at' }, '@' + p.username)), action);

  async function loadRequests() {
    const r = await S.api.requests().catch(() => ({ incoming: [], outgoing: [] }));
    sentTo = new Set(r.outgoing.map((x) => x.person.id));
    incomingBox.replaceChildren(...(r.incoming.length ? [
      h('div', { class: 'section-head' }, h('h2', null, 'Pedidos pra você')),
      h('div', { class: 'panel' }, r.incoming.map((x) => userRow(x.person, h('div', { class: 'row', style: 'gap:6px' },
        h('button', { class: 'btn small', onclick: async (e) => { e.target.disabled = true; try { await S.api.acceptRequest(x.id); await refreshMe(); showMatch(); } catch (err) { toast(friendlyError(err)); e.target.disabled = false; } } }, 'Aceitar'),
        h('button', { class: 'btn ghost small', onclick: async () => { await S.api.cancelRequest(x.id); loadRequests(); } }, 'Recusar'))))),
    ] : []));
    outgoingBox.replaceChildren(...(r.outgoing.length ? [
      h('div', { class: 'section-head' }, h('h2', null, 'Esperando resposta')),
      h('div', { class: 'panel' }, r.outgoing.map((x) => userRow(x.person,
        h('button', { class: 'btn ghost small', onclick: async () => { await S.api.cancelRequest(x.id); loadRequests(); } }, 'Cancelar')))),
    ] : []));
  }

  let t;
  async function search() {
    const v = q.value.toLowerCase().replace(/[^a-z0-9._]/g, '');
    q.value = v;
    if (v.length < 2) return results.replaceChildren();
    const list = await S.api.searchUsers(v).catch(() => []);
    if (q.value !== v) return;
    results.replaceChildren(list.length
      ? h('div', { class: 'panel', style: 'margin-top:10px' }, list.map((p) => {
        const taken = !!p.couple_id;
        const sent = sentTo.has(p.id);
        const b = h('button', {
          class: 'btn small' + (sent || taken ? ' ghost' : ''),
          disabled: sent || taken,
          onclick: async () => {
            b.disabled = true;
            try {
              const r = await S.api.sendRequest(p.id);
              if (r.matched) { await refreshMe(); return showMatch(); }
              b.textContent = 'Pedido enviado'; b.classList.add('ghost');
              toast(`Pedido enviado para @${p.username}`);
              loadRequests();
            } catch (err) { toast(friendlyError(err)); b.disabled = false; }
          },
        }, taken ? 'Já tem par' : sent ? 'Pedido enviado' : 'Enviar pedido');
        return userRow(p, b);
      }))
      : h('p', { class: 'muted small', style: 'margin-top:10px' }, `Ninguém com @${v} por aqui ainda.`));
  }
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(search, 300); });

  render(h('div', { class: 'shell', style: 'padding-bottom:24px' },
    topbar({ right: h('button', { class: 'btn ghost small', onclick: () => S.api.signOut() }, 'Sair') }),
    h('main', { class: 'page' },
      h('div', { style: 'padding:24px 0 8px' },
        knot('knot'),
        h('h1', { style: 'font-size:34px;margin-top:14px' }, 'Encontre seu amor'),
        h('p', { class: 'muted', style: 'margin-top:8px' }, 'Procure o @ da pessoa e mande um pedido. Quando ela aceitar, vocês dão match e o app abre pros dois.'),
      ),
      h('div', { class: 'panel', style: 'margin-top:16px' },
        h('p', { class: 'small muted' }, 'Seu @ é'),
        h('p', { style: 'font-family:var(--serif);font-size:24px' }, '@' + me.username),
        h('p', { class: 'small muted', style: 'margin-top:4px' }, 'Se for mais fácil, passe ele pra ela te procurar.'),
      ),
      h('div', { class: 'section' },
        h('label', { class: 'field', style: 'margin:0' }, h('span', null, 'Buscar pelo @'), h('div', { class: 'input-at' }, q)),
        results,
      ),
      h('div', { class: 'section' }, incomingBox),
      h('div', { class: 'section' }, outgoingBox),
    ),
  ));
  const knotEl = $app.querySelector('.knot');
  if (knotEl) knotEl.style.cssText = 'width:84px;height:56px';
  loadRequests();
  every(6000, async () => {
    loadRequests();
    const before = !!S.me?.couple;
    await refreshMe();
    if (!before && S.me?.couple) showMatch();
  });
  S.onData = () => loadRequests();
}

function showMatch() {
  if (S.matchShown) return;
  S.matchShown = true;
  const { profile, partner } = S.me;
  const el = h('div', { class: 'match', role: 'dialog', 'aria-label': 'Deu match' },
    h('div', null,
      h('div', { class: 'faces' }, h('div', { class: 'l' }, avatar(profile)), h('div', { class: 'r' }, avatar(partner))),
      h('h1', null, 'Deu match!'),
      h('p', null, `Agora é você e ${partner?.display_name || 'seu amor'}. Esse cantinho é de vocês.`),
      h('button', { class: 'btn block', onclick: () => { el.remove(); go('inicio'); route(); } }, 'Entrar no nosso app'),
    ));
  document.body.append(el);
}

/* ───────────────────────── início ───────────────────────── */

function partnerNowCompact(now) {
  const partner = S.me.partner;
  if (!now || now.status === 'not_connected' || now.status === 'no_partner') {
    return h('a', { class: 'panel row', href: '#musica', style: 'text-decoration:none' }, icon('music', ''), h('p', { class: 'muted small grow' }, `${partner.display_name} ainda não conectou o Spotify.`));
  }
  if (now.status !== 'ok') {
    return h('a', { class: 'panel row', href: '#musica', style: 'text-decoration:none' }, avatar(partner, 'sm'), h('p', { class: 'muted small grow' }, now.status === 'idle' ? `${partner.display_name} não está ouvindo nada agora.` : 'Não deu pra ver a música agora.'));
  }
  return h('a', { class: 'panel row', href: '#musica', style: 'text-decoration:none' },
    now.track.image ? h('img', { src: now.track.image, alt: '', style: 'width:56px;height:56px;border-radius:6px;object-fit:cover' }) : null,
    h('div', { class: 'grow' },
      h('div', { class: 'small muted row', style: 'gap:6px' }, now.is_playing ? h('span', { class: 'eq' }, h('i'), h('i'), h('i')) : null, `${partner.display_name} ${now.is_playing ? 'está ouvindo' : 'pausou'}`),
      h('div', { class: 'ellipsis', style: 'font-weight:700' }, now.track.name),
      h('div', { class: 'ellipsis small muted' }, now.track.artists),
    ));
}

function sinceSheet() {
  const input = h('input', { class: 'input', type: 'date', value: S.me.couple.since || '', max: todayIso() });
  let s;
  const save = h('button', {
    class: 'btn block',
    onclick: async () => {
      save.disabled = true;
      try { await S.api.setSince(input.value || null); await refreshMe(); s.close(); route(); toast('Data salva'); }
      catch (e) { toast(friendlyError(e)); save.disabled = false; }
    },
  }, 'Salvar data');
  s = sheet('Quando vocês começaram?', h('div', null, h('label', { class: 'field' }, h('span', null, 'Data'), input), save));
}

async function viewHome() {
  const { profile, partner, couple } = S.me;
  const pair = h('div', { class: 'pair' }, avatar(profile), knot(), avatar(partner));
  const hero = h('section', { class: 'together' },
    pair,
    h('p', { class: 'names' }, `${profile.display_name} e ${partner.display_name}`),
    couple.since
      ? [
        h('p', { class: 'since-label' }, 'juntos há'),
        h('p', { class: 'days' }, daysSince(couple.since).toLocaleString('pt-BR'), h('span', null, daysSince(couple.since) === 1 ? 'dia' : 'dias')),
        h('p', { class: 'since' }, 'desde ', h('button', { class: 'link', style: 'color:inherit;font-weight:400', onclick: sinceSheet }, fmtDay(couple.since, true))),
        monthsary(couple.since) ? h('p', { style: 'margin-top:12px;font-weight:700;color:var(--cherry)' }, monthsary(couple.since)) : null,
      ]
      : h('div', { style: 'margin-top:10px' }, h('p', { class: 'muted' }, 'Quando foi que tudo começou?'), h('button', { class: 'btn soft', style: 'margin-top:12px', onclick: sinceSheet }, 'Escolher a data')),
  );
  const nowBox = h('div', null, h('div', { class: 'spinner' }));
  const memBox = h('div', null, h('div', { class: 'spinner' }));
  const dedBox = h('div');

  render(shell('inicio', topbar(), hero,
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Ouvindo agora')), nowBox),
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Última memória'), h('a', { href: '#memorias' }, 'Ver todas')), memBox),
    dedBox,
  ));
  const pairSvg = pair.querySelector('svg');
  if (pairSvg) pairSvg.setAttribute('viewBox', '0 0 120 80');

  async function loadNow() {
    const now = await S.api.spotify.now('partner').catch(() => null);
    nowBox.replaceChildren(partnerNowCompact(now));
  }
  async function loadRest() {
    const [mems, deds] = await Promise.all([S.api.memories().catch(() => []), S.api.dedications().catch(() => [])]);
    const m = mems[0];
    if (!m) {
      memBox.replaceChildren(h('div', { class: 'panel empty' }, h('h3', null, 'Nenhuma memória ainda'), h('p', null, 'Guarde a primeira foto, vídeo ou áudio de vocês.'), h('a', { class: 'btn', href: '#nova' }, 'Criar memória')));
    } else {
      const urls = await mediaFor([m]);
      memBox.replaceChildren(h('a', { class: 'mini-memory', href: '#memoria-' + m.id },
        h('div', { class: 'polaroid' }, h('div', { class: 'shot' }, shotFor(m, urls, true)), h('div', { class: 'caption' }, m.title || fmtDay(m.happened_on))),
        h('div', { class: 'grow' },
          h('p', { style: 'font-weight:700' }, m.title || 'Sem título'),
          h('p', { class: 'small muted' }, `${nameOf(m.author)}, ${fmtDay(m.happened_on)}`),
          m.note ? h('p', { class: 'small', style: 'margin-top:6px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden' }, m.note) : null,
        )));
    }
    const d = deds.find((x) => x.from_user !== profile.id) || deds[0];
    dedBox.replaceChildren(...(d ? [h('section', { class: 'section' },
      h('div', { class: 'section-head' }, h('h2', null, 'Música dedicada'), h('a', { href: '#musica' }, 'Ver todas')),
      dedicationCard(d))] : []));
  }
  loadNow();
  loadRest();
  every(20000, loadNow);
  S.onData = (t) => { if (['memories', 'dedications', 'memory_hearts'].includes(t)) loadRest(); };
  maybeInstallTip();
}

/* ───────────────────────── memórias ───────────────────────── */

async function mediaFor(mems, all) {
  const paths = mems.flatMap((m) => (all ? m.media : m.media.slice(0, 1))).filter((x) => x.kind !== 'audio' || all).map((x) => x.path);
  return paths.length ? S.api.mediaUrls(paths).catch(() => ({})) : {};
}

function waveform(n = 18, seed = 7) {
  const bars = [];
  let x = seed;
  for (let i = 0; i < n; i++) { x = (x * 9301 + 49297) % 233280; bars.push(h('i', { style: `height:${25 + (x / 233280) * 75}%` })); }
  return h('div', { class: 'wave' }, bars);
}

function shotFor(m, urls, mini) {
  const first = m.media[0];
  if (!first) return h('div', { class: 'text-shot', style: mini ? 'font-size:14px;padding:8px' : '' }, (m.note || m.title || '♥').slice(0, mini ? 40 : 140));
  if (first.kind === 'audio') return h('div', { class: 'audio-shot' }, waveform(mini ? 7 : 18, m.id.length * 31));
  const url = urls[first.path];
  if (!url) return null;
  if (first.kind === 'video') return h('video', { src: url + '#t=0.1', muted: true, playsInline: true, preload: 'metadata', 'aria-label': 'Vídeo' });
  return h('img', { src: url, alt: m.title || 'Foto', loading: 'lazy', decoding: 'async' });
}

function badgesFor(m) {
  const b = [];
  if (m.media.length > 1) b.push(h('span', null, `1/${m.media.length}`));
  if (m.media.some((x) => x.kind === 'video')) b.push(h('span', null, 'vídeo'));
  if (m.media.some((x) => x.kind === 'audio')) b.push(h('span', null, 'áudio'));
  return b.length ? h('div', { class: 'badge' }, b) : null;
}

function memoryCard(m, urls) {
  const mine = m.hearts.includes(S.me.profile.id);
  return h('a', { class: 'memory', href: '#memoria-' + m.id },
    h('div', { class: 'polaroid' },
      h('div', { class: 'shot' }, shotFor(m, urls), badgesFor(m)),
      h('div', { class: 'caption' }, m.title || fmtDay(m.happened_on, true)),
    ),
    h('div', { class: 'memory-meta' },
      avatar(person(m.author), 'sm'),
      h('span', { class: 'who ellipsis' }, `${nameOf(m.author)}, ${fmtDay(m.happened_on)}`),
      h('span', { class: 'stat' + (mine ? ' on' : '') }, icon('heart'), m.hearts.length),
      h('span', { class: 'stat' }, icon('chat'), m.comments_count),
    ));
}

async function viewMemories() {
  const feed = h('div', { class: 'feed' }, h('div', { class: 'spinner' }));
  render(shell('memorias', topbar({ title: 'Memórias', right: h('a', { class: 'icon-btn', href: '#nova', 'aria-label': 'Nova memória' }, icon('plus')) }), feed));
  async function load() {
    const mems = await S.api.memories().catch((e) => { toast(friendlyError(e)); return []; });
    if (!mems.length) {
      feed.replaceChildren(h('div', { class: 'empty' }, knot('knot'), h('h3', null, 'O álbum de vocês começa aqui'), h('p', null, 'Fotos, vídeos e áudios de momentos que vocês não querem esquecer.'), h('a', { class: 'btn', href: '#nova' }, 'Criar a primeira memória')));
      const k = feed.querySelector('.knot'); if (k) k.style.cssText = 'width:84px;height:56px;margin:0 auto 14px';
      return;
    }
    const urls = await mediaFor(mems);
    feed.replaceChildren(...mems.map((m) => memoryCard(m, urls)));
  }
  load();
  S.onData = (t) => { if (['memories', 'memory_hearts', 'memory_comments'].includes(t)) load(); };
}

async function viewMemory(id) {
  const body = h('div', { class: 'detail' }, h('div', { class: 'spinner' }));
  const del = h('button', { class: 'icon-btn', 'aria-label': 'Apagar memória' }, icon('trash'));
  render(shell('memorias', topbar({ back: 'memorias', title: 'Memórias', right: del }), body));

  let m;
  async function load(keepScroll) {
    m = await S.api.memory(id).catch(() => null);
    if (!m) { body.replaceChildren(h('div', { class: 'empty' }, h('h3', null, 'Memória não encontrada'), h('p', null, 'Ela pode ter sido apagada.'), h('a', { class: 'btn', href: '#memorias' }, 'Voltar para Memórias'))); del.remove(); return; }
    const urls = await mediaFor([m], true);
    const me = S.me.profile.id;
    const slides = m.media.map((x) => {
      const u = urls[x.path];
      if (x.kind === 'image') return h('div', null, h('img', { src: u, alt: m.title || 'Foto' }));
      if (x.kind === 'video') return h('div', null, h('video', { src: u, controls: true, playsInline: true, preload: 'metadata' }));
      return h('div', { class: 'audio-slide' }, h('div', { style: 'width:100%' }, h('div', { style: 'height:120px;display:flex;justify-content:center;margin-bottom:18px' }, waveform(18, 5)), h('audio', { src: u, controls: true, preload: 'metadata' })));
    });
    const carousel = slides.length ? h('div', { class: 'carousel' }, slides) : h('div', { class: 'shot' }, shotFor(m, urls));
    const dots = slides.length > 1 ? h('div', { class: 'dots' }, slides.map((_, i) => h('i', { class: i === 0 ? 'on' : '' }))) : null;
    if (dots) carousel.addEventListener('scroll', () => {
      const i = Math.round(carousel.scrollLeft / carousel.clientWidth);
      [...dots.children].forEach((d, j) => d.classList.toggle('on', i === j));
    }, { passive: true });

    const hearted = m.hearts.includes(me);
    const heart = h('button', { class: 'heart-btn' + (hearted ? ' on' : ''), 'aria-pressed': String(hearted), 'aria-label': 'Curtir' }, icon('heart'), h('span', null, m.hearts.length));
    const toggleHeart = async (force) => {
      const on = force ?? !heart.classList.contains('on');
      if (on === heart.classList.contains('on')) { if (on) { heart.classList.remove('pop'); void heart.offsetWidth; heart.classList.add('pop'); } return; }
      heart.classList.toggle('on', on);
      heart.setAttribute('aria-pressed', String(on));
      heart.classList.remove('pop'); void heart.offsetWidth; if (on) heart.classList.add('pop');
      const span = heart.querySelector('span');
      span.textContent = Number(span.textContent) + (on ? 1 : -1);
      try { await S.api.setHeart(m.id, on); } catch (e) { toast(friendlyError(e)); }
    };
    heart.addEventListener('click', () => toggleHeart());
    // toque duplo na foto também curte, igual no Instagram
    let lastTap = 0;
    carousel.addEventListener('click', (e) => {
      if (e.target.closest('video, audio')) return;
      const now = Date.now();
      if (now - lastTap < 320) toggleHeart(true);
      lastTap = now;
    });

    const comments = h('div', { class: 'comments' },
      m.comments.map((c) => h('div', { class: 'comment' + (c.author === me ? ' mine' : '') },
        avatar(person(c.author), 'sm'),
        h('div', null, h('div', { class: 'body' }, c.body), h('div', { class: 'when', style: c.author === me ? 'text-align:right' : '' }, ago(c.created_at))))));
    const input = h('input', { class: 'input', placeholder: 'Escreva um comentário', maxlength: 500, 'aria-label': 'Comentário' });
    const send = h('button', { class: 'btn small', type: 'submit', style: 'min-height:44px;border-radius:22px' }, 'Enviar');
    const composer = h('form', {
      class: 'composer',
      onsubmit: async (e) => {
        e.preventDefault();
        const v = input.value.trim();
        if (!v) return;
        send.disabled = true;
        try { await S.api.addComment(m.id, v); input.value = ''; await load(true); }
        catch (err) { toast(friendlyError(err)); }
        send.disabled = false;
      },
    }, input, send);

    body.replaceChildren(
      h('div', { class: 'polaroid' }, carousel, h('div', { class: 'caption' }, m.title || fmtDay(m.happened_on, true))),
      dots,
      h('div', { class: 'detail-meta' },
        h('span', { class: 'row', style: 'gap:6px' }, avatar(person(m.author), 'sm'), nameOf(m.author)),
        h('span', null, fmtDay(m.happened_on, true)),
        m.place ? h('span', null, m.place) : null),
      m.note ? h('p', { class: 'detail-note' }, m.note) : null,
      h('div', { class: 'actions-row' }, heart, h('span', { class: 'muted small', style: 'margin-left:6px' }, hearted ? '' : 'toque duas vezes na foto pra curtir')),
      comments,
      composer,
    );
    if (keepScroll) composer.scrollIntoView({ block: 'end' });
  }
  del.addEventListener('click', () => confirmSheet('Apagar memória?', 'As fotos, vídeos e áudios dela também serão apagados, pros dois.', 'Apagar', async () => {
    await S.api.deleteMemory(id);
    toast('Memória apagada');
    go('memorias');
  }));
  await load();
  S.onData = (t) => { if (['memory_comments', 'memory_hearts', 'memories'].includes(t)) load(); };
}

/* ───────────────────────── nova memória ───────────────────────── */

const MAX_BYTES = 50 * 1024 * 1024;

function compressImage(file, maxSide = 2048, quality = 0.86) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const hgt = Math.round(img.naturalHeight * scale);
      const c = document.createElement('canvas');
      c.width = w; c.height = hgt;
      c.getContext('2d').drawImage(img, 0, 0, w, hgt);
      c.toBlob((b) => resolve(b && b.size < file.size * 1.2 ? b : null), 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

const extFromMime = (mime, fallback) => ({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
  'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac',
}[mime.split(';')[0]] || fallback);

function pickAudioMime() {
  if (!window.MediaRecorder) return null;
  for (const m of ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm']) {
    if (MediaRecorder.isTypeSupported?.(m)) return m;
  }
  return '';
}

function viewNew() {
  const items = []; // { blob, kind, ext, mime, preview }
  const picker = h('div', { class: 'picker' });
  const fileInput = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, class: 'sr-only', 'aria-label': 'Escolher fotos e vídeos' });
  const title = h('input', { class: 'input', maxlength: 60, placeholder: 'ex.: nosso primeiro pôr do sol' });
  const note = h('textarea', { class: 'input', maxlength: 2000, placeholder: 'Conta o que aconteceu, o que vocês sentiram…' });
  const date = h('input', { class: 'input', type: 'date', value: todayIso(), max: todayIso() });
  const place = h('input', { class: 'input', maxlength: 80, placeholder: 'ex.: Praia do Forte' });
  const recBox = h('div');
  const progress = h('div', { class: 'hidden' }, h('div', { class: 'progress' }, h('i')), h('p', { class: 'small muted' }));
  const save = h('button', { class: 'btn block', type: 'submit' }, 'Salvar memória');

  function drawPicker() {
    picker.replaceChildren(...items.map((it, i) => h('div', { class: 'thumb' },
      it.kind === 'image' ? h('img', { src: it.preview, alt: '' })
        : it.kind === 'video' ? h('video', { src: it.preview + '#t=0.1', muted: true, playsInline: true, preload: 'metadata' })
          : h('div', { class: 'audio-thumb' }, icon('mic')),
      it.kind !== 'image' ? h('span', { class: 'kind' }, it.kind === 'video' ? 'vídeo' : 'áudio') : null,
      h('button', { class: 'rm', type: 'button', 'aria-label': 'Remover', onclick: () => { URL.revokeObjectURL(it.preview); items.splice(i, 1); drawPicker(); } }, '×'))));
    picker.classList.toggle('hidden', !items.length);
  }

  fileInput.addEventListener('change', async () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    for (const f of files) {
      if (items.length >= 10) { toast('Até 10 arquivos por memória.'); break; }
      const isVideo = f.type.startsWith('video/') || /\.(mov|mp4|webm|m4v)$/i.test(f.name);
      if (isVideo) {
        if (f.size > MAX_BYTES) { toast(`Vídeo grande demais (${Math.round(f.size / 1048576)} MB). O máximo é 50 MB.`, 4000); continue; }
        const mime = f.type || 'video/mp4';
        items.push({ blob: f, kind: 'video', mime, ext: extFromMime(mime, 'mp4'), preview: URL.createObjectURL(f) });
      } else {
        const small = await compressImage(f);
        const blob = small || f;
        const mime = small ? 'image/jpeg' : (f.type || 'image/jpeg');
        if (blob.size > MAX_BYTES) { toast('Imagem grande demais.'); continue; }
        items.push({ blob, kind: 'image', mime, ext: extFromMime(mime, 'jpg'), preview: URL.createObjectURL(blob) });
      }
      drawPicker();
    }
  });

  let recorder = null;
  async function startRec() {
    const mime = pickAudioMime();
    if (mime === null || !navigator.mediaDevices?.getUserMedia) return toast('Este navegador não grava áudio.');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { return toast('Permita o uso do microfone pra gravar.', 3500); }
    const chunks = [];
    recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const type = (recorder.mimeType || mime || 'audio/mp4').split(';')[0];
      const blob = new Blob(chunks, { type });
      recBox.replaceChildren();
      recorder = null;
      if (blob.size < 500) return;
      items.push({ blob, kind: 'audio', mime: type, ext: extFromMime(type, 'm4a'), preview: URL.createObjectURL(blob) });
      drawPicker();
      toast('Áudio adicionado');
    };
    recorder.start(1000);
    const started = Date.now();
    const time = h('span', { class: 'time' }, '0:00');
    const tick = setInterval(() => {
      const s = Date.now() - started;
      time.textContent = fmtTime(s);
      if (s > 5 * 60 * 1000) stop();
    }, 250);
    const stop = () => { clearInterval(tick); if (recorder?.state === 'recording') recorder.stop(); };
    S.cleanups.push(stop);
    recBox.replaceChildren(h('div', { class: 'recorder' }, h('span', { class: 'dot' }), time, h('button', { class: 'btn small', type: 'button', onclick: stop }, 'Parar')));
  }

  const form = h('form', {
    onsubmit: async (e) => {
      e.preventDefault();
      if (recorder) return toast('Pare a gravação antes de salvar.');
      if (!items.length && !title.value.trim() && !note.value.trim()) return toast('Adicione uma foto, um áudio ou escreva algo.');
      save.disabled = true;
      progress.classList.remove('hidden');
      const bar = progress.querySelector('i');
      const label = progress.querySelector('p');
      try {
        const id = await S.api.createMemory({
          title: title.value.trim(),
          note: note.value.trim(),
          place: place.value.trim(),
          happened_on: date.value || todayIso(),
          items,
        }, (i, n) => {
          bar.style.width = (n ? Math.round((i / n) * 100) : 100) + '%';
          label.textContent = i < n ? `Enviando ${i + 1} de ${n}…` : 'Salvando…';
        });
        items.forEach((it) => URL.revokeObjectURL(it.preview));
        toast('Memória salva');
        location.replace('#memoria-' + id);
      } catch (err) {
        toast(friendlyError(err), 4000);
        save.disabled = false;
        progress.classList.add('hidden');
      }
    },
  },
    picker,
    h('div', { class: 'add-media' },
      h('button', { class: 'btn soft', type: 'button', onclick: () => fileInput.click() }, icon('photo'), 'Fotos e vídeos'),
      h('button', { class: 'btn soft', type: 'button', onclick: () => (recorder ? null : startRec()) }, icon('mic'), 'Gravar áudio'),
    ),
    fileInput,
    recBox,
    h('label', { class: 'field' }, h('span', null, 'Título'), title),
    h('label', { class: 'field' }, h('span', null, 'O que aconteceu'), note),
    h('div', { class: 'row', style: 'align-items:flex-start' },
      h('label', { class: 'field grow' }, h('span', null, 'Quando'), date),
      h('label', { class: 'field grow' }, h('span', null, 'Onde'), place)),
    progress,
    save,
  );
  drawPicker();
  render(shell('nova', topbar({ back: 'memorias', title: 'Nova memória' }), form));
}

/* ───────────────────────── música ───────────────────────── */

function openTrack(id, url) {
  const link = url && url !== '#' ? url : trackLink(id);
  if (S.api.demo) return toast('No app de verdade, isso abre a música no Spotify.');
  window.open(link, '_blank', 'noopener');
}

async function playOrOpen(id, positionMs, url) {
  const r = await playTrack(S.api, id, positionMs);
  if (r.ok) return toast('Tocando no seu Spotify');
  if (r.reason === 'demo') return toast('No app de verdade, isso toca no seu Spotify.');
  if (r.reason === 'no_device') toast('Abra o Spotify no celular primeiro. Abrindo a música…', 3500);
  else if (r.reason === 'premium') toast('Tocar direto precisa de Spotify Premium. Abrindo a música…', 3500);
  else if (r.reason === 'not_connected') return toast('Conecte seu Spotify no app primeiro.');
  setTimeout(() => openTrack(id, url), r.reason === 'error' ? 0 : 900);
}

function dedicationCard(d) {
  const fromMe = d.from_user === S.me.profile.id;
  return h('button', { class: 'dedication', onclick: () => playOrOpen(d.track_id, 0) },
    d.image_url ? h('img', { src: d.image_url, alt: '' }) : h('div', { class: 'avatar', style: 'width:64px;height:64px;border-radius:6px' }, '♪'),
    h('div', { class: 'grow' },
      h('div', { class: 't ellipsis' }, d.track_name),
      h('div', { class: 'a ellipsis' }, d.artists),
      d.message ? h('div', { class: 'msg' }, d.message) : null,
      h('div', { class: 'from' }, `${fromMe ? 'Você dedicou' : (S.me.partner.display_name + ' dedicou pra você')}, ${ago(d.created_at)}`),
    ));
}

function dedicateSheet(onDone) {
  const q = h('input', { class: 'input', type: 'search', placeholder: 'Buscar música ou artista', autocomplete: 'off' });
  const list = h('div', { style: 'margin:10px -8px 0' });
  const msg = h('textarea', { class: 'input', maxlength: 300, placeholder: 'Um recado (opcional)', style: 'min-height:80px' });
  const go2 = h('button', { class: 'btn block', disabled: true }, `Dedicar pra ${S.me.partner.display_name}`);
  const chosen = h('div', { class: 'hidden', style: 'margin-top:14px' });
  let selected = null;
  let t;
  const runSearch = async () => {
    const v = q.value.trim();
    if (!v && !S.api.demo) return list.replaceChildren();
    list.replaceChildren(h('div', { class: 'spinner', style: 'margin:16px auto' }));
    try {
      const tracks = await searchTracks(S.api, v);
      if (q.value.trim() !== v) return;
      list.replaceChildren(...(tracks.length ? tracks.map((tr) => h('button', {
        class: 'track-row' + (selected?.id === tr.id ? ' sel' : ''),
        type: 'button',
        onclick: () => {
          selected = tr;
          [...list.children].forEach((c) => c.classList.remove('sel'));
          list.querySelectorAll('.track-row').forEach((c) => c.dataset.id === tr.id && c.classList.add('sel'));
          go2.disabled = false;
          chosen.classList.remove('hidden');
          chosen.replaceChildren(h('label', { class: 'field', style: 'margin:0 0 12px' }, h('span', null, `Recado junto com "${tr.name}"`), msg));
        },
        'data-id': tr.id,
      }, tr.image ? h('img', { src: tr.image, alt: '' }) : h('div', { class: 'avatar' }, '♪'), h('div', { class: 'grow' }, h('div', { class: 'ellipsis', style: 'font-weight:700' }, tr.name), h('div', { class: 'ellipsis small muted' }, tr.artists))))
        : [h('p', { class: 'muted small', style: 'padding:8px' }, 'Nada encontrado.')]));
    } catch (e) {
      list.replaceChildren(h('p', { class: 'muted small', style: 'padding:8px' }, friendlyError(e)));
    }
  };
  q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(runSearch, 400); });
  let s;
  go2.addEventListener('click', async () => {
    if (!selected) return;
    go2.disabled = true;
    try {
      await S.api.createDedication(selected, msg.value.trim());
      s.close();
      toast('Música dedicada');
      onDone?.();
    } catch (e) { toast(friendlyError(e)); go2.disabled = false; }
  });
  s = sheet('Dedicar uma música', h('div', null, q, list, chosen, h('div', { style: 'margin-top:14px' }, go2)));
  if (S.api.demo) runSearch();
}

async function viewMusic() {
  const partner = S.me.partner;
  const nowBox = h('div', null, h('div', { class: 'spinner' }));
  const connectBox = h('div');
  const dedList = h('div', { class: 'stack' });
  let status = { me: false, partner: false };
  const dedicateBtn = h('button', { class: 'btn block', style: 'margin-top:20px', onclick: () => {
    if (!status.me && !S.api.demo) return toast('Conecte seu Spotify pra buscar músicas.');
    dedicateSheet(loadDeds);
  } }, icon('music'), 'Dedicar uma música');

  render(shell('musica', topbar({ title: 'Música' }),
    connectBox,
    h('section', { class: 'section', style: 'margin-top:12px' }, h('div', { class: 'section-head' }, h('h2', null, 'Agora')), nowBox),
    dedicateBtn,
    h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', null, 'Músicas dedicadas')), dedList),
  ));

  let tick = null;
  async function loadNow() {
    status = await S.api.spotify.status().catch(() => status);
    connectBox.replaceChildren(...(!status.me ? [h('div', { class: 'panel', style: 'margin-top:8px' },
      h('p', { style: 'font-weight:700' }, 'Conecte seu Spotify'),
      h('p', { class: 'small muted', style: 'margin:4px 0 12px' }, `Assim ${partner.display_name} vê o que você está ouvindo e vocês podem dedicar músicas um pro outro.`),
      spotifyConfigured() || S.api.demo
        ? h('button', { class: 'btn spotify block', onclick: async (e) => { e.target.disabled = true; try { const r = await startSpotifyLogin(S.api); if (r === 'demo') { toast('Spotify conectado'); loadNow(); } } catch (err) { toast(friendlyError(err)); e.target.disabled = false; } } }, 'Conectar Spotify')
        : h('p', { class: 'small', style: 'color:var(--cherry)' }, 'Falta colocar o Client ID do Spotify no config.js (veja o guia).'),
    )] : []));

    const [pn, mn] = await Promise.all([
      S.api.spotify.now('partner').catch(() => null),
      status.me ? S.api.spotify.now('me').catch(() => null) : null,
    ]);
    clearInterval(tick);
    const blocks = [];
    if (!pn || pn.status === 'not_connected' || pn.status === 'no_partner') {
      blocks.push(h('div', { class: 'panel' }, h('p', { class: 'muted' }, `${partner.display_name} ainda não conectou o Spotify. Quando conectar, a música dela aparece aqui.`)));
    } else if (pn.status !== 'ok') {
      blocks.push(h('div', { class: 'panel row' }, avatar(partner, 'md'), h('p', { class: 'muted grow' }, pn.status === 'idle' ? `${partner.display_name} não está ouvindo nada agora.` : 'Não deu pra ver a música agora. Tente de novo em instantes.')));
    } else {
      const tr = pn.track;
      const fetchedAt = Date.now();
      const bar = h('i');
      const timeL = h('span', null, fmtTime(pn.progress_ms));
      const update = () => {
        const p = Math.min(tr.duration_ms, pn.progress_ms + (pn.is_playing ? Date.now() - fetchedAt : 0));
        bar.style.width = (tr.duration_ms ? (p / tr.duration_ms) * 100 : 0) + '%';
        timeL.textContent = fmtTime(p);
        return p;
      };
      update();
      if (pn.is_playing) tick = setInterval(update, 1000);
      S.cleanups.push(() => clearInterval(tick));
      blocks.push(h('div', { class: 'panel' },
        h('div', { class: 'now' },
          h('div', { class: 'sleeve' + (pn.is_playing ? ' playing' : '') }, h('div', { class: 'record' }), tr.image ? h('img', { class: 'cover', src: tr.image, alt: '' }) : h('div', { class: 'cover' })),
          h('div', { class: 'info' },
            h('div', { class: 'who-listens' }, pn.is_playing ? h('span', { class: 'eq' }, h('i'), h('i'), h('i')) : null, `${partner.display_name} ${pn.is_playing ? 'está ouvindo' : 'pausou'}`),
            h('div', { class: 'track' }, tr.name),
            h('div', { class: 'artist' }, tr.artists),
          )),
        h('div', { class: 'bar' }, bar),
        h('div', { class: 'row small muted', style: 'justify-content:space-between;margin-top:4px' }, timeL, h('span', null, fmtTime(tr.duration_ms || 0))),
        h('div', { class: 'now-actions' },
          tr.id && pn.is_playing ? h('button', { class: 'btn small', onclick: () => playOrOpen(tr.id, update() + 1500, tr.url) }, icon('play'), 'Ouvir junto') : null,
          tr.id ? h('button', { class: 'btn ghost small', onclick: () => openTrack(tr.id, tr.url) }, 'Abrir no Spotify') : null,
        ),
      ));
    }
    if (status.me) {
      blocks.push(mn?.status === 'ok'
        ? h('div', { class: 'me-now' }, mn.track.image ? h('img', { src: mn.track.image, alt: '' }) : null, h('div', { class: 'grow' }, h('div', { class: 'muted' }, 'Você está ouvindo'), h('div', { class: 'ellipsis', style: 'font-weight:700' }, `${mn.track.name}, ${mn.track.artists}`)))
        : h('div', { class: 'me-now muted' }, 'Você não está ouvindo nada agora.'));
    }
    nowBox.replaceChildren(...blocks);
  }

  async function loadDeds() {
    const deds = await S.api.dedications().catch(() => []);
    dedList.replaceChildren(...(deds.length ? deds.map(dedicationCard) : [h('div', { class: 'panel empty' }, h('h3', null, 'Nenhuma música dedicada ainda'), h('p', null, `Escolha uma música que lembre ${partner.display_name} e escreva um recado.`))]));
  }

  loadNow();
  loadDeds();
  every(20000, loadNow);
  S.onData = (t) => { if (t === 'dedications') loadDeds(); };
}

/* ───────────────────────── perfil ───────────────────────── */

function installSheet() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  sheet('Instalar no celular', h('div', { class: 'stack' },
    h('p', { style: 'font-weight:700' }, 'No iPhone (Safari)'),
    h('ol', { class: 'muted small', style: 'padding-left:20px;margin:0' },
      h('li', null, 'Abra o link do app no Safari.'),
      h('li', null, 'Toque no botão de compartilhar (o quadrado com a seta pra cima).'),
      h('li', null, 'Escolha "Adicionar à Tela de Início" e confirme.')),
    h('p', { style: 'font-weight:700;margin-top:18px' }, 'No Android (Chrome)'),
    h('ol', { class: 'muted small', style: 'padding-left:20px;margin:0' },
      h('li', null, 'Abra o link do app no Chrome.'),
      h('li', null, 'Toque nos três pontinhos e em "Instalar app" ou "Adicionar à tela inicial".')),
    ios ? null : null,
  ), { focus: false });
}

function maybeInstallTip() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  let seen = false;
  try { seen = localStorage.getItem('nos.installTip') === '1'; } catch { /* sem storage */ }
  if (!ios || standalone || seen || S.api.demo) return;
  const tip = h('div', { class: 'install-tip', role: 'note' },
    h('div', { class: 'grow' }, h('b', null, 'Coloque o nós na tela de início'), 'Toque em compartilhar e depois em "Adicionar à Tela de Início".'),
    h('button', { 'aria-label': 'Fechar', onclick: () => { tip.remove(); try { localStorage.setItem('nos.installTip', '1'); } catch { /* ok */ } } }, '×'));
  document.body.append(tip);
  S.cleanups.push(() => tip.remove());
}

function editProfileSheet() {
  const p = S.me.profile;
  const name = h('input', { class: 'input', value: p.display_name, maxlength: 40 });
  const bio = h('textarea', { class: 'input', maxlength: 160, placeholder: 'Uma frase sobre você', style: 'min-height:72px' });
  bio.value = p.bio || '';
  let s;
  const save = h('button', { class: 'btn block', onclick: async () => {
    if (!name.value.trim()) return toast('Escreva seu nome.');
    save.disabled = true;
    try { await S.api.updateProfile({ display_name: name.value.trim(), bio: bio.value.trim() }); await refreshMe(); s.close(); route(); toast('Perfil salvo'); }
    catch (e) { toast(friendlyError(e)); save.disabled = false; }
  } }, 'Salvar perfil');
  s = sheet('Editar perfil', h('div', null, h('label', { class: 'field' }, h('span', null, 'Nome'), name), h('label', { class: 'field' }, h('span', null, 'Bio'), bio), save));
}

async function viewProfile() {
  const { profile, partner, couple } = S.me;
  const file = h('input', { type: 'file', accept: 'image/*', class: 'sr-only', 'aria-label': 'Trocar foto' });
  file.addEventListener('change', async () => {
    const f = file.files[0];
    file.value = '';
    if (!f) return;
    toast('Enviando foto…');
    try {
      const blob = (await compressImage(f, 640, 0.85)) || f;
      await S.api.uploadAvatar(blob);
      await refreshMe();
      route();
      toast('Foto atualizada');
    } catch (e) { toast(friendlyError(e)); }
  });
  const spotifyVal = h('span', { class: 'val' }, '…');
  const spotifyRow = h('button', { type: 'button' }, h('span', { class: 'lbl' }, 'Spotify'), spotifyVal);

  render(shell('perfil', topbar({ title: 'Perfil' }),
    h('section', { class: 'profile-head' },
      h('button', { class: 'avatar-edit', 'aria-label': 'Trocar foto', onclick: () => file.click() }, avatar(profile, 'lg'), h('span', { class: 'cam' }, icon('camera'))),
      file,
      h('h1', null, profile.display_name),
      h('p', { class: 'at' }, '@' + profile.username),
      profile.bio ? h('p', { style: 'margin-top:8px' }, profile.bio) : null,
    ),
    h('section', { class: 'section' },
      h('div', { class: 'panel row' }, avatar(partner, 'md'), h('div', { class: 'grow' },
        h('div', { class: 'small muted' }, 'Seu par'),
        h('div', { style: 'font-weight:700' }, partner.display_name),
        h('div', { class: 'small muted' }, '@' + partner.username + (partner.bio ? ', ' + partner.bio : ''))),
        knot()),
    ),
    h('section', { class: 'section' },
      h('div', { class: 'settings' },
        h('button', { type: 'button', onclick: editProfileSheet }, h('span', { class: 'lbl' }, 'Editar nome e bio')),
        h('button', { type: 'button', onclick: sinceSheet }, h('span', { class: 'lbl' }, 'Data em que começamos'), h('span', { class: 'val' }, couple.since ? fmtDay(couple.since) : 'escolher')),
        spotifyRow,
        h('button', { type: 'button', onclick: installSheet }, h('span', { class: 'lbl' }, 'Instalar no celular')),
        h('button', { type: 'button', onclick: () => confirmSheet('Sair da conta?', 'Você pode entrar de novo quando quiser com seu e-mail e senha.', 'Sair', () => S.api.signOut()) }, h('span', { class: 'lbl', style: 'color:var(--cherry)' }, 'Sair')),
      ),
    ),
    h('details', { class: 'help' },
      h('summary', null, 'Configuração do Spotify'),
      h('p', null, 'No painel de desenvolvedor do Spotify, o Redirect URI do app precisa ser exatamente este:'),
      h('code', { class: 'code' }, redirectUri()),
      h('p', null, 'E as duas contas do Spotify (a sua e a dela) precisam estar na lista de usuários do app, em User Management.'),
    ),
  ));
  const k = $app.querySelector('.panel.row > svg');
  if (k) k.style.cssText = 'width:42px;height:28px;flex:none';

  const st = await S.api.spotify.status().catch(() => ({ me: false }));
  spotifyVal.textContent = st.me ? 'conectado' : 'conectar';
  spotifyRow.addEventListener('click', () => {
    if (st.me) {
      confirmSheet('Desconectar o Spotify?', `${partner.display_name} deixa de ver o que você ouve. Dá pra conectar de novo quando quiser.`, 'Desconectar', async () => { await S.api.spotify.disconnect(); route(); toast('Spotify desconectado'); });
    } else if (spotifyConfigured() || S.api.demo) {
      startSpotifyLogin(S.api).then((r) => { if (r === 'demo') { toast('Spotify conectado'); route(); } }).catch((e) => toast(friendlyError(e)));
    } else {
      toast('Falta colocar o Client ID do Spotify no config.js.', 3500);
    }
  });
}

/* ───────────────────────── início do app ───────────────────────── */

async function handleSpotifyCallback() {
  const code = params.get('code');
  const state = params.get('state');
  const err = params.get('error');
  if (!code && !err) return;
  history.replaceState(null, '', location.pathname + '#musica');
  if (err) { setTimeout(() => toast('A conexão com o Spotify foi cancelada.'), 600); return; }
  try {
    await S.api.spotify.complete(state, code);
    setTimeout(() => toast('Spotify conectado'), 600);
  } catch (e) {
    setTimeout(() => toast('Não deu pra conectar o Spotify: ' + friendlyError(e), 5000), 600);
  }
}

async function boot() {
  const demo = !C.SUPABASE_URL || !C.SUPABASE_KEY || params.has('demo');
  try {
    S.api = demo ? makeDemoApi(params.get('demo')) : makeSupabaseApi();
  } catch (e) {
    $app.replaceChildren(h('div', { class: 'auth' }, h('h1', null, 'Não deu pra abrir o app'), h('p', { class: 'lead' }, friendlyError(e))));
    return;
  }
  if (!demo && (params.has('code') || params.has('error'))) await handleSpotifyCallback();

  const logged = await S.api.init();
  if (logged) await refreshMe().catch((e) => { toast(friendlyError(e)); S.me = null; });
  S.api.onAuth(async (isLogged) => {
    S.matchShown = false;
    if (isLogged) await refreshMe().catch(() => { S.me = null; });
    else S.me = null;
    startRealtime();
    if (!isLogged) history.replaceState(null, '', location.pathname + '#');
    route();
  });
  startRealtime();
  window.addEventListener('hashchange', route);
  route();

  if ('serviceWorker' in navigator && !demo && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot();
