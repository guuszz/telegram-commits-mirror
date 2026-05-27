import type { VercelRequest, VercelResponse } from '@vercel/node';
import crypto from 'node:crypto';
import { Bot } from 'grammy';

// ─── Env vars obrigatórias ───────────────────────────────────────────
// TELEGRAM_BOT_TOKEN — obtém via @BotFather no Telegram
// TELEGRAM_CHAT_ID   — ID do chat/canal pra onde mandar (negativo pra canal)
// GITHUB_WEBHOOK_SECRET — string secreta usada pra validar assinatura HMAC

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;

// ─── Tipos do payload de push do GitHub (subset) ─────────────────────
interface PushCommit {
  id: string;
  message: string;
  url: string;
  author: { name: string; email?: string };
  added: string[];
  modified: string[];
  removed: string[];
}

interface PushPayload {
  ref: string;
  before: string;
  after: string;
  pusher: { name: string };
  repository: {
    name: string;
    full_name: string;
    html_url: string;
    private: boolean;
  };
  commits: PushCommit[];
  forced?: boolean;
  deleted?: boolean;
}

// ─── Verifica assinatura HMAC SHA-256 do GitHub ──────────────────────
function verifySignature(payload: string, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader) return false;
  const expected =
    'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
  // timingSafeEqual previne timing attacks
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Escape de caracteres reservados do MarkdownV2 do Telegram ──────
function escapeMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

// ─── Formata a mensagem que vai pro Telegram ─────────────────────────
function formatMessage(payload: PushPayload): string {
  const branch = payload.ref.replace('refs/heads/', '');
  const repo = payload.repository.full_name;
  const repoUrl = payload.repository.html_url;
  const pusher = payload.pusher.name;
  const count = payload.commits.length;

  // Header
  const header = `📦 *${escapeMd(repo)}* · _${escapeMd(branch)}_`;
  const subhead = `${escapeMd(pusher)} pushed ${count} ${count === 1 ? 'commit' : 'commits'}`;

  // Lista de commits (max 5 — evita explodir limit de 4096 chars do Telegram)
  const MAX_COMMITS_SHOWN = 5;
  const shown = payload.commits.slice(0, MAX_COMMITS_SHOWN);
  const lines = shown.map((c) => {
    const shortSha = c.id.slice(0, 7);
    // Mostra só primeira linha do commit message
    const firstLine = c.message.split('\n')[0].slice(0, 80);
    return `• [\`${shortSha}\`](${c.url}) ${escapeMd(firstLine)}`;
  });

  // Se houver mais commits, indica
  const overflow =
    payload.commits.length > MAX_COMMITS_SHOWN
      ? `\n_\\.\\.\\. e mais ${payload.commits.length - MAX_COMMITS_SHOWN} commits_`
      : '';

  const footer = `\n[Ver no GitHub →](${repoUrl}/compare/${payload.before.slice(0, 7)}\\.\\.\\.${payload.after.slice(0, 7)})`;

  return `${header}\n_${subhead}_\n\n${lines.join('\n')}${overflow}${footer}`;
}

// ─── Handler ─────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Saúde: GET retorna 200 com info
  if (req.method === 'GET') {
    return res.status(200).json({
      service: 'telegram-commits-mirror',
      status: 'ok',
      configured: {
        BOT_TOKEN: !!BOT_TOKEN,
        CHAT_ID: !!CHAT_ID,
        WEBHOOK_SECRET: !!WEBHOOK_SECRET,
      },
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!BOT_TOKEN || !CHAT_ID || !WEBHOOK_SECRET) {
    console.error('[webhook] env vars faltando');
    return res.status(500).json({ error: 'Servidor mal configurado' });
  }

  // GitHub manda assinatura em x-hub-signature-256
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const rawBody = JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature, WEBHOOK_SECRET)) {
    console.warn('[webhook] assinatura inválida');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  // GitHub manda tipo do evento em x-github-event
  const event = req.headers['x-github-event'] as string | undefined;

  // ping: GitHub envia ao adicionar o webhook — confirma que tá vivo
  if (event === 'ping') {
    return res.status(200).json({ pong: true });
  }

  // Filtra só push events
  if (event !== 'push') {
    return res.status(200).json({ ignored: event });
  }

  const payload = req.body as PushPayload;

  // Ignora branches deletadas, force pushes (opcional — você pode querer ver),
  // e pushes que não tenham commits (ex: tag push sem commits)
  if (payload.deleted || !payload.commits || payload.commits.length === 0) {
    return res.status(200).json({ ignored: 'empty or deleted' });
  }

  try {
    const bot = new Bot(BOT_TOKEN);
    const message = formatMessage(payload);

    await bot.api.sendMessage(CHAT_ID, message, {
      parse_mode: 'MarkdownV2',
      link_preview_options: { is_disabled: true },
    });

    return res.status(200).json({ sent: true, commits: payload.commits.length });
  } catch (err) {
    console.error('[webhook] erro ao enviar pro Telegram:', err);
    return res.status(500).json({
      error: 'Erro ao enviar pro Telegram',
      message: err instanceof Error ? err.message : 'unknown',
    });
  }
}
