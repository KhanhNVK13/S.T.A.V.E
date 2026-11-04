import {
  Allow,
  IsArray,
  IsUUID,
  IsNotEmpty,
  IsOptional,
  IsObject,
  ValidateNested,
  IsNumber,
  IsString,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  sanitizeTrackName,
  TRACK_NAME_MAX_LENGTH,
} from '../../common/utils/sanitize-track-name.util';

/**
 * Mọi trường của track phải được khai (`@Allow`) vì `whitelist: true` xoá âm
 * thầm trường không có decorator trong đối tượng lồng.
 */
export class SwitchBranchTrackDto {
  @Allow()
  id?: string;

  @Transform(({ value }: { value: unknown }) => sanitizeTrackName(value))
  @IsString()
  @MaxLength(TRACK_NAME_MAX_LENGTH)
  name!: string;

  @Allow()
  order!: number;

  @Allow()
  color!: string;

  @Allow()
  volume!: number;

  @Allow()
  pan!: number;

  @Allow()
  muted?: boolean;

  @Allow()
  solo?: boolean;

  @Allow()
  isMuted?: boolean;

  @Allow()
  isSolo?: boolean;

  @Allow()
  instrument?: string | null;

  @Allow()
  soundMap?: unknown;
}

/**
 * Draft snapshot structure for switching branches
 */
export class DraftSnapshotDto {
  @IsOptional()
  @IsNumber()
  schemaVersion?: number;

  @IsOptional()
  @IsObject()
  meta?: {
    tempo: number;
    timeSignature: [number, number];
    ppq: number;
  };

  /**
   * Tên trường phải khớp ĐÚNG `DraftTrack` ở `@stave/shared-types` (`muted` /
   * `solo`). Bản trước khai `isMuted`/`isSolo` — không tồn tại trong snapshot
   * thật, nên mọi track bị tắt tiếng/solo đều âm thầm bị reset về false khi
   * chuyển nhánh. `isMuted`/`isSolo` giữ lại chỉ để không vỡ payload cũ.
   */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SwitchBranchTrackDto)
  tracks?: SwitchBranchTrackDto[];

  @IsOptional()
  notes?: Array<{
    id?: string;
    trackId: string;
    pitch: number;
    startTime: number;
    start?: number;
    duration: number;
    velocity: number;
  }>;
}

/**
 * UC-48: Switch Active Branch DTO
 *
 * Business Rules:
 * - BR-50: Save current draft before switching, restore target branch draft
 */
export class SwitchBranchDto {
  @IsNotEmpty({ message: 'Current branch ID is required' })
  @IsUUID('4', { message: 'Current branch ID must be a valid UUID' })
  currentBranchId!: string;

  @IsNotEmpty({ message: 'Target branch ID is required' })
  @IsUUID('4', { message: 'Target branch ID must be a valid UUID' })
  targetBranchId!: string;

  /**
   * Current draft snapshot from the branch being switched away from — saved
   * before switching. Required (not optional): CLAUDE.md §4.2 requires
   * "chuyển branch = lưu draft cũ" unconditionally, so the server can't allow
   * a client to silently skip sending it and lose unsaved edits.
   */
  @IsNotEmpty({ message: 'Current draft is required when switching branches' })
  @ValidateNested()
  @Type(() => DraftSnapshotDto)
  currentDraft!: DraftSnapshotDto;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  expectedDraftVersion?: string;
}
