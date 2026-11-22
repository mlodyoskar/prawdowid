import type { ImageInput } from '@prawdowid/contracts';

import { ApiError, send } from './api.ts';

/** A reply from the channel, exactly the text the real WhatsApp channel would send. */
export type DemoReply = { id: number; text: string; sentAt: string };

const BASE = '/api/demo/whatsapp/messages';

/** A random id standing in for the phone number. Never a real number. */
export function newSessionId(): string {
  return crypto.randomUUID();
}

/** POST: hands the message to the same channel logic as the WhatsApp webhook. */
export async function sendDemoMessage(body: {
  sessionId: string;
  text?: string;
  image?: ImageInput;
}): Promise<void> {
  await send(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function isReply(v: unknown): v is DemoReply {
  if (typeof v !== 'object' || v === null) return false;
  return (
    typeof Reflect.get(v, 'id') === 'number' &&
    typeof Reflect.get(v, 'text') === 'string' &&
    typeof Reflect.get(v, 'sentAt') === 'string'
  );
}

/** GET: replies newer than `after` and whether the channel shows "pisze…". */
export async function readDemoReplies(
  sessionId: string,
  after: number,
  signal?: AbortSignal,
): Promise<{ messages: DemoReply[]; typing: boolean }> {
  const qs = new URLSearchParams({ sessionId, after: String(after) });
  const res = await send(`${BASE}?${qs}`, { signal });
  const body: unknown = await res.json().catch(() => null);
  const messages: unknown = typeof body === 'object' && body ? Reflect.get(body, 'messages') : null;
  if (!Array.isArray(messages) || !messages.every(isReply)) {
    throw new ApiError('Usługa zwróciła nieoczekiwaną odpowiedź.', res.status, 'bad_response');
  }
  return { messages, typing: Reflect.get(body as object, 'typing') === true };
}

/** DELETE: clears the stored replies of this conversation. */
export async function clearDemoConversation(sessionId: string): Promise<void> {
  await send(`${BASE}?${new URLSearchParams({ sessionId })}`, { method: 'DELETE' });
}
