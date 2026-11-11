import { renderTemplate } from '../notifications/notification-types';

const PLACEHOLDER_RE = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
const LOOSE_BRACES_RE = /\{\{|\}\}/g;

export function findPlaceholders(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(PLACEHOLDER_RE)) found.add(match[1]);
  return [...found];
}

export function findInvalidPlaceholders(
  text: string,
  allowed: readonly string[],
): string[] {
  const invalid = findPlaceholders(text).filter(
    (key) => !allowed.includes(key),
  );
  const stripped = text.replace(PLACEHOLDER_RE, '');
  if (LOOSE_BRACES_RE.test(stripped)) invalid.push('{{');
  return [...new Set(invalid)];
}

const SAMPLE_VALUES: Record<string, string> = {
  projectName: 'Midnight Sketch',
  inviterName: 'Alex',
  userName: 'Alex',
  authorName: 'Alex',
  permissionLabel: 'Edit',
  reason: 'Violation of the community policy',
  email: 'name@example.com',
};

export function sampleValues(placeholders: readonly string[]) {
  const values: Record<string, string> = {};
  for (const key of placeholders) values[key] = SAMPLE_VALUES[key] ?? key;
  return values;
}

export function renderPreview(
  subject: string,
  body: string,
  placeholders: readonly string[],
): { subject: string; body: string } {
  const values = sampleValues(placeholders);
  return {
    subject: renderTemplate(subject, values),
    body: renderTemplate(body, values),
  };
}
