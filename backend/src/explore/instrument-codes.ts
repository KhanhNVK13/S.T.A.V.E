import {
  DRUM_KIT_INSTRUMENT_NAME,
  ORCHESTRA_KIT_INSTRUMENT_NAME,
} from '@stave/shared-types';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

const DRUM_KITS = new Set<string>([
  DRUM_KIT_INSTRUMENT_NAME,
  ORCHESTRA_KIT_INSTRUMENT_NAME,
]);

/**
 * Every spelling a snapshot may store for one General MIDI instrument: the GM
 * display name itself plus the code form derived from it. Callers must pass a
 * name that already passed the GM allow-list.
 */
export function instrumentStoredForms(gmName: string): string[] {
  const forms = new Set<string>([gmName]);
  const code = slugify(gmName);
  forms.add(code);
  if (/-/.test(gmName)) forms.add(slugify(gmName.replace(/-/g, '')));
  if (DRUM_KITS.has(gmName)) forms.add(code.replace('_drum_', '_'));
  return [...forms];
}
