import { IsOptional, IsUUID } from 'class-validator';

/**
 * UC-70: `POST /ai/commit-message` body.
 *
 * `branchId` chỉ định thêm khi hộp Commit đang mở trên branch KHÁC với
 * branch active (draft nằm trên active branch, nên head của branch kia phải
 * đọc từ DB). Tuỳ chọn: default là so với head của branch active.
 */
export class CommitMessageDto {
  @IsUUID('4')
  projectId!: string;

  @IsOptional()
  @IsUUID('4')
  branchId?: string;
}
