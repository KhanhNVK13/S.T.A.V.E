const MAX_RETURN_TO_LENGTH = 500;

export function isSafeReturnTo(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= MAX_RETURN_TO_LENGTH &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !value.includes('://') &&
    !hasControlCharacter(value)
  );
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
