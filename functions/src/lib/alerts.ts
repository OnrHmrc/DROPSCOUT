// ─────────────────────────────────────────────────────────
// DropScout TR — Alert webhook (Slack/Discord)
// Secret: ALERT_WEBHOOK_URL (Slack Incoming Webhook veya Discord Webhook).
// URL'den format otomatik algilanir. Secret yoksa no-op.
// ─────────────────────────────────────────────────────────

import { defineSecret } from 'firebase-functions/params';

export const ALERT_WEBHOOK_URL = defineSecret('ALERT_WEBHOOK_URL');

export type AlertLevel = 'info' | 'warn' | 'error';

export interface AlertPayload {
  title: string;
  message: string;
  level?: AlertLevel;
  context?: Record<string, unknown>;
}

function detectProvider(url: string): 'slack' | 'discord' | 'generic' {
  if (url.includes('hooks.slack.com')) return 'slack';
  if (url.includes('discord.com/api/webhooks') || url.includes('discordapp.com/api/webhooks')) return 'discord';
  return 'generic';
}

function levelEmoji(level: AlertLevel): string {
  if (level === 'error') return '🚨';
  if (level === 'warn') return '⚠️';
  return 'ℹ️';
}

function buildSlackBody(p: AlertPayload): string {
  const emoji = levelEmoji(p.level || 'info');
  const lines = [
    `${emoji} *${p.title}*`,
    p.message
  ];
  if (p.context && Object.keys(p.context).length) {
    lines.push('```' + JSON.stringify(p.context, null, 2) + '```');
  }
  return JSON.stringify({ text: lines.join('\n') });
}

function buildDiscordBody(p: AlertPayload): string {
  const emoji = levelEmoji(p.level || 'info');
  const color = p.level === 'error' ? 0xef4444 : p.level === 'warn' ? 0xf59e0b : 0x3b82f6;
  const fields = p.context
    ? Object.entries(p.context).slice(0, 25).map(([name, value]) => ({
        name: String(name).slice(0, 256),
        value: '```' + String(typeof value === 'object' ? JSON.stringify(value) : value).slice(0, 1000) + '```',
        inline: false
      }))
    : [];
  return JSON.stringify({
    username: 'DropScout Alerts',
    embeds: [{
      title: `${emoji} ${p.title}`.slice(0, 256),
      description: p.message.slice(0, 4000),
      color,
      fields,
      timestamp: new Date().toISOString()
    }]
  });
}

function buildGenericBody(p: AlertPayload): string {
  return JSON.stringify({
    level: p.level || 'info',
    title: p.title,
    message: p.message,
    context: p.context,
    timestamp: new Date().toISOString(),
    source: 'dropscout-functions'
  });
}

/**
 * Webhook'a alert gonder. ALERT_WEBHOOK_URL yoksa no-op.
 * Gonderimi bloklamaz — hata olursa log'a dusurur.
 */
export async function postAlert(payload: AlertPayload): Promise<void> {
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!url) return;

  const provider = detectProvider(url);
  const body = provider === 'slack'
    ? buildSlackBody(payload)
    : provider === 'discord'
    ? buildDiscordBody(payload)
    : buildGenericBody(payload);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) {
      console.warn('[postAlert] webhook non-2xx', { status: res.status, provider });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    console.warn('[postAlert] webhook failed', { error: msg, provider });
  }
}
