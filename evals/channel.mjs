import { createHmac } from 'node:crypto';

import { WhatsAppChannel } from '../apps/api/src/whatsapp/webhook.ts';
export async function channelCheck(input, checkId, verify) {
  let received;
  const replies = [];
  const channel = new WhatsAppChannel({
    appSecret: 'eval',
    verifyToken: 'eval',
    webOrigin: 'https://ui.invalid',
    llmConfigured: true,
    ratePerMinute: 10,
    log: () => {},
    graph: {
      sendText: async (_to, text) => {
        replies.push(text);
        return { ok: true };
      },
      downloadImage: async () => ({ ok: true, value: input.image }),
    },
    runner: {
      enqueue(value) {
        received = value;
        return { checkId };
      },
      delete: () => false,
    },
  });
  const msg = input.image
    ? { type: 'image', image: { id: 'fixture', caption: input.text } }
    : { type: 'text', text: { body: input.text } };
  const body = JSON.stringify({
    entry: [{ changes: [{ value: { messages: [{ ...msg, from: 'eval', id: checkId }] } }] }],
  });
  const response = await channel.routes().request('/', {
    method: 'POST',
    body,
    headers: {
      'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'eval').update(body).digest('hex'),
    },
  });
  await channel.idle();
  if (response.status !== 200 || !received) throw new Error('Webhook rejected case ' + checkId);
  const result = await verify(received);
  channel.onCheckDone(checkId, result.response);
  await channel.idle();
  if (replies.length !== 2) throw new Error('Missing final WhatsApp response');
  return { ...result, reply: replies[1] };
}
