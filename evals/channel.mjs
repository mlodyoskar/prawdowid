import { createHmac } from 'node:crypto';

import { WhatsAppChannel, metaWebhookRoutes } from '../apps/api/src/whatsapp/webhook.ts';

/** Sprawdzenie jak z formularza WWW: zgłoszenie do runnera i oczekiwanie na wynik. */
export function directCheck(input, { runner, onDone }) {
  return new Promise((resolve, reject) => {
    const job = runner.enqueue(input);
    if (!job) return reject(new Error('Runner rejected the check'));
    onDone(job.checkId, resolve);
  });
}

/** Sprawdzenie przez podpisany webhook WhatsApp i ten sam runner. Zwraca też faktyczną odpowiedź. */
export async function channelCheck(input, { runner, onDone }) {
  let result;
  const replies = [];
  const channel = new WhatsAppChannel({
    webOrigin: 'https://ui.invalid',
    llmConfigured: true,
    ratePerMinute: 10,
    log: () => {},
    transport: {
      sendText: async (_to, text) => {
        replies.push(text);
        return { ok: true };
      },
      // „pisze…” zamiast wiadomości „Sprawdzam…”: jedyna odpowiedź to wynik.
      markReadTyping: async () => ({ ok: true }),
      downloadImage: async () => ({ ok: true, value: input.image }),
    },
    runner: {
      enqueue(value) {
        const job = runner.enqueue(value);
        if (job)
          onDone(job.checkId, (r) => {
            result = r;
            channel.onCheckDone(job.checkId, r.response);
          });
        return job;
      },
      delete: (id) => runner.delete(id),
    },
  });
  const msg = input.image
    ? { type: 'image', image: { id: 'fixture', caption: input.text } }
    : { type: 'text', text: { body: input.text } };
  const id = Math.random().toString(36).slice(2);
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ ...msg, from: 'eval', id }] } }] }],
  });
  const routes = metaWebhookRoutes(channel, {
    appSecret: 'eval',
    verifyToken: 'eval',
    log: () => {},
  });
  const response = await routes.request('/', {
    method: 'POST',
    body,
    headers: {
      'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'eval').update(body).digest('hex'),
    },
  });
  if (response.status !== 200) throw new Error('Webhook rejected the check');
  const deadline = Date.now() + 120_000;
  const finished = () => replies.length >= 1 && result !== undefined;
  while (!finished()) {
    if (Date.now() > deadline) throw new Error('Missing final WhatsApp response');
    await new Promise((r) => setTimeout(r, 50));
    await channel.idle();
  }
  return { ...result, reply: replies.at(-1) };
}
