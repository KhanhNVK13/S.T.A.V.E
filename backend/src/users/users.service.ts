import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { UpdateProfileDto } from './dto/update-profile.dto';
import type { UserRow } from './user-row.type';

@Injectable()
export class UsersService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /** UC-14 */
  async getProfile(userId: string): Promise<UserRow> {
    const { data, error } = await this.supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .maybeSingle<UserRow>();

    if (error || !data) throw new NotFoundException('Profile not found');
    return data;
  }

  /** UC-15 */
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserRow> {
    const patch: Record<string, string> = {};
    if (dto.displayName !== undefined) patch.display_name = dto.displayName;
    if (dto.username !== undefined) patch.username = dto.username;
    if (dto.bio !== undefined) patch.bio = dto.bio;
    if (dto.avatarUrl !== undefined) patch.avatar_url = dto.avatarUrl;

    const { data, error } = await this.supabase
      .from('users')
      .update(patch)
      .eq('id', userId)
      .select('*')
      .single<UserRow>();

    if (error) {
      if (error.code === '23505') {
        throw new BadRequestException('Username already taken');
      }
      throw new BadRequestException('Could not update profile');
    }
    return data;
  }
}
