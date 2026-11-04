import type { ConflictChoice, MergeConflictResult } from "../../lib/api-client";

export type ConflictChoices = Record<string, ConflictChoice>;

const REMEMBERED_MAX = 12;
const remembered = new Map<string, ConflictChoices>();

export function conflictNoteIds(result: MergeConflictResult): string[] {
  return Object.values(result.conflictsByBar).flatMap((list) => list.map((c) => c.noteId));
}

export function conflictSignature(result: MergeConflictResult, sourceName: string, targetName: string): string {
  return `${sourceName}\u0000${targetName}\u0000${conflictNoteIds(result).sort().join(",")}`;
}

export function initialChoices(result: MergeConflictResult, signature: string): ConflictChoices {
  const saved = remembered.get(signature);
  const choices: ConflictChoices = {};
  for (const id of conflictNoteIds(result)) choices[id] = saved?.[id] ?? "PICK_TARGET";
  return choices;
}

export function rememberChoices(signature: string, choices: ConflictChoices): void {
  remembered.delete(signature);
  remembered.set(signature, { ...choices });
  while (remembered.size > REMEMBERED_MAX) {
    const oldest = remembered.keys().next().value;
    if (oldest === undefined) break;
    remembered.delete(oldest);
  }
}

export function forgetChoices(signature: string): void {
  remembered.delete(signature);
}

export function tallyChoices(choices: ConflictChoices): { ours: number; theirs: number } {
  let ours = 0;
  let theirs = 0;
  for (const c of Object.values(choices)) {
    if (c === "PICK_SOURCE") theirs += 1;
    else ours += 1;
  }
  return { ours, theirs };
}
