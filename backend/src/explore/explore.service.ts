import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { PublicProjectsQueryDto } from '../projects/dto/public-projects-query.dto';
import type { PublicUserProfile } from '../users/dto/public-user-profile.dto';

export interface PublicProjectCard {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  visibility: 'public';
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  play_count: number;
  fork_count: number;
  like_count: number;
  owner: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  tags: string[];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export interface RankingsResult {
  trending: PublicProjectCard[];
  top_forked: PublicProjectCard[];
  top_played: PublicProjectCard[];
}

export interface FeaturedResult {
  hero: {
    title: string;
    subtitle: string;
    cta_primary: { label: string; href: string };
    cta_secondary: { label: string; href: string };
  };
  featured_projects: PublicProjectCard[];
  trending_projects: PublicProjectCard[];
  stats: {
    total_projects: number;
    total_users: number;
    total_forks: number;
  };
}

@Injectable()
export class ExploreService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /** UC-08: List public projects with pagination and filters. */
  async listPublicProjects(
    query: PublicProjectsQueryDto,
  ): Promise<PaginatedResult<PublicProjectCard>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const offset = (page - 1) * limit;

    let queryBuilder = this.supabase
      .from('projects')
      .select(
        `id, name, description, genre, visibility, archived_at, created_at, updated_at, play_count,
         owner:owner_id (id, username, display_name, avatar_url)`,
        { count: 'exact' },
      )
      .eq('visibility', 'public')
      .range(offset, offset + limit - 1);

    // Apply genre filter
    if (query.genre) {
      queryBuilder = queryBuilder.ilike('genre', `%${query.genre}%`);
    }

    // Apply sort
    switch (query.sort) {
      case 'popular':
      case 'most_played':
        queryBuilder = queryBuilder.order('play_count', { ascending: false });
        break;
      case 'newest':
      default:
        queryBuilder = queryBuilder.order('created_at', { ascending: false });
    }

    const { data, error, count } = await queryBuilder;

    if (error) {
      throw new InternalServerErrorException('Could not list public projects');
    }

    const total = count ?? 0;
    const items = await this.enrichProjectCards(data ?? []);

    return {
      items,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
    };
  }

  /** UC-09: Get single public project detail. */
  async getPublicProject(id: string): Promise<PublicProjectCard> {
    const { data, error } = await this.supabase
      .from('projects')
      .select(
        `id, name, description, genre, visibility, archived_at, created_at, updated_at, play_count,
         owner:owner_id (id, username, display_name, avatar_url)`,
      )
      .eq('id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .maybeSingle();

    if (error || !data) {
      throw new NotFoundException('Project not found');
    }

    // Increment play_count (best effort, don't fail the request)
    try {
      await this.supabase
        .from('projects')
        .update({ play_count: (data.play_count ?? 0) + 1 })
        .eq('id', id);
    } catch {
      // Silently fail — view count increment is not critical
    }

    const cards = await this.enrichProjectCards([data]);
    return cards[0];
  }

  /** UC-10: Get public user profile with stats. */
  async getPublicUserProfile(id: string): Promise<PublicUserProfile> {
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url, bio, created_at')
      .eq('id', id)
      .maybeSingle<{
        id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
        bio: string | null;
        created_at: string;
      }>();

    if (userError || !user) {
      throw new NotFoundException('User not found');
    }

    // Get total public projects count
    const { count: totalProjects } = await this.supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .eq('owner_id', id)
      .eq('visibility', 'public')
      .is('archived_at', null);

    // Get total forks (projects forked from any of their public projects)
    const { count: totalForks } = await this.supabase
      .from('projects')
      .select('id', { count: 'exact', head: true })
      .not('forked_from_project_id', 'is', null)
      .is('archived_at', null)
      .in('forked_from_project_id', []);

    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      bio: user.bio,
      created_at: user.created_at,
      total_public_projects: totalProjects ?? 0,
      total_forks: totalForks ?? 0,
    };
  }

  /** UC-10: List public projects of a specific user. */
  async getUserPublicProjects(id: string): Promise<PublicProjectCard[]> {
    const { data, error } = await this.supabase
      .from('projects')
      .select(
        `id, name, description, genre, visibility, archived_at, created_at, updated_at, play_count,
         owner:owner_id (id, username, display_name, avatar_url)`,
      )
      .eq('owner_id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException('Could not list user projects');
    }

    return this.enrichProjectCards(data ?? []);
  }

  /** UC-11: Get rankings. Sorted by play_count. */
  async getRankings(): Promise<PublicProjectCard[]> {
    const limit = 10;
    const queryBuilder = this.supabase
      .from('projects')
      .select(
        `id, name, description, genre, visibility, archived_at, created_at, updated_at, play_count,
         owner:owner_id (id, username, display_name, avatar_url)`,
      )
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .order('play_count', { ascending: false })
      .limit(limit);

    const { data, error } = await queryBuilder;

    if (error) {
      throw new InternalServerErrorException('Could not get rankings');
    }

    return this.enrichProjectCards(data ?? []);
  }

  /** UC-12: Featured content for landing page. */
  async getFeatured(): Promise<FeaturedResult> {
    const hero = {
      title: 'Sáng tác nhạc theo phong cách của bạn',
      subtitle:
        'Nền tảng quản lý phiên bản cho dự án MIDI. Lưu trữ, phân nhánh, so sánh và hợp nhất các bản nhạc của bạn như cách Git quản lý mã nguồn.',
      cta_primary: { label: 'Bắt đầu sáng tạo', href: '/register' },
      cta_secondary: { label: 'Khám phá dự án', href: '/explore' },
    };

    // Get featured projects: 6 recent public projects
    const { data: featuredData } = await this.supabase
      .from('projects')
      .select(
        `id, name, description, genre, visibility, archived_at, created_at, updated_at, play_count,
         owner:owner_id (id, username, display_name, avatar_url)`,
      )
      .eq('visibility', 'public')
      .order('created_at', { ascending: false })
      .limit(6);

    // Get trending projects: 6 projects with most plays
    const { data: trendingData } = await this.supabase
      .from('projects')
      .select(
        `id, name, description, genre, visibility, archived_at, created_at, updated_at, play_count,
         owner:owner_id (id, username, display_name, avatar_url)`,
      )
      .eq('visibility', 'public')
      .order('play_count', { ascending: false })
      .limit(6);

    // Get stats (only visibility='public')
    const [
      { count: totalProjects },
      { count: totalUsers },
      { count: totalForks },
    ] = await Promise.all([
      this.supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('visibility', 'public'),
      this.supabase.from('users').select('id', { count: 'exact', head: true }),
      this.supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .not('forked_from_project_id', 'is', null),
    ]);

    const featuredProjects = await this.enrichProjectCards(featuredData ?? []);
    const trendingProjects = await this.enrichProjectCards(trendingData ?? []);

    return {
      hero,
      featured_projects: featuredProjects,
      trending_projects: trendingProjects,
      stats: {
        total_projects: totalProjects ?? 0,
        total_users: totalUsers ?? 0,
        total_forks: totalForks ?? 0,
      },
    };
  }

  /** Enrich raw project data with tags. */
  private async enrichProjectCards(
    projects: Record<string, unknown>[],
  ): Promise<PublicProjectCard[]> {
    if (projects.length === 0) return [];

    const projectIds = projects.map((p) => p['id'] as string);

    // Get tags for these projects (via project_tags junction)
    const { data: projectTags } = await this.supabase
      .from('project_tags')
      .select(`project_id, tag:tag_id (name)`)
      .in('project_id', projectIds);

    const tagsMap = new Map<string, string[]>();
    for (const pt of projectTags ?? []) {
      const pid = pt['project_id'] as string;
      const tag = pt['tag'] as { name: string } | { name: string }[];
      const tagNames = Array.isArray(tag) ? tag.map((t) => t.name) : [tag.name];
      if (!tagsMap.has(pid)) tagsMap.set(pid, []);
      for (const name of tagNames) {
        if (name) tagsMap.get(pid)!.push(name);
      }
    }

    return projects.map((p) => {
      const owner = p['owner'] as Record<string, unknown>;
      return {
        id: p['id'] as string,
        name: p['name'] as string,
        description: p['description'] as string | null,
        genre: p['genre'] as string | null,
        visibility: 'public' as const,
        archived_at: p['archived_at'] as string | null,
        created_at: p['created_at'] as string,
        updated_at: p['updated_at'] as string,
        play_count: p['play_count'] as number,
        fork_count: (p['fork_count'] as number) ?? 0,
        like_count: (p['like_count'] as number) ?? 0,
        owner: {
          id: owner['id'] as string,
          username: owner['username'] as string | null,
          display_name: owner['display_name'] as string | null,
          avatar_url: owner['avatar_url'] as string | null,
        },
        tags: tagsMap.get(p['id'] as string) ?? [],
      };
    });
  }
}
