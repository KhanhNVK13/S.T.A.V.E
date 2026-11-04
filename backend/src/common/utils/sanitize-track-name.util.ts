export const TRACK_NAME_MAX_LENGTH = 50;

const UNSAFE_CHARS =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u001F\u007F-\u009F\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function sanitizeTrackName(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(UNSAFE_CHARS, '') : value;
}
