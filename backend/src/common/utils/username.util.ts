/** Sanitizes the local-part of an email into a candidate username seed. */
export function usernameSeedFromEmail(email: string): string {
  const local = email.split('@')[0] ?? 'user';
  const cleaned = local
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (cleaned || 'user').slice(0, 20);
}

export function randomUsernameSuffix(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
