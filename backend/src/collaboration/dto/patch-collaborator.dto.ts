import { IsIn } from 'class-validator';

/** UC-61: change a collaborator's permission level (owner only). */
export class PatchCollaboratorDto {
  @IsIn(['view', 'edit'], {
    message: 'Permission level must be "view" or "edit"',
  })
  permissionLevel!: 'view' | 'edit';
}
