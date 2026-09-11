import {
  Inject,
  Injectable,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PublicProjectCard,
  PublicFeaturedContent,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { PublicProjectsQueryDto } from '../projects/dto/public-projects-query.dto';
import type { PublicUserProfile } from '../users/dto/public-user-profile.dto';

export type { PublicProjectCard };
export type RankingType = 'trending' | 'top_forked' | 'top_played';

/**
 * Shape of a raw row returned by `PROJECT_CARD_COLUMNS` selects, before tag/fork enrichment.
 * `projects` has no `fork_count` column — fork counts are computed from
 * `forked_from_project_id` (see `enrichProjectCards`). There is no "likes" feature in the
 * SRS (Report 3) and no backing table for it, so it is not part of this card.
 */
interface ProjectCardRow {
  id: string;
  name: string;
  description: string | null;
  genre: string | null;
  visibility: 'public';
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  play_count: number;
  owner: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  limit: number;
}

export type FeaturedResult = PublicFeaturedContent;

/** Columns shared by every query that returns a `PublicProjectCard` — keep in sync with `ProjectCardRow`. */
const PROJECT_CARD_COLUMNS = `id, name, description, genre, visibility, archived_at, created_at, updated_at, play_count,
   owner:owner_id (id, username, display_name, avatar_url)`;

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
      .select(PROJECT_CARD_COLUMNS, { count: 'exact' })
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .range(offset, offset + limit - 1);

    if (query.genre) {
      queryBuilder = queryBuilder.ilike('genre', `%${query.genre}%`);
    }

    if (query.search) {
      queryBuilder = queryBuilder.ilike('name', `%${query.search}%`);
    }

    if (query.tag) {
      const projectIds = await this.getProjectIdsForTag(query.tag);
      queryBuilder = queryBuilder.in('id', projectIds);
    }

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
    const items = await this.enrichProjectCards(
      (data ?? []) as unknown as ProjectCardRow[],
    );

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
      .select(PROJECT_CARD_COLUMNS)
      .eq('id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .maybeSingle<ProjectCardRow>();

    if (error || !data) {
      throw new NotFoundException('Project not found');
    }

    // Atomic increment via RPC (single UPDATE ... RETURNING) — avoids the read-modify-write
    // race of a plain update. Best effort: a failed increment doesn't fail the request.
    const rpcResult = (await this.supabase.rpc('increment_project_play_count', {
      p_project_id: id,
    })) as { data: number | null };
    if (typeof rpcResult.data === 'number') {
      data.play_count = rpcResult.data;
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

    // Get this user's public project ids first — forks are counted against them.
    const { data: ownedProjects, count: totalProjects } = await this.supabase
      .from('projects')
      .select('id', { count: 'exact' })
      .eq('owner_id', id)
      .eq('visibility', 'public')
      .is('archived_at', null);

    const ownedProjectIds = (ownedProjects ?? []).map(
      (p: { id: string }) => p.id,
    );

    const { count: totalForks } =
      ownedProjectIds.length > 0
        ? await this.supabase
            .from('projects')
            .select('id', { count: 'exact', head: true })
            .in('forked_from_project_id', ownedProjectIds)
        : { count: 0 };

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
      .select(PROJECT_CARD_COLUMNS)
      .eq('owner_id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException('Could not list user projects');
    }

    return this.enrichProjectCards((data ?? []) as unknown as ProjectCardRow[]);
  }

  /**
   * UC-11: Get rankings, sorted according to `type`.
   * `trending`/`top_played` sort by `play_count` at the DB level. `top_forked` has no
   * denormalized counter column to sort by, so it pulls the visible-project candidate
   * set, computes real fork counts in-app, and sorts there — fine at this project's
   * scale; would need a maintained `fork_count` column + trigger to sort at the DB
   * level once the catalog grows large.
   */
  async getRankings(
    type: RankingType = 'trending',
  ): Promise<PublicProjectCard[]> {
    const limit = 10;

    if (type === 'top_forked') {
      const { data, error } = await this.supabase
        .from('projects')
        .select(PROJECT_CARD_COLUMNS)
        .eq('visibility', 'public')
        .is('archived_at', null)
        .is('moderation_hidden_at', null);

      if (error) {
        throw new InternalServerErrorException('Could not get rankings');
      }

      const rows = (data ?? []) as unknown as ProjectCardRow[];
      const forkCounts = await this.getForkCounts(rows.map((r) => r.id));
      const topRows = [...rows]
        .sort(
          (a, b) => (forkCounts.get(b.id) ?? 0) - (forkCounts.get(a.id) ?? 0),
        )
        .slice(0, limit);

      return this.enrichProjectCards(topRows, forkCounts);
    }

    const { data, error } = await this.supabase
      .from('projects')
      .select(PROJECT_CARD_COLUMNS)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .order('play_count', { ascending: false })
      .limit(limit);

    if (error) {
      throw new InternalServerErrorException('Could not get rankings');
    }

    return this.enrichProjectCards((data ?? []) as unknown as ProjectCardRow[]);
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

    const visibleProjectsBase = () =>
      this.supabase
        .from('projects')
        .select(PROJECT_CARD_COLUMNS)
        .eq('visibility', 'public')
        .is('archived_at', null)
        .is('moderation_hidden_at', null);

    const [
      { data: featuredData },
      { data: trendingData },
      { count: totalProjects },
      { count: totalUsers },
      { count: totalForks },
    ] = await Promise.all([
      visibleProjectsBase().order('created_at', { ascending: false }).limit(6),
      visibleProjectsBase().order('play_count', { ascending: false }).limit(6),
      this.supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .eq('visibility', 'public')
        .is('archived_at', null),
      this.supabase.from('users').select('id', { count: 'exact', head: true }),
      this.supabase
        .from('projects')
        .select('id', { count: 'exact', head: true })
        .not('forked_from_project_id', 'is', null),
    ]);

    const [featuredProjects, trendingProjects] = await Promise.all([
      this.enrichProjectCards(
        (featuredData ?? []) as unknown as ProjectCardRow[],
      ),
      this.enrichProjectCards(
        (trendingData ?? []) as unknown as ProjectCardRow[],
      ),
    ]);

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

  /** Resolve project ids that carry a given tag name (used by the `tag` filter). */
  private async getProjectIdsForTag(tagName: string): Promise<string[]> {
    const { data } = await this.supabase
      .from('project_tags')
      .select('project_id, tag:tag_id!inner(name)')
      .eq('tag.name', tagName);

    return (data ?? []).map(
      (row) => (row as { project_id: string }).project_id,
    );
  }

  /** Real fork count per project id, computed from `projects.forked_from_project_id`. */
  private async getForkCounts(
    projectIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (projectIds.length === 0) return counts;

    const { data } = await this.supabase
      .from('projects')
      .select('forked_from_project_id')
      .in('forked_from_project_id', projectIds);

    for (const row of (data ?? []) as { forked_from_project_id: string }[]) {
      const parentId = row.forked_from_project_id;
      counts.set(parentId, (counts.get(parentId) ?? 0) + 1);
    }
    return counts;
  }

  /** Enrich raw project rows with tags and real fork counts. */
  private async enrichProjectCards(
    projects: ProjectCardRow[],
    precomputedForkCounts?: Map<string, number>,
  ): Promise<PublicProjectCard[]> {
    if (projects.length === 0) return [];

    const projectIds = projects.map((p) => p.id);

    const [{ data: projectTags }, forkCounts] = await Promise.all([
      this.supabase
        .from('project_tags')
        .select(`project_id, tag:tag_id (name)`)
        .in('project_id', projectIds),
      precomputedForkCounts
        ? Promise.resolve(precomputedForkCounts)
        : this.getForkCounts(projectIds),
    ]);

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

    return projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      genre: p.genre,
      visibility: 'public' as const,
      archived_at: p.archived_at,
      created_at: p.created_at,
      updated_at: p.updated_at,
      play_count: p.play_count,
      fork_count: forkCounts.get(p.id) ?? 0,
      owner: {
        id: p.owner?.id ?? '',
        username: p.owner?.username ?? null,
        display_name: p.owner?.display_name ?? null,
        avatar_url: p.owner?.avatar_url ?? null,
      },
      tags: tagsMap.get(p.id) ?? [],
    }));
  }
}
