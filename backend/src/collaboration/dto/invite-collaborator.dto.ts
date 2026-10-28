import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

/** UC-60: invite a collaborator (identifier = username or email). */
export class InviteCollaboratorDto {
  @IsString({ message: 'Identifier is required' })
  @MinLength(1, { message: 'Identifier is required' })
  @MaxLength(100, { message: 'Identifier is too long' })
  identifier!: string;

  @IsIn(['view', 'edit'], {
    message: 'Permission level must be "view" or "edit"',
  })
  permissionLevel!: 'view' | 'edit';
}
