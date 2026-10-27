-- ═══════════════════════════════════════════════════════════════════
--  nós · banco de dados
--  Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
--  Pode rodar de novo sem problema se precisar.
-- ═══════════════════════════════════════════════════════════════════

-- Requisições HTTP direto do banco (usado pra falar com o Spotify)
create extension if not exists http with schema extensions;

-- ───────────────────────── tabelas ─────────────────────────

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9._]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 160),
  avatar_path text,
  couple_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.couples (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references public.profiles (id) on delete cascade,
  user_b uuid not null references public.profiles (id) on delete cascade,
  since date,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.profiles
    add constraint profiles_couple_fk foreign key (couple_id) references public.couples (id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.couple_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references public.profiles (id) on delete cascade,
  to_user uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (from_user, to_user),
  check (from_user <> to_user)
);

create table if not exists public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  author uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 60),
  note text not null default '' check (char_length(note) <= 2000),
  place text not null default '' check (char_length(place) <= 80),
  happened_on date not null default current_date,
  media jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists memories_couple_idx on public.memories (couple_id, happened_on desc, created_at desc);

create table if not exists public.memory_hearts (
  memory_id uuid not null references public.memories (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id)
);

create table if not exists public.memory_comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null references public.memories (id) on delete cascade,
  author uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists memory_comments_memory_idx on public.memory_comments (memory_id, created_at);

create table if not exists public.dedications (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples (id) on delete cascade,
  from_user uuid not null references public.profiles (id) on delete cascade,
  track_id text not null,
  track_name text not null,
  artists text not null default '',
  image_url text,
  message text not null default '' check (char_length(message) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists dedications_couple_idx on public.dedications (couple_id, created_at desc);

-- ───────────────────────── funções de apoio ─────────────────────────

create or replace function public.my_couple() returns uuid
language sql stable security definer set search_path = public as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_partner() returns uuid
language sql stable security definer set search_path = public as $$
  select case when c.user_a = auth.uid() then c.user_b else c.user_a end
  from public.couples c where c.id = public.my_couple()
$$;

create or replace function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_username, '') ~ '^[a-z0-9._]{3,20}$'
     and not exists (select 1 from public.profiles where username = lower(p_username))
$$;

-- Cria o perfil automaticamente quando alguém cria conta
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    lower(new.raw_user_meta_data ->> 'username'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- O "match": aceita o pedido e cria o casal
create or replace function public.accept_request(p_request uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  r public.couple_requests;
  cid uuid;
begin
  select * into r from public.couple_requests where id = p_request and to_user = auth.uid() for update;
  if not found then raise exception 'Esse pedido não existe mais.'; end if;
  perform 1 from public.profiles where id in (r.from_user, r.to_user) for update;
  if exists (select 1 from public.profiles where id in (r.from_user, r.to_user) and couple_id is not null) then
    raise exception 'Um de vocês já está conectado com outra pessoa.';
  end if;
  insert into public.couples (user_a, user_b) values (r.from_user, r.to_user) returning id into cid;
  update public.profiles set couple_id = cid where id in (r.from_user, r.to_user);
  delete from public.couple_requests
   where from_user in (r.from_user, r.to_user) or to_user in (r.from_user, r.to_user);
  return cid;
end $$;

-- ───────────────────────── permissões (RLS) ─────────────────────────

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_requests enable row level security;
alter table public.memories enable row level security;
alter table public.memory_hearts enable row level security;
alter table public.memory_comments enable row level security;
alter table public.dedications enable row level security;

revoke all on public.profiles, public.couples, public.couple_requests, public.memories,
  public.memory_hearts, public.memory_comments, public.dedications from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, bio, avatar_path) on public.profiles to authenticated;
grant select on public.couples to authenticated;
grant update (since) on public.couples to authenticated;
grant select, insert, delete on public.couple_requests to authenticated;
grant select, insert, update, delete on public.memories to authenticated;
grant select, insert, delete on public.memory_hearts to authenticated;
grant select, insert, delete on public.memory_comments to authenticated;
grant select, insert, delete on public.dedications to authenticated;

drop policy if exists "perfis visiveis" on public.profiles;
create policy "perfis visiveis" on public.profiles for select to authenticated using (true);
drop policy if exists "editar o proprio perfil" on public.profiles;
create policy "editar o proprio perfil" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "ver o proprio casal" on public.couples;
create policy "ver o proprio casal" on public.couples for select to authenticated using (id = public.my_couple());
drop policy if exists "editar o proprio casal" on public.couples;
create policy "editar o proprio casal" on public.couples for update to authenticated
  using (id = public.my_couple()) with check (id = public.my_couple());

drop policy if exists "ver meus pedidos" on public.couple_requests;
create policy "ver meus pedidos" on public.couple_requests for select to authenticated
  using (auth.uid() in (from_user, to_user));
drop policy if exists "mandar pedido" on public.couple_requests;
create policy "mandar pedido" on public.couple_requests for insert to authenticated
  with check (from_user = auth.uid() and to_user <> auth.uid() and public.my_couple() is null);
drop policy if exists "apagar meus pedidos" on public.couple_requests;
create policy "apagar meus pedidos" on public.couple_requests for delete to authenticated
  using (auth.uid() in (from_user, to_user));

drop policy if exists "memorias do casal" on public.memories;
create policy "memorias do casal" on public.memories for select to authenticated using (couple_id = public.my_couple());
drop policy if exists "criar memoria" on public.memories;
create policy "criar memoria" on public.memories for insert to authenticated
  with check (couple_id = public.my_couple() and author = auth.uid());
drop policy if exists "editar memoria" on public.memories;
create policy "editar memoria" on public.memories for update to authenticated
  using (couple_id = public.my_couple()) with check (couple_id = public.my_couple());
drop policy if exists "apagar memoria" on public.memories;
create policy "apagar memoria" on public.memories for delete to authenticated using (couple_id = public.my_couple());

drop policy if exists "ver coracoes" on public.memory_hearts;
create policy "ver coracoes" on public.memory_hearts for select to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id and m.couple_id = public.my_couple()));
drop policy if exists "dar coracao" on public.memory_hearts;
create policy "dar coracao" on public.memory_hearts for insert to authenticated
  with check (user_id = auth.uid() and exists (select 1 from public.memories m where m.id = memory_id and m.couple_id = public.my_couple()));
drop policy if exists "tirar coracao" on public.memory_hearts;
create policy "tirar coracao" on public.memory_hearts for delete to authenticated using (user_id = auth.uid());

drop policy if exists "ver comentarios" on public.memory_comments;
create policy "ver comentarios" on public.memory_comments for select to authenticated
  using (exists (select 1 from public.memories m where m.id = memory_id and m.couple_id = public.my_couple()));
drop policy if exists "comentar" on public.memory_comments;
create policy "comentar" on public.memory_comments for insert to authenticated
  with check (author = auth.uid() and exists (select 1 from public.memories m where m.id = memory_id and m.couple_id = public.my_couple()));
drop policy if exists "apagar comentario" on public.memory_comments;
create policy "apagar comentario" on public.memory_comments for delete to authenticated using (author = auth.uid());

drop policy if exists "ver dedicatorias" on public.dedications;
create policy "ver dedicatorias" on public.dedications for select to authenticated using (couple_id = public.my_couple());
drop policy if exists "dedicar" on public.dedications;
create policy "dedicar" on public.dedications for insert to authenticated
  with check (couple_id = public.my_couple() and from_user = auth.uid());
drop policy if exists "apagar dedicatoria" on public.dedications;
create policy "apagar dedicatoria" on public.dedications for delete to authenticated using (from_user = auth.uid());

-- ───────────────────────── arquivos (fotos, vídeos, áudios) ─────────────────────────

insert into storage.buckets (id, name, public, file_size_limit)
values ('avatars', 'avatars', true, 5242880),
       ('memories', 'memories', false, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

drop policy if exists "nos: enviar avatar" on storage.objects;
create policy "nos: enviar avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "nos: apagar avatar" on storage.objects;
create policy "nos: apagar avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "nos: ver arquivos do casal" on storage.objects;
create policy "nos: ver arquivos do casal" on storage.objects for select to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_couple()::text);
drop policy if exists "nos: enviar arquivos do casal" on storage.objects;
create policy "nos: enviar arquivos do casal" on storage.objects for insert to authenticated
  with check (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_couple()::text);
drop policy if exists "nos: apagar arquivos do casal" on storage.objects;
create policy "nos: apagar arquivos do casal" on storage.objects for delete to authenticated
  using (bucket_id = 'memories' and (storage.foldername(name))[1] = public.my_couple()::text);

-- ───────────────────────── Spotify ─────────────────────────
-- Os tokens ficam num esquema privado: o app nunca lê eles direto,
-- só através das funções abaixo.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.spotify_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  client_id text not null,
  access_token text,
  refresh_token text not null,
  expires_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.spotify_pending (
  state text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  verifier text not null,
  client_id text not null,
  redirect_uri text not null,
  created_at timestamptz not null default now()
);

-- Devolve um access token válido (renova sozinho quando expira)
create or replace function private.spotify_access(p_user uuid) returns text
language plpgsql security definer set search_path = private, public, extensions as $$
declare
  t private.spotify_tokens;
  resp extensions.http_response;
  body jsonb;
begin
  if p_user is null then return null; end if;
  select * into t from private.spotify_tokens where user_id = p_user for update;
  if not found then return null; end if;
  if t.access_token is not null and t.expires_at > now() then return t.access_token; end if;

  select * into resp from extensions.http_post(
    'https://accounts.spotify.com/api/token',
    'grant_type=refresh_token&refresh_token=' || extensions.urlencode(t.refresh_token)
      || '&client_id=' || extensions.urlencode(t.client_id),
    'application/x-www-form-urlencoded'
  );
  if resp.status = 400 then
    -- acesso revogado no Spotify: desconecta pra pessoa conectar de novo
    delete from private.spotify_tokens where user_id = p_user;
    return null;
  end if;
  if resp.status <> 200 then return null; end if;

  body := resp.content::jsonb;
  update private.spotify_tokens set
    access_token = body ->> 'access_token',
    refresh_token = coalesce(body ->> 'refresh_token', t.refresh_token),
    expires_at = now() + make_interval(secs => greatest(60, coalesce((body ->> 'expires_in')::int, 3600) - 120)),
    updated_at = now()
  where user_id = p_user;
  return body ->> 'access_token';
end $$;
revoke all on function private.spotify_access(uuid) from public, anon, authenticated;

-- Passo 1 do login: guarda o "verifier" e devolve um código de estado
create or replace function public.spotify_begin(p_verifier text, p_client_id text, p_redirect text) returns text
language plpgsql security definer set search_path = private, public as $$
declare s text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro.'; end if;
  delete from private.spotify_pending where user_id = auth.uid() or created_at < now() - interval '1 hour';
  s := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.spotify_pending (state, user_id, verifier, client_id, redirect_uri)
  values (s, auth.uid(), p_verifier, p_client_id, p_redirect);
  return s;
end $$;

-- Passo 2 do login: troca o código do Spotify pelos tokens
create or replace function public.spotify_complete(p_state text, p_code text) returns text
language plpgsql security definer set search_path = private, public, extensions as $$
declare
  p private.spotify_pending;
  resp extensions.http_response;
  body jsonb;
begin
  select * into p from private.spotify_pending
   where state = p_state and created_at > now() - interval '15 minutes';
  if not found then raise exception 'O pedido de conexão expirou. Tente conectar de novo.'; end if;
  delete from private.spotify_pending where state = p_state;

  select * into resp from extensions.http_post(
    'https://accounts.spotify.com/api/token',
    'grant_type=authorization_code'
      || '&code=' || extensions.urlencode(p_code)
      || '&redirect_uri=' || extensions.urlencode(p.redirect_uri)
      || '&client_id=' || extensions.urlencode(p.client_id)
      || '&code_verifier=' || extensions.urlencode(p.verifier),
    'application/x-www-form-urlencoded'
  );
  if resp.status <> 200 then
    raise exception 'O Spotify recusou a conexão (%): %', resp.status, left(coalesce(resp.content, ''), 200);
  end if;

  body := resp.content::jsonb;
  insert into private.spotify_tokens (user_id, client_id, access_token, refresh_token, expires_at)
  values (p.user_id, p.client_id, body ->> 'access_token', body ->> 'refresh_token',
          now() + make_interval(secs => greatest(60, coalesce((body ->> 'expires_in')::int, 3600) - 120)))
  on conflict (user_id) do update set
    client_id = excluded.client_id,
    access_token = excluded.access_token,
    refresh_token = excluded.refresh_token,
    expires_at = excluded.expires_at,
    updated_at = now();
  return 'ok';
end $$;

-- O que alguém está ouvindo agora ('me' = eu, 'partner' = meu par)
create or replace function public.spotify_now(p_who text default 'me') returns jsonb
language plpgsql security definer set search_path = private, public, extensions as $$
declare
  target uuid;
  tok text;
  resp extensions.http_response;
  d jsonb;
  it jsonb;
begin
  if auth.uid() is null then return jsonb_build_object('status', 'not_authenticated'); end if;
  target := case when p_who = 'partner' then public.my_partner() else auth.uid() end;
  if target is null then return jsonb_build_object('status', 'no_partner'); end if;

  tok := private.spotify_access(target);
  if tok is null then return jsonb_build_object('status', 'not_connected'); end if;

  select * into resp from extensions.http((
    'GET',
    'https://api.spotify.com/v1/me/player/currently-playing?additional_types=track,episode',
    array[extensions.http_header('Authorization', 'Bearer ' || tok)],
    null,
    null
  )::extensions.http_request);

  if resp.status = 204 or coalesce(resp.content, '') = '' then return jsonb_build_object('status', 'idle'); end if;
  if resp.status <> 200 then return jsonb_build_object('status', 'error', 'code', resp.status); end if;

  d := resp.content::jsonb;
  it := d -> 'item';
  if it is null or jsonb_typeof(it) = 'null' then return jsonb_build_object('status', 'idle'); end if;

  return jsonb_build_object(
    'status', 'ok',
    'is_playing', coalesce((d ->> 'is_playing')::boolean, false),
    'progress_ms', coalesce((d ->> 'progress_ms')::bigint, 0),
    'track', jsonb_build_object(
      'id', case when it ->> 'type' = 'track' then it ->> 'id' end,
      'name', it ->> 'name',
      'artists', coalesce(
        (select string_agg(a ->> 'name', ', ') from jsonb_array_elements(coalesce(it -> 'artists', '[]'::jsonb)) a),
        it -> 'show' ->> 'name', ''),
      'image', coalesce(it -> 'album' -> 'images' -> 0 ->> 'url', it -> 'images' -> 0 ->> 'url'),
      'duration_ms', coalesce((it ->> 'duration_ms')::bigint, 0),
      'url', it -> 'external_urls' ->> 'spotify'
    )
  );
end $$;

-- Token do próprio usuário (pra buscar e tocar músicas no aparelho)
create or replace function public.spotify_token() returns text
language plpgsql security definer set search_path = private, public as $$
begin
  return private.spotify_access(auth.uid());
end $$;

create or replace function public.spotify_status() returns jsonb
language sql stable security definer set search_path = private, public as $$
  select jsonb_build_object(
    'me', exists (select 1 from private.spotify_tokens where user_id = auth.uid()),
    'partner', exists (select 1 from private.spotify_tokens where user_id = public.my_partner())
  )
$$;

create or replace function public.spotify_disconnect() returns void
language sql security definer set search_path = private, public as $$
  delete from private.spotify_tokens where user_id = auth.uid();
$$;

-- Quem pode chamar o quê
revoke execute on function public.accept_request(uuid), public.spotify_begin(text, text, text),
  public.spotify_now(text), public.spotify_token(), public.spotify_status(), public.spotify_disconnect(),
  public.my_couple(), public.my_partner()
  from public, anon;
grant execute on function public.accept_request(uuid), public.spotify_begin(text, text, text),
  public.spotify_now(text), public.spotify_token(), public.spotify_status(), public.spotify_disconnect(),
  public.my_couple(), public.my_partner()
  to authenticated;
-- Essas duas precisam funcionar antes do login (criar conta e voltar do Spotify)
grant execute on function public.username_available(text), public.spotify_complete(text, text) to anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ───────────────────────── tempo real ─────────────────────────

do $$
declare t text;
begin
  foreach t in array array['profiles', 'couples', 'couple_requests', 'memories', 'memory_hearts', 'memory_comments', 'dedications'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- Pronto! 💌
