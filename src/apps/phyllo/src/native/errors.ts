import type { NativeErrorCode, NativeErrorPayload } from './types';

const CODES: ReadonlySet<string> = new Set<NativeErrorCode>([
  'not_found',
  'io',
  'json',
  'invalid_format',
  'invalid_argument',
  'trash',
  'watch',
  'midi',
  'osc',
  'internal',
  'unknown',
]);

/** Every native failure surfaces as this class, whichever implementation produced it. */
export class NativeError extends Error {
  readonly code: NativeErrorCode;

  constructor(code: NativeErrorCode, message: string) {
    super(message);
    this.name = 'NativeError';
    this.code = code;
  }
}

function isPayload(value: unknown): value is NativeErrorPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.code === 'string' && CODES.has(v.code) && typeof v.message === 'string';
}

/** Turn whatever `invoke` rejected with (`{ code, message }` from Rust, a string, an Error) into a `NativeError`. */
export function toNativeError(err: unknown): NativeError {
  if (err instanceof NativeError) return err;
  if (isPayload(err)) return new NativeError(err.code, err.message);
  if (typeof err === 'string') return new NativeError('unknown', err);
  if (err instanceof Error) return new NativeError('unknown', err.message);
  return new NativeError('unknown', 'Unknown native error');
}

export function isNativeError(err: unknown, code?: NativeErrorCode): err is NativeError {
  return err instanceof NativeError && (code === undefined || err.code === code);
}
