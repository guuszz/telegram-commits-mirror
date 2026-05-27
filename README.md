<h1 align="center">🤖 telegram-commits-mirror</h1>

<p align="center">
  <b>Bot que reposta seus commits do GitHub num chat/canal do Telegram.</b><br/>
  <sub>Webhook do GitHub → Vercel serverless → Telegram Bot API.</sub>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white"/>
  <img src="https://img.shields.io/badge/Vercel-Serverless-000000?style=flat-square&logo=vercel&logoColor=white"/>
  <img src="https://img.shields.io/badge/grammy-1.x-26A5E4?style=flat-square&logo=telegram&logoColor=white"/>
</p>

---

## 💡 Sobre · About

Quando você dá `git push` num repo seu, esse bot recebe o webhook do GitHub, formata os commits bonitinho e manda pro seu Telegram (chat pessoal ou canal). Útil pra:

- Manter um **devlog automático** do seu trabalho
- Visualizar atividade entre múltiplos repos num lugar só
- Compartilhar progresso com mentores/amigos via canal público
- Histórico cronológico independente do GitHub (busca no Telegram)

> _Mirrors your GitHub commits to a Telegram chat/channel automatically via webhook._

## 🏗️ Arquitetura

```
git push                                                 Telegram chat/canal
   │                                                              ▲
   ▼                                                              │
GitHub webhook (push event)                                       │
   │ HMAC SHA-256 signed                                          │
   ▼                                                              │
api/webhook.ts (Vercel serverless)                                │
   ├── verifySignature() — HMAC SHA-256, timingSafeEqual          │
   ├── formatMessage() — MarkdownV2, máx 5 commits visíveis       │
   └── grammy Bot.api.sendMessage() ────────────────────────────────┘
```

## 🚀 Como configurar (uma vez)

### 1. Cria o bot no Telegram

1. Abre `@BotFather` no Telegram
2. Manda `/newbot`
3. Escolhe um nome (ex: "Meus Commits")
4. Escolhe um username terminando em `_bot` (ex: `guuszz_commits_bot`)
5. Copia o **token** que ele te entrega

### 2. Descobre o chat ID destino

**Pra mandar pra você mesmo (DM):**
1. Manda qualquer mensagem pro bot que você criou
2. Acessa `https://api.telegram.org/bot<TOKEN>/getUpdates`
3. Procura o `"chat":{"id": ...}` — esse é seu chat ID

**Pra mandar pra um canal:**
1. Cria um canal (público ou privado)
2. Adiciona o bot como **admin** com permissão "Post messages"
3. Posta qualquer mensagem no canal
4. Acessa o getUpdates igual acima
5. Chat ID de canal é negativo, tipo `-1001234567890`

### 3. Deploy no Vercel

```bash
git clone https://github.com/guuszz/telegram-commits-mirror
cd telegram-commits-mirror
npm install

# Setup Vercel
npx vercel link
npx vercel env add TELEGRAM_BOT_TOKEN production    # paste o token do BotFather
npx vercel env add TELEGRAM_CHAT_ID production      # paste o chat ID
npx vercel env add GITHUB_WEBHOOK_SECRET production # gera com: openssl rand -hex 32

# Deploy
npx vercel --prod
```

Anota a URL que o Vercel te dá (ex: `https://telegram-commits-mirror.vercel.app`).

### 4. Configura o webhook no GitHub (por repo)

Em cada repo que você quer monitorar:

1. **Settings → Webhooks → Add webhook**
2. **Payload URL:** `https://<sua-url-vercel>/api/webhook`
3. **Content type:** `application/json`
4. **Secret:** mesmo valor que você gerou pra `GITHUB_WEBHOOK_SECRET`
5. **Which events?** Just the `push` event
6. **Active:** ✓
7. Save

Bonus: usar GitHub CLI pra automatizar em massa:

```bash
URL="https://<sua-url>/api/webhook"
SECRET="<seu-secret>"

for repo in $(gh repo list guuszz --limit 100 --json name --jq '.[].name'); do
  gh api -X POST "repos/guuszz/$repo/hooks" \
    -f name=web \
    -F active=true \
    -f events[]=push \
    -f config[url]="$URL" \
    -f config[content_type]=json \
    -f config[secret]="$SECRET"
done
```

## 🧪 Testar localmente

```bash
cp .env.example .env.local
# preenche .env.local com seus valores

npx vercel dev
```

Em outra aba, simula um push payload:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-github-event: ping" \
  -H "x-hub-signature-256: sha256=$(echo -n '{}' | openssl dgst -sha256 -hmac "<seu-secret>" -hex | cut -d' ' -f2)" \
  -d '{}'
```

## 🔒 Segurança

- ✅ HMAC SHA-256 com `timingSafeEqual` previne timing attacks
- ✅ Secret nunca é logado nem retornado em endpoint
- ✅ Token do Telegram só lido de env var (nunca commitado)
- ✅ Bot só envia em 1 chat configurado — usuário malicioso que descubra a URL não consegue spam em outro lugar

## 📋 Variáveis de ambiente

| Var | Obrigatória | Descrição |
|-----|-------------|-----------|
| `TELEGRAM_BOT_TOKEN` | ✅ | Token do bot via @BotFather |
| `TELEGRAM_CHAT_ID` | ✅ | ID do chat/canal destino (negativo para canal) |
| `GITHUB_WEBHOOK_SECRET` | ✅ | Secret do webhook do GitHub (random 32+ bytes hex) |

## 🗺️ Roadmap

- [ ] Suporte a múltiplos chats (mapeamento por repo)
- [ ] Resumo diário/semanal em vez de cada commit
- [ ] Filtro por branch (só `main`, ignorar `wip/*`)
- [ ] Comando `/stats` no bot pra ver totais por repo
- [ ] Webhook signature verification em modo strict (rejeita tudo sem header)

## 📝 Licença

MIT © [Gustavo Oliveira](https://github.com/guuszz)
