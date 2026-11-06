import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class CommitMessageDto {
  @IsUUID('4')
  projectId!: string;

  @IsOptional()
  @IsUUID('4')
  branchId?: string;

  @IsOptional()
  @IsIn(['en', 'vi'])
  lang?: 'en' | 'vi';
}
