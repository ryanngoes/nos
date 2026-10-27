# nós · guia de configuração

São três contas grátis: **Supabase** (onde ficam contas, memórias e arquivos), **GitHub** (onde o site fica no ar) e **Spotify for Developers** (pra aba de música). Dá pra fazer tudo pelo celular. Conta uns 20 minutos.

## 1. Supabase (banco de dados)

1. Entre em supabase.com e crie uma conta (pode usar o login do GitHub).
2. **New project**. Nome: `nos`. Crie uma senha forte pro banco e guarde. Região: **South America (São Paulo)**.
3. Espere o projeto ficar pronto (1 a 2 minutos).
4. Menu lateral → **SQL Editor** → **New query**. Cole o conteúdo inteiro do arquivo `schema.sql` e toque em **Run**. Tem que aparecer "Success".
5. Menu → **Authentication** → **Sign In / Providers** → **Email**: desligue **Confirm email** e salve. Assim vocês entram direto, sem precisar confirmar e-mail.
6. Menu → **Project Settings** → **API Keys** (ou **API**). Copie:
   - a **Project URL** (algo como `https://abcd1234.supabase.co`)
   - a chave **publishable** (ou **anon public**)

Essas duas informações são públicas por natureza: o banco é protegido pelas regras de segurança do `schema.sql`, não pela chave.

## 2. GitHub (colocar o site no ar)

1. Crie uma conta em github.com, se ainda não tiver.
2. Toque em **+** → **New repository**. Nome: `nos`. Deixe **Public**. Crie sem README.
3. Depois que os arquivos estiverem lá: **Settings** → **Pages** → em **Branch**, escolha `main` e pasta `/ (root)` → **Save**.
4. Em 1 ou 2 minutos o app fica em `https://SEU-USUARIO.github.io/nos/`.

## 3. Spotify (aba de música)

Precisa da conta Premium (a sua).

1. Entre em developer.spotify.com/dashboard com sua conta do Spotify.
2. **Create app**:
   - App name: `nós`
   - App description: `app do casal`
   - Redirect URI: `https://SEU-USUARIO.github.io/nos/` (exatamente assim, com a barra no final) → toque em **Add**
   - Marque **Web API** e aceite os termos → **Save**.
3. Na página do app, copie o **Client ID**.
4. Aba **User Management** → adicione a conta dela: nome e o e-mail que ela usa no Spotify. Sem isso o Spotify bloqueia a conta dela no app.

## 4. Juntar tudo

Coloque a URL, a chave e o Client ID no arquivo `config.js`:

```js
window.NOS_CONFIG = {
  SUPABASE_URL: 'https://abcd1234.supabase.co',
  SUPABASE_KEY: 'sb_publishable_...',
  SPOTIFY_CLIENT_ID: '1a2b3c...',
};
```

Enquanto `SUPABASE_URL` estiver vazio, o app abre em modo demonstração.

## 5. Instalar nos celulares

- **iPhone:** abra o link no **Safari** → botão de compartilhar → **Adicionar à Tela de Início**.
- **Android:** abra o link no **Chrome** → três pontinhos → **Instalar app**.

Depois: cada um cria a conta com seu @, um procura o outro na tela "Encontre seu amor" e manda o pedido. Quando o outro aceitar, dá match.

## Atualizações

Quando o app mudar, aumente o número em `VERSION` no `sw.js` (ex.: `nos-v2`). Os celulares pegam a versão nova sozinhos na próxima vez que abrirem o app.

## Limites do plano grátis

- Supabase: 1 GB de arquivos e 50 MB por arquivo. Fotos são comprimidas pelo app (umas 300–600 KB cada). Vídeos longos ocupam bastante.
- Um projeto grátis do Supabase pausa depois de 7 dias **sem nenhum uso**. Se vocês usarem o app, isso não acontece. Se pausar, é só entrar no painel e tocar em **Restore**.
- Spotify: tocar música direto pelo app ("Ouvir junto") precisa de Premium na conta de quem vai ouvir e do Spotify aberto no celular. Sem isso, o app abre a música no Spotify.
