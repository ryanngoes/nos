// Modo demonstração: mesmo "contrato" do api.js, com dados de exemplo em memória.
// Nada sai do aparelho e tudo volta ao começo quando a página recarrega.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const svgUrl = (svg) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

// Cenas desenhadas na hora (só formas), pra servir de "foto" de exemplo.
const SCENES = {
  sunset: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3B1F5B"/><stop offset=".45" stop-color="#E0607E"/><stop offset=".62" stop-color="#FFB37A"/></linearGradient><linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7A3A6C"/><stop offset="1" stop-color="#26143A"/></linearGradient></defs><rect width="800" height="1000" fill="url(#s)"/><circle cx="400" cy="610" r="120" fill="#FFE2A8"/><rect y="620" width="800" height="380" fill="url(#w)"/><g stroke="#FFD49A" stroke-width="6" stroke-linecap="round" opacity=".7"><path d="M300 660h200M330 700h140M360 740h80M380 780h40"/></g><g fill="#1D0F2A"><circle cx="250" cy="930" r="34"/><rect x="226" y="955" width="48" height="60" rx="20"/><circle cx="330" cy="925" r="30"/><rect x="309" y="948" width="42" height="70" rx="18"/></g></svg>`),
  city: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><defs><linearGradient id="n" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0E0A24"/><stop offset="1" stop-color="#3A1E4F"/></linearGradient></defs><rect width="800" height="1000" fill="url(#n)"/><circle cx="620" cy="190" r="56" fill="#F4E9C9"/><g fill="#1A1030"><rect x="20" y="520" width="150" height="480"/><rect x="190" y="430" width="120" height="570"/><rect x="330" y="580" width="170" height="420"/><rect x="520" y="470" width="110" height="530"/><rect x="650" y="610" width="140" height="390"/></g><g fill="#FFC86B" opacity=".85"><rect x="50" y="560" width="22" height="30"/><rect x="110" y="620" width="22" height="30"/><rect x="220" y="480" width="20" height="28"/><rect x="270" y="560" width="20" height="28"/><rect x="220" y="650" width="20" height="28"/><rect x="370" y="630" width="24" height="30"/><rect x="440" y="700" width="24" height="30"/><rect x="550" y="520" width="20" height="28"/><rect x="590" y="610" width="20" height="28"/><rect x="690" y="660" width="22" height="30"/><rect x="740" y="740" width="22" height="30"/></g><g fill="#FFF" opacity=".8"><circle cx="120" cy="140" r="2"/><circle cx="300" cy="90" r="2.5"/><circle cx="420" cy="220" r="2"/><circle cx="200" cy="300" r="1.8"/><circle cx="520" cy="80" r="2"/><circle cx="720" cy="340" r="2"/></g></svg>`),
  park: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#BFE3F2"/><circle cx="180" cy="200" r="70" fill="#FFF3B0"/><path d="M0 620 Q200 520 420 600 T800 560 V1000 H0Z" fill="#7FB77E"/><path d="M0 760 Q260 660 520 760 T800 720 V1000 H0Z" fill="#5E9C5A"/><rect x="560" y="470" width="22" height="150" fill="#6B4A3A"/><circle cx="571" cy="440" r="80" fill="#3F7D45"/><rect x="250" y="800" width="300" height="120" rx="10" fill="#F2C6D3"/><path d="M250 820h300" stroke="#E29AB0" stroke-width="8"/><circle cx="330" cy="790" r="22" fill="#D7263D"/><circle cx="460" cy="795" r="18" fill="#F7B267"/></svg>`),
  beach: svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><rect width="800" height="1000" fill="#9ED8F0"/><rect y="430" width="800" height="230" fill="#3D9BC2"/><path d="M0 470 Q100 450 200 470 T400 470 T600 470 T800 470" stroke="#BFEAF7" stroke-width="8" fill="none"/><path d="M0 640 Q400 560 800 650 V1000 H0Z" fill="#F4D9A6"/><g transform="translate(470 560)"><path d="M0 0 L-6 -200" stroke="#5B4636" stroke-width="10"/><path d="M-6 -200 q-90 10 -150 70 q80 -40 150 -70 q-40 -70 -130 -90 q90 40 130 90 q60 -70 150 -70 q-90 20 -150 70 q100 0 150 60 q-80 -40 -150 -60Z" fill="#3E8E4E"/></g><circle cx="230" cy="790" r="70" fill="#D7263D"/><path d="M160 790 h140" stroke="#FFF" stroke-width="10"/></svg>`),
};

const ART = (a, b, shape) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/>${shape}</svg>`);

const TRACKS = [
  { id: 'demo1', name: 'Céu de Agosto', artists: 'Lua Clara', image: ART('#F7B267', '#D7263D', '<circle cx="150" cy="150" r="70" fill="#FFE8C2" opacity=".9"/>'), duration_ms: 214000 },
  { id: 'demo2', name: 'Nosso Lugar', artists: 'Os Fictícios', image: ART('#3A1E4F', '#8E2A56', '<path d="M40 220 L150 70 L260 220Z" fill="#F6D3DE" opacity=".85"/>'), duration_ms: 187000 },
  { id: 'demo3', name: 'Tarde de Domingo', artists: 'Marina Vento', image: ART('#7FB77E', '#2E5E4E', '<rect x="80" y="80" width="140" height="140" rx="70" fill="#FFF3B0"/>'), duration_ms: 241000 },
  { id: 'demo4', name: 'Duas Xícaras', artists: 'Café Noturno', image: ART('#2B1734', '#5B2A45', '<circle cx="115" cy="160" r="45" fill="#F3ECEF"/><circle cx="185" cy="160" r="45" fill="#FF4F70" opacity=".85"/>'), duration_ms: 199000 },
  { id: 'demo5', name: 'Até a Lua', artists: 'Lua Clara', image: ART('#0E0A24', '#3A1E4F', '<circle cx="190" cy="110" r="44" fill="#F4E9C9"/>'), duration_ms: 226000 },
  { id: 'demo6', name: 'Sal e Sol', artists: 'Maré Mansa', image: ART('#9ED8F0', '#3D9BC2', '<path d="M0 200 Q75 170 150 200 T300 200 V300 H0Z" fill="#F4D9A6"/>'), duration_ms: 203000 },
];

function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function tsAgo(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

export function makeDemoApi(mode) {
  const ME = 'u-me';
  const HER = 'u-her';
  const people = {
    [ME]: { id: ME, username: 'voce', display_name: 'Você', bio: '', avatar_url: null, couple_id: 'c1' },
    [HER]: { id: HER, username: 'ela', display_name: 'Ela', bio: 'a pessoa mais linda desse app', avatar_url: null, couple_id: 'c1' },
    'u-x': { id: 'u-x', username: 'elaine.s', display_name: 'Elaine', bio: '', avatar_url: null, couple_id: 'c9' },
  };
  let couple = { id: 'c1', user_a: ME, user_b: HER, since: isoDaysAgo(412) };
  let logged = mode !== 'welcome';
  if (!logged) {
    people[ME].couple_id = null;
    people[HER].couple_id = null;
  }
  let authCb = () => {};
  let changeCb = () => {};
  let requests = [];
  const media = {
    'demo/sunset': SCENES.sunset,
    'demo/city': SCENES.city,
    'demo/park': SCENES.park,
    'demo/beach': SCENES.beach,
  };
  let memories = [
    { id: 'm1', author: HER, title: 'nosso primeiro pôr do sol', note: 'A gente ficou até escurecer e você disse que ia lembrar desse dia pra sempre. Eu também vou.', place: 'Praia do Forte', happened_on: isoDaysAgo(9), media: [{ path: 'demo/sunset', kind: 'image' }, { path: 'demo/beach', kind: 'image' }], created_at: tsAgo(60 * 24 * 9), hearts: [ME], comments: [{ id: 'k1', author: ME, body: 'melhor dia ❤️', created_at: tsAgo(60 * 24 * 8) }, { id: 'k2', author: HER, body: 'vamos voltar lá no verão', created_at: tsAgo(60 * 24 * 8 - 30) }] },
    { id: 'm2', author: ME, title: 'a cidade acesa', note: 'Voltando a pé do cinema, rindo de tudo.', place: 'Centro', happened_on: isoDaysAgo(40), media: [{ path: 'demo/city', kind: 'image' }], created_at: tsAgo(60 * 24 * 40), hearts: [ME, HER], comments: [] },
    { id: 'm3', author: HER, title: 'piquenique', note: 'Você esqueceu os copos e a gente bebeu suco direto da garrafa.', place: 'Parque da Cidade', happened_on: isoDaysAgo(95), media: [{ path: 'demo/park', kind: 'image' }], created_at: tsAgo(60 * 24 * 95), hearts: [], comments: [] },
    { id: 'm4', author: ME, title: 'o dia em que tudo começou', note: 'Escrevendo isso pra nunca esquecer: foi nesse dia que eu soube.', place: '', happened_on: isoDaysAgo(412), media: [], created_at: tsAgo(60 * 24 * 300), hearts: [HER], comments: [] },
  ];
  let dedications = [
    { id: 'd1', from_user: HER, track_id: 'demo1', track_name: TRACKS[0].name, artists: TRACKS[0].artists, image_url: TRACKS[0].image, message: 'toda vez que toca eu lembro de você', created_at: tsAgo(180) },
    { id: 'd2', from_user: ME, track_id: 'demo4', track_name: TRACKS[3].name, artists: TRACKS[3].artists, image_url: TRACKS[3].image, message: 'a nossa música de domingo', created_at: tsAgo(60 * 30) },
  ];
  const spotifyState = { me: true, partner: true };
  const herStart = Date.now() - 64000;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const withCount = (m) => ({ ...clone(m), comments_count: m.comments.length });

  const api = {
    demo: true,
    get uid() { return logged ? ME : null; },
    async init() { await wait(150); return logged; },
    onAuth(cb) { authCb = cb; },
    async usernameAvailable(u) { await wait(200); return !Object.values(people).some((p) => p.username === u); },
    async signUp({ username, display_name }) {
      await wait(500);
      people[ME].username = username;
      people[ME].display_name = display_name;
      people[ME].couple_id = null;
      logged = true;
      authCb(true);
      return { needsConfirm: false };
    },
    async signIn() { await wait(400); logged = true; authCb(true); },
    async signOut() { logged = false; authCb(false); },
    async me() {
      await wait(80);
      const p = people[ME];
      const paired = !!p.couple_id;
      return { profile: clone(p), couple: paired ? clone(couple) : null, partner: paired ? clone(people[HER]) : null };
    },
    async updateProfile(f) { Object.assign(people[ME], f); },
    async uploadAvatar(blob) {
      const url = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      people[ME].avatar_url = url;
      return url;
    },
    async setSince(date) { couple.since = date || null; },

    async searchUsers(q) {
      await wait(250);
      const c = q.toLowerCase().replace(/[^a-z0-9._]/g, '');
      if (!c) return [];
      return Object.values(people).filter((p) => p.id !== ME && p.username.startsWith(c)).map(clone);
    },
    async requests() {
      return {
        incoming: [],
        outgoing: requests.map((r) => ({ id: r.id, person: clone(people[r.to]) })),
      };
    },
    async sendRequest(toId) {
      await wait(300);
      requests.push({ id: 'r' + Date.now(), to: toId });
      if (toId === HER) {
        // Na demonstração, "ela" aceita sozinha depois de um tempinho.
        setTimeout(() => {
          requests = [];
          people[ME].couple_id = 'c1';
          people[HER].couple_id = 'c1';
          changeCb('profiles');
        }, 2200);
      }
      return { matched: false };
    },
    async acceptRequest() {},
    async cancelRequest(id) { requests = requests.filter((r) => r.id !== id); },

    async memories() { await wait(120); return memories.map(withCount); },
    async memory(id) { await wait(80); const m = memories.find((x) => x.id === id); return m ? withCount(m) : null; },
    async createMemory({ title, note, place, happened_on, items }, onProgress) {
      const saved = [];
      for (let i = 0; i < items.length; i++) {
        onProgress?.(i, items.length);
        await wait(350);
        const path = 'local/' + Date.now() + '-' + i;
        media[path] = URL.createObjectURL(items[i].blob);
        saved.push({ path, kind: items[i].kind });
      }
      onProgress?.(items.length, items.length);
      const id = 'm' + Date.now();
      memories.unshift({ id, author: ME, title, note, place, happened_on, media: saved, created_at: new Date().toISOString(), hearts: [], comments: [] });
      memories.sort((a, b) => b.happened_on.localeCompare(a.happened_on) || b.created_at.localeCompare(a.created_at));
      return id;
    },
    async deleteMemory(id) { memories = memories.filter((m) => m.id !== id); },
    async setHeart(id, on) {
      const m = memories.find((x) => x.id === id);
      if (!m) return;
      m.hearts = m.hearts.filter((u) => u !== ME);
      if (on) m.hearts.push(ME);
    },
    async addComment(id, body) {
      const m = memories.find((x) => x.id === id);
      m.comments.push({ id: 'k' + Date.now(), author: ME, body, created_at: new Date().toISOString() });
      setTimeout(() => {
        m.comments.push({ id: 'k' + Date.now(), author: HER, body: 'awn 🥹', created_at: new Date().toISOString() });
        changeCb('memory_comments');
      }, 2500);
    },
    async mediaUrls(paths) { return Object.fromEntries(paths.map((p) => [p, media[p] || null])); },

    async dedications() { await wait(100); return clone(dedications); },
    async createDedication(t, message) {
      dedications.unshift({ id: 'd' + Date.now(), from_user: ME, track_id: t.id, track_name: t.name, artists: t.artists, image_url: t.image, message, created_at: new Date().toISOString() });
    },

    spotify: {
      async status() { return { ...spotifyState }; },
      async now(who) {
        await wait(120);
        if (who === 'partner') {
          if (!spotifyState.partner) return { status: 'not_connected' };
          const t = TRACKS[1];
          const progress = (Date.now() - herStart) % t.duration_ms;
          return { status: 'ok', is_playing: true, progress_ms: progress, fetched_at: new Date().toISOString(), track: { id: t.id, name: t.name, artists: t.artists, image: t.image, duration_ms: t.duration_ms, url: '#' } };
        }
        if (!spotifyState.me) return { status: 'not_connected' };
        return { status: 'idle' };
      },
      async token() { return 'demo'; },
      async begin() { return 'demo'; },
      async complete() { return 'ok'; },
      async disconnect() { spotifyState.me = false; },
      async connectDemo() { spotifyState.me = true; },
      searchDemo(q) {
        const s = q.toLowerCase();
        return TRACKS.filter((t) => !s || (t.name + ' ' + t.artists).toLowerCase().includes(s)).map((t) => ({ ...t, url: '#', uri: 'spotify:track:' + t.id }));
      },
    },

    subscribe(cb) { changeCb = cb; return () => { changeCb = () => {}; }; },
  };
  return api;
}
