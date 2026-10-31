import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * UC-67 — wire shape of one note. This is the class-validator mirror of
 * `JamNoteDto` from shared-types (which is a plain interface, so the socket
 * payload has no runtime decorators of its own). Constraints encode BR-71:
 * midi 0–127, startTick >= 0, durationTicks >= 1 (integer tick),
 * velocity 1–127. Every field carries a decorator — with the global
 * `whitelist: true` pipe, an unadorned field would be silently dropped.
 */
export class EditJamNoteDto {
  /** The note's own UUID (stable across all edits, CLAUDE.md §4.1). */
  @IsUUID()
  id: string;

  /** Must reference a track present in the room's snapshot (7.E2). */
  @IsUUID()
  trackId: string;

  /** MIDI pitch, 0–127 (BR-71 / 7.E1). */
  @IsInt()
  @Min(0)
  @Max(127)
  midi: number;

  /** Start in integer ticks, >= 0 (BR-71 / 7.E1). */
  @IsInt()
  @Min(0)
  startTick: number;

  /** Duration in integer ticks, >= 1 (BR-71 / 7.E1). */
  @IsInt()
  @Min(1)
  durationTicks: number;

  /** MIDI velocity, 1–127 (BR-71 / 7.E1). */
  @IsInt()
  @Min(1)
  @Max(127)
  velocity: number;
}

/**
 * Inbound `jam:edit_note` (alias `jam:edit`). The gateway validates the whole
 * object through the global ValidationPipe (whitelist + transform) before it
 * reaches the service, so a malformed note rejects here, not in the room.
 */
export class EditJamNoteRequestDto {
  /** The event id of the room the socket is in. */
  @IsUUID()
  jamId: string;

  /** `add` / `update` / `delete` — which LWW op to apply (8.E1). */
  @IsIn(['add', 'update', 'delete'])
  action: 'add' | 'update' | 'delete';

  /** The note to add / update / remove. */
  @ValidateNested()
  @Type(() => EditJamNoteDto)
  note: EditJamNoteDto;

  /** Client clock (ms) — logged only; LWW ranks by the SERVER timestamp. */
  @IsNumber()
  clientTimestamp: number;
}
