import { NativeError } from './errors';
import { BROADCAST_EVENT_PREFIX } from './types';

const CHANNEL = /^[A-Za-z0-9_-]{1,64}$/;

/** `broadcast://<channel>`; rejects `invalid_argument` for names Tauri event names can't carry. */
export function broadcastEventName(channel: string): string {
  if (!CHANNEL.test(channel)) {
    throw new NativeError('invalid_argument', `invalid broadcast channel "${channel}" (use letters, digits, - and _)`);
  }
  return `${BROADCAST_EVENT_PREFIX}${channel}`;
}

/** What travels on a broadcast event: the sender's window label lets receivers skip their own messages. */
export interface BroadcastEnvelope {
  source: string;
  payload: unknown;
}

export function isEnvelope(value: unknown): value is BroadcastEnvelope {
  return typeof value === 'object' && value !== null && typeof (value as { source?: unknown }).source === 'string';
}
