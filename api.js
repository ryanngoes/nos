// Camada de dados real: Supabase (contas, banco, arquivos, tempo real).
// A versão de demonstração (demo.js) tem exatamente as mesmas funções.

const C = window.NOS_CONFIG || {};

const PT_ERRORS = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/user already registered|already been registered/i, 'Esse e-mail já tem uma conta. Tente entrar.'],
  [/password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/email not confirmed/i, 'Confirme seu e-mail pelo link que enviamos antes de entrar.'],
  [/unable to validate email|invalid email|email address .* is invalid/i, 'Esse e-mail não parece válido.'],
  [/rate limit|too many requests|security purposes/i, 'Muitas tentativas seguidas. Espere um minuto e tente de novo.'],
  [/database error saving new user/i, 'Não deu pra criar a conta. Esse @ pode já estar em uso.'],
  [/failed to fetch|network/i, 'Sem conexão com o servidor. Confira sua internet.'],
  [/payload too large|exceeded the maximum allowed size|too large/i, 'Arquivo grande demais (máximo 50 MB).'],
];

export function friendlyError(err) {
  const msg = (err && (err.message || err.error_description || err.msg)) || String(err || '');
  for (const [re, pt] of PT_ERRORS) if (re.test(msg)) return pt;
  return msg || 'Algo deu errado. Tente de novo.';
}

function fail(error) {
  if (error) {
    const e = new Error(friendlyError(error));
    e.raw = error;
    throw e;
  }
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function makeSupabaseApi() {
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  let uid = null;
  let coupleId = null;
  const urlCache = new Map(); // path -> { url, exp }
  let tokenCache = null; // { token, at }

  const avatarUrl = (path) => (path ? sb.storage.from('avatars').getPublicUrl(path).data.publicUrl : null);
  const normProfile = (p) => p && ({
    id: p.id,
    username: p.username,
    display_name: p.display_name,
    bio: p.bio || '',
    avatar_path: p.avatar_path,
    avatar_url: avatarUrl(p.avatar_path),
    couple_id: p.couple_id,
  });
  const normMemory = (m) => ({
    id: m.id,
    author: m.author,
    title: m.title || '',
    note: m.note || '',
    place: m.place || '',
    happened_on: m.happened_on,
    media: Array.isArray(m.media) ? m.media : [],
    created_at: m.created_at,
    hearts: (m.memory_hearts || []).map((x) => x.user_id),
    comments_count: Array.isArray(m.memory_comments)
      ? (m.memory_comments[0] && 'count' in m.memory_comments[0] ? m.memory_comments[0].count : m.memory_comments.length)
      : 0,
    comments: Array.isArray(m.memory_comments) && m.memory_comments[0] && 'body' in m.memory_comments[0]
      ? [...m.memory_comments].sort((a, b) => a.created_at.localeCompare(b.created_at))
      : [],
  });

  const api = {
    demo: false,

    async init() {
      const { data } = await sb.auth.getSession();
      uid = data.session?.user.id || null;
      return !!uid;
    },

    onAuth(cb) {
      sb.auth.onAuthStateChange((_ev, session) => {
        const next = session?.user.id || null;
        if (next !== uid) {
          uid = next;
          coupleId = null;
          tokenCache = null;
          setTimeout(() => cb(!!uid), 0);
        }
      });
    },

    get uid() { return uid; },

    async usernameAvailable(username) {
      const { data, error } = await sb.rpc('username_available', { p_username: username });
      fail(error);
      return !!data;
    },

    async signUp({ email, password, username, display_name }) {
      if (!(await api.usernameAvailable(username))) throw new Error('Esse @ já está em uso.');
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { username, display_name } },
      });
      fail(error);
      if (!data.session) return { needsConfirm: true };
      return { needsConfirm: false };
    },

    async signIn({ email, password }) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      fail(error);
    },

    async signOut() {
      await sb.auth.signOut();
    },

    async me() {
      const { data: p, error } = await sb.from('profiles').select('*').eq('id', uid).maybeSingle();
      fail(error);
      if (!p) return { profile: null, couple: null, partner: null };
      coupleId = p.couple_id;
      let couple = null;
      let partner = null;
      if (p.couple_id) {
        const { data: c, error: e2 } = await sb.from('couples').select('*').eq('id', p.couple_id).maybeSingle();
        fail(e2);
        couple = c;
        if (c) {
          const pid = c.user_a === uid ? c.user_b : c.user_a;
          const { data: pp, error: e3 } = await sb.from('profiles').select('*').eq('id', pid).maybeSingle();
          fail(e3);
          partner = normProfile(pp);
        }
      }
      return { profile: normProfile(p), couple, partner };
    },

    async updateProfile(fields) {
      const allowed = {};
      for (const k of ['display_name', 'bio']) if (k in fields) allowed[k] = fields[k];
      const { error } = await sb.from('profiles').update(allowed).eq('id', uid);
      fail(error);
    },

    async uploadAvatar(blob) {
      const { data: cur } = await sb.from('profiles').select('avatar_path').eq('id', uid).maybeSingle();
      const path = `${uid}/${Date.now()}.jpg`;
      const { error } = await sb.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' });
      fail(error);
      const { error: e2 } = await sb.from('profiles').update({ avatar_path: path }).eq('id', uid);
      fail(e2);
      if (cur?.avatar_path) sb.storage.from('avatars').remove([cur.avatar_path]).catch(() => {});
      return avatarUrl(path);
    },

    async setSince(date) {
      const { error } = await sb.from('couples').update({ since: date || null }).eq('id', coupleId);
      fail(error);
    },

    // ── pareamento ──
    async searchUsers(q) {
      const clean = q.toLowerCase().replace(/[^a-z0-9._]/g, '');
      if (!clean) return [];
      const { data, error } = await sb
        .from('profiles')
        .select('id, username, display_name, avatar_path, couple_id')
        .ilike('username', clean.replace(/_/g, '\\_') + '%')
        .neq('id', uid)
        .limit(10);
      fail(error);
      return data.map(normProfile);
    },

    async requests() {
      const { data, error } = await sb.from('couple_requests').select('*').order('created_at', { ascending: false });
      fail(error);
      const ids = [...new Set(data.flatMap((r) => [r.from_user, r.to_user]))].filter((x) => x !== uid);
      let people = {};
      if (ids.length) {
        const { data: ps, error: e2 } = await sb.from('profiles').select('*').in('id', ids);
        fail(e2);
        people = Object.fromEntries(ps.map((p) => [p.id, normProfile(p)]));
      }
      return {
        incoming: data.filter((r) => r.to_user === uid).map((r) => ({ id: r.id, person: people[r.from_user] })).filter((r) => r.person),
        outgoing: data.filter((r) => r.from_user === uid).map((r) => ({ id: r.id, person: people[r.to_user] })).filter((r) => r.person),
      };
    },

    async sendRequest(toId) {
      // Se a outra pessoa já tinha mandado um pedido, isso já é um match.
      const { data: back } = await sb.from('couple_requests').select('id').eq('from_user', toId).eq('to_user', uid).maybeSingle();
      if (back) {
        await api.acceptRequest(back.id);
        return { matched: true };
      }
      const { error } = await sb.from('couple_requests').insert({ from_user: uid, to_user: toId });
      if (error && /duplicate/i.test(error.message)) return { matched: false };
      fail(error);
      return { matched: false };
    },

    async acceptRequest(id) {
      const { error } = await sb.rpc('accept_request', { p_request: id });
      fail(error);
    },

    async cancelRequest(id) {
      const { error } = await sb.from('couple_requests').delete().eq('id', id);
      fail(error);
    },

    // ── memórias ──
    async memories() {
      const { data, error } = await sb
        .from('memories')
        .select('*, memory_hearts(user_id), memory_comments(count)')
        .order('happened_on', { ascending: false })
        .order('created_at', { ascending: false });
      fail(error);
      return data.map(normMemory);
    },

    async memory(id) {
      const { data, error } = await sb
        .from('memories')
        .select('*, memory_hearts(user_id), memory_comments(id, author, body, created_at)')
        .eq('id', id)
        .maybeSingle();
      fail(error);
      return data ? normMemory(data) : null;
    },

    async createMemory({ title, note, place, happened_on, items }, onProgress) {
      const uploaded = [];
      try {
        for (let i = 0; i < items.length; i++) {
          onProgress?.(i, items.length);
          const it = items[i];
          const path = `${coupleId}/${uuid()}.${it.ext}`;
          const { error } = await sb.storage.from('memories').upload(path, it.blob, { contentType: it.mime, cacheControl: '31536000' });
          fail(error);
          uploaded.push({ path, kind: it.kind });
        }
        onProgress?.(items.length, items.length);
        const { data, error } = await sb
          .from('memories')
          .insert({ couple_id: coupleId, author: uid, title, note, place, happened_on, media: uploaded })
          .select('id')
          .single();
        fail(error);
        return data.id;
      } catch (e) {
        if (uploaded.length) sb.storage.from('memories').remove(uploaded.map((u) => u.path)).catch(() => {});
        throw e;
      }
    },

    async deleteMemory(id) {
      const m = await api.memory(id);
      const { error } = await sb.from('memories').delete().eq('id', id);
      fail(error);
      if (m?.media?.length) sb.storage.from('memories').remove(m.media.map((x) => x.path)).catch(() => {});
    },

    async setHeart(memoryId, on) {
      const q = on
        ? sb.from('memory_hearts').upsert({ memory_id: memoryId, user_id: uid }, { ignoreDuplicates: true })
        : sb.from('memory_hearts').delete().eq('memory_id', memoryId).eq('user_id', uid);
      const { error } = await q;
      fail(error);
    },

    async addComment(memoryId, body) {
      const { error } = await sb.from('memory_comments').insert({ memory_id: memoryId, author: uid, body });
      fail(error);
    },

    async mediaUrls(paths) {
      const now = Date.now();
      const missing = paths.filter((p) => !(urlCache.get(p)?.exp > now));
      if (missing.length) {
        const { data, error } = await sb.storage.from('memories').createSignedUrls(missing, 60 * 60 * 6);
        fail(error);
        for (const r of data) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, exp: now + 1000 * 60 * 60 * 5 });
      }
      return Object.fromEntries(paths.map((p) => [p, urlCache.get(p)?.url || null]));
    },

    // ── músicas dedicadas ──
    async dedications() {
      const { data, error } = await sb.from('dedications').select('*').order('created_at', { ascending: false });
      fail(error);
      return data;
    },

    async createDedication(track, message) {
      const { error } = await sb.from('dedications').insert({
        couple_id: coupleId,
        from_user: uid,
        track_id: track.id,
        track_name: track.name,
        artists: track.artists,
        image_url: track.image,
        message,
      });
      fail(error);
    },

    // ── Spotify (tokens ficam guardados no banco, nunca no aparelho) ──
    spotify: {
      async status() {
        const { data, error } = await sb.rpc('spotify_status');
        fail(error);
        return data || { me: false, partner: false };
      },
      async now(who) {
        const { data, error } = await sb.rpc('spotify_now', { p_who: who });
        fail(error);
        return data;
      },
      async token(force) {
        if (!force && tokenCache && Date.now() - tokenCache.at < 4 * 60 * 1000) return tokenCache.token;
        const { data, error } = await sb.rpc('spotify_token');
        fail(error);
        tokenCache = data ? { token: data, at: Date.now() } : null;
        return data;
      },
      async begin(verifier, clientId, redirect) {
        const { data, error } = await sb.rpc('spotify_begin', { p_verifier: verifier, p_client_id: clientId, p_redirect: redirect });
        fail(error);
        return data;
      },
      async complete(state, code) {
        const { data, error } = await sb.rpc('spotify_complete', { p_state: state, p_code: code });
        fail(error);
        tokenCache = null;
        return data;
      },
      async disconnect() {
        const { error } = await sb.rpc('spotify_disconnect');
        fail(error);
        tokenCache = null;
      },
    },

    // ── tempo real ──
    subscribe(onChange) {
      const ch = sb.channel('nos-' + uid);
      for (const table of ['memories', 'memory_hearts', 'memory_comments', 'dedications', 'couple_requests', 'couples']) {
        ch.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange(table));
      }
      ch.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, () => onChange('profiles'));
      ch.subscribe();
      return () => sb.removeChannel(ch);
    },
  };

  return api;
}
