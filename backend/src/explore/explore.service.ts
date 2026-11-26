import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  PublicProjectCard,
  PublicFeaturedContent,
  PublicGraphCommit,
  PublicProjectGraph,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { PublicProjectsQueryDto } from '../projects/dto/public-projects-query.dto';
import type { PublicUserProfile } from '../users/dto/public-user-profile.dto';
import { MusicalFingerprintService } from '../musical-fingerprint/musical-fingerprint.service';
import { instrumentStoredForms } from './instrument-codes';

export type { PublicProjectCard };
export type RankingType = 'trending' | 'top_forked' | 'top_played';
export type RankingPeriod = 'week' | 'month' | 'all';
type RankedColumn =
  | 'score_all'
  | 'trending_score'
  | 'plays'
  | 'forks'
  | 'plays_week'
  | 'plays_month'
  | 'forks_week'
  | 'forks_month'
  | 'score_week'
  | 'score_month';

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
  license?: PublicProjectCard['license'];
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

export interface SimilarPublicProjectCard extends PublicProjectCard {
  similarity: number;
  tempo: number;
  tonalityTonic: string | null;
  tonalityMode: 'major' | 'minor' | null;
}

function mergeFilterIds(
  a: string[] | null,
  b: string[] | null,
): string[] | null {
  if (a === null) return b;
  if (b === null) return a;
  const set = new Set(b);
  return a.filter((id) => set.has(id));
}

/** Columns shared by every query that returns a `PublicProjectCard` — keep in sync with `ProjectCardRow`. */
const PROJECT_CARD_COLUMNS = `id, name, description, genre, license, visibility, archived_at, created_at, updated_at, play_count,
   owner:owner_id!inner (id, username, display_name, avatar_url, status)`;

/** Max commits returned by the public graph endpoint (newest kept). */
const PUBLIC_GRAPH_COMMIT_LIMIT = 1000;

interface GraphCommitRow {
  id: string;
  branch_id: string;
  author_id: string | null;
  message: string;
  created_at: string;
  parent_commit_id: string | null;
  merged_from_commit_id: string | null;
}

/**
 * The ONLY place that decides which commit fields become public.
 * To stop exposing commit messages, delete the `message` line here and in
 * `PublicGraphCommit` (shared-types).
 */
function toPublicGraphCommit(
  row: GraphCommitRow,
  author: PublicGraphCommit['author'],
): PublicGraphCommit {
  return {
    id: row.id,
    branch_id: row.branch_id,
    parent_commit_id: row.parent_commit_id,
    merged_from_commit_id: row.merged_from_commit_id,
    message: row.message,
    created_at: row.created_at,
    author,
  };
}

@Injectable()
export class ExploreService {
  private readonly logger = new Logger(ExploreService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    @Optional()
    private readonly fingerprints?: MusicalFingerprintService,
  ) {}

  /** UC-08: List public projects with pagination and filters. */
  async listPublicProjects(
    query: PublicProjectsQueryDto,
  ): Promise<PaginatedResult<PublicProjectCard>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const hasMusicalFilters =
      query.tempoMin !== undefined ||
      query.tempoMax !== undefined ||
      query.mode !== undefined;
    const musicalIds =
      hasMusicalFilters && this.fingerprints
        ? await this.fingerprints.findProjectIdsByMusicalFilters({
            tempoMin: query.tempoMin,
            tempoMax: query.tempoMax,
            mode: query.mode,
          })
        : null;

    if (musicalIds !== null && musicalIds.length === 0) {
      return { items: [], total: 0, page, totalPages: 0, limit };
    }

    if (
      query.sort === 'popular' ||
      query.sort === 'most_played' ||
      query.sort === 'most_forked'
    ) {
      const column: RankedColumn =
        query.sort === 'most_played'
          ? 'plays'
          : query.sort === 'most_forked'
            ? 'forks'
            : 'score_all';
      const tagIds = query.tag
        ? await this.getProjectIdsForTag(query.tag)
        : null;
      const filterIds = mergeFilterIds(tagIds, musicalIds);
      if (filterIds !== null && filterIds.length === 0 && musicalIds !== null) {
        return { items: [], total: 0, page, totalPages: 0, limit };
      }
      const ranked = await this.rankedProjectIds(column, {
        offset,
        limit,
        genre: query.genre,
        search: query.search,
        tagIds: filterIds,
        instruments: query.instrument,
        requirePositive: false,
      });
      const cards = await this.loadCardsInOrder(ranked.ids);
      return {
        items: cards,
        total: ranked.total,
        page,
        totalPages: Math.ceil(ranked.total / limit),
        limit,
      };
    }

    const tagIds = query.tag ? await this.getProjectIdsForTag(query.tag) : null;
    const filterIds = mergeFilterIds(tagIds, musicalIds);
    if (filterIds !== null && filterIds.length === 0 && musicalIds !== null) {
      return { items: [], total: 0, page, totalPages: 0, limit };
    }

    let queryBuilder = this.supabase
      .from('projects')
      .select(PROJECT_CARD_COLUMNS, { count: 'exact' })
      .eq('owner.status', 'active')
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

    for (const instrument of query.instrument ?? []) {
      queryBuilder = queryBuilder.overlaps(
        'instruments',
        instrumentStoredForms(instrument),
      );
    }

    if (filterIds !== null) {
      queryBuilder = queryBuilder.in('id', filterIds);
    }

    queryBuilder = queryBuilder
      .order(query.sort === 'recently_updated' ? 'updated_at' : 'created_at', {
        ascending: false,
      })
      .order('id');

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

  /** Find public projects with similar musical fingerprints via pgvector. */
  async getSimilarPublicProjects(
    id: string,
    limit = 6,
  ): Promise<SimilarPublicProjectCard[]> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('id, owner:owner_id!inner (status)')
      .eq('owner.status', 'active')
      .eq('id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .maybeSingle<{ id: string }>();

    if (projectError || !project) {
      throw new NotFoundException('Project not found');
    }

    const matches =
      (await this.fingerprints?.findSimilarProjectMatches(id, limit)) ?? [];
    if (matches.length === 0) {
      return [];
    }

    const cards = await this.loadCardsInOrder(matches.map((m) => m.projectId));
    const matchById = new Map(matches.map((m) => [m.projectId, m]));
    return cards
      .map((card) => {
        const match = matchById.get(card.id);
        if (!match) return null;
        return {
          ...card,
          similarity: match.similarity,
          tempo: match.tempo,
          tonalityTonic: match.tonalityTonic,
          tonalityMode: match.tonalityMode,
        };
      })
      .filter((item): item is SimilarPublicProjectCard => item !== null);
  }

  /** UC-09: Get single public project detail. */
  async getPublicProject(id: string): Promise<PublicProjectCard> {
    const { data, error } = await this.supabase
      .from('projects')
      .select(PROJECT_CARD_COLUMNS)
      .eq('owner.status', 'active')
      .eq('id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .maybeSingle<ProjectCardRow>();

    if (error || !data) {
      throw new NotFoundException('Project not found');
    }

    const cards = await this.enrichProjectCards([data]);
    return cards[0];
  }

  /** Public read-only commit graph (metadata only). Same visibility rules as getPublicProject. */
  async getPublicProjectGraph(id: string): Promise<PublicProjectGraph> {
    const { data: project, error: projectError } = await this.supabase
      .from('projects')
      .select('id, owner:owner_id!inner (status)')
      .eq('owner.status', 'active')
      .eq('id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null)
      .maybeSingle<{ id: string }>();

    if (projectError || !project) {
      throw new NotFoundException('Project not found');
    }

    const { data: branchRows, error: branchError } = await this.supabase
      .from('branches')
      .select('id, name, is_default, head_commit_id')
      .eq('project_id', id)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true });
    if (branchError) {
      throw new InternalServerErrorException('Could not load project graph');
    }
    const branches = (branchRows ?? []).map(
      (b: {
        id: string;
        name: string;
        is_default: boolean;
        head_commit_id: string | null;
      }) => ({
        id: b.id,
        name: b.name,
        is_default: b.is_default,
        head_commit_id: b.head_commit_id ?? null,
      }),
    );
    if (branches.length === 0) {
      return { branches, commits: [], total: 0 };
    }

    // One query for the whole project (not per branch): newest window, one page.
    const {
      data: commitRows,
      error: commitError,
      count,
    } = await this.supabase
      .from('commits')
      .select(
        'id, branch_id, author_id, message, created_at, parent_commit_id, merged_from_commit_id',
        { count: 'exact' },
      )
      .in(
        'branch_id',
        branches.map((b) => b.id),
      )
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(0, PUBLIC_GRAPH_COMMIT_LIMIT - 1);
    if (commitError) {
      throw new InternalServerErrorException('Could not load project graph');
    }

    const rows = ((commitRows ?? []) as GraphCommitRow[]).reverse();
    const authors = await this.loadGraphAuthors(rows);
    const commits = rows.map((row) =>
      toPublicGraphCommit(
        row,
        (row.author_id ? authors.get(row.author_id) : undefined) ?? {
          id: row.author_id ?? '',
          username: null,
          display_name: null,
          avatar_url: null,
        },
      ),
    );

    return { branches, commits, total: Math.max(count ?? 0, commits.length) };
  }

  private async loadGraphAuthors(
    rows: GraphCommitRow[],
  ): Promise<Map<string, PublicGraphCommit['author']>> {
    const ids = [
      ...new Set(rows.map((r) => r.author_id).filter((x): x is string => !!x)),
    ];
    const map = new Map<string, PublicGraphCommit['author']>();
    for (let i = 0; i < ids.length; i += 100) {
      const { data, error } = await this.supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .in('id', ids.slice(i, i + 100));
      if (error) {
        throw new InternalServerErrorException('Could not load project graph');
      }
      for (const u of (data ?? []) as PublicGraphCommit['author'][]) {
        map.set(u.id, {
          id: u.id,
          username: u.username ?? null,
          display_name: u.display_name ?? null,
          avatar_url: u.avatar_url ?? null,
        });
      }
    }
    return map;
  }

  async recordPlay(
    projectId: string,
    userId: string,
  ): Promise<{ play_count: number }> {
    const { data, error } = await this.supabase.rpc('record_project_play', {
      p_project_id: projectId,
      p_user_id: userId,
    });

    if (error) {
      throw new InternalServerErrorException('Could not record play');
    }
    if (typeof data !== 'number') {
      throw new NotFoundException('Project not found');
    }
    return { play_count: data };
  }

  /** UC-10: Get public user profile with stats. */
  async getPublicUserProfile(id: string): Promise<PublicUserProfile> {
    const { data: user, error: userError } = await this.supabase
      .from('users')
      .select('id, username, display_name, avatar_url, bio, created_at, status')
      .eq('id', id)
      .maybeSingle<{
        id: string;
        username: string | null;
        display_name: string | null;
        avatar_url: string | null;
        bio: string | null;
        created_at: string;
        status: string;
      }>();

    if (userError || !user || user.status !== 'active') {
      throw new NotFoundException('User not found');
    }

    // Get this user's public project ids first — forks are counted against them.
    const { data: ownedProjects, count: totalProjects } = await this.supabase
      .from('projects')
      .select('id', { count: 'exact' })
      .eq('owner_id', id)
      .eq('visibility', 'public')
      .is('archived_at', null)
      .is('moderation_hidden_at', null);

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
      .eq('owner.status', 'active')
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
   * UC-11: rankings built on the `project_engagement` view (distinct accounts
   * only, owner and suspended accounts excluded): `trending` = recent
   * engagement damped by lifetime engagement, `top_played` / `top_forked` =
   * distinct players / distinct fork owners.
   */
  async getRankings(
    type: RankingType = 'trending',
    period: RankingPeriod = 'all',
  ): Promise<PublicProjectCard[]> {
    const suffix = period === 'all' ? '' : `_${period}`;
    const column = (
      type === 'top_forked'
        ? `forks${suffix}`
        : type === 'top_played'
          ? `plays${suffix}`
          : period === 'all'
            ? 'trending_score'
            : `score${suffix}`
    ) as RankedColumn;
    const ranked = await this.rankedProjectIds(column, {
      offset: 0,
      limit: 10,
    });
    const cards = await this.loadCardsInOrder(ranked.ids);

    // Override play_count / fork_count / comment_count with engagement view
    // values so the numbers shown on the card match the stats used for sorting.
    if (ranked.ids.length > 0) {
      const playsCol = `plays${suffix}` as const;
      const forksCol = `forks${suffix}` as const;
      const { data: engagementRows, error: engagementError } =
        await this.supabase
          .from('project_engagement')
          .select(`project_id, ${playsCol}, ${forksCol}, comments`)
          .in('project_id', ranked.ids);

      if (engagementError) {
        throw new InternalServerErrorException('Could not get rankings');
      }

      if (engagementRows) {
        const engMap = new Map(
          (
            engagementRows as unknown as ({
              project_id: string;
              comments: number;
            } & Record<typeof playsCol | typeof forksCol, number>)[]
          ).map((r) => [r.project_id, r]),
        );
        for (const card of cards) {
          const eng = engMap.get(card.id);
          if (eng) {
            card.play_count = eng[playsCol];
            card.fork_count = eng[forksCol];
            card.comment_count = eng.comments;
          }
        }
      }
    }

    return cards;
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

    const [
      { data: featuredData },
      { data: trendingData },
      { count: totalProjects },
      { count: totalUsers },
      { count: totalForks },
    ] = await Promise.all([
      this.rankedProjectIds('score_all', { offset: 0, limit: 6 })
        .then(async (ranked) => ({
          data: await this.loadCardRows(ranked.ids),
        }))
        .catch((error: unknown) => {
          this.logger.warn(
            `Featured list unavailable on the landing page: ${String(error)}`,
          );
          return { data: [] as ProjectCardRow[] };
        }),
      this.rankedProjectIds('trending_score', { offset: 0, limit: 6 })
        .then(async (ranked) => ({
          data: await this.loadCardRows(ranked.ids),
        }))
        .catch((error: unknown) => {
          this.logger.warn(
            `Trending list unavailable on the landing page: ${String(error)}`,
          );
          return { data: [] as ProjectCardRow[] };
        }),
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
      this.enrichProjectCards(featuredData ?? []),
      this.enrichProjectCards(trendingData ?? []),
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

  private async rankedProjectIds(
    column: RankedColumn,
    options: {
      offset: number;
      limit: number;
      genre?: string;
      search?: string;
      tagIds?: string[] | null;
      instruments?: string[];
      requirePositive?: boolean;
    },
  ): Promise<{ ids: string[]; total: number }> {
    let builder = this.supabase
      .from('project_engagement')
      .select('project_id', { count: 'exact' })
      .eq('is_visible', true);
    if (options.requirePositive !== false) {
      builder = builder.gt(column, 0);
    }
    builder = builder
      .order(column, { ascending: false })
      .order('created_at', { ascending: false })
      .order('project_id')
      .range(options.offset, options.offset + options.limit - 1);
    if (options.genre) builder = builder.ilike('genre', `%${options.genre}%`);
    if (options.search) builder = builder.ilike('name', `%${options.search}%`);
    if (options.tagIds) builder = builder.in('project_id', options.tagIds);
    for (const instrument of options.instruments ?? []) {
      builder = builder.overlaps(
        'instruments',
        instrumentStoredForms(instrument),
      );
    }

    const { data, error, count } = await builder;
    if (error) {
      throw new InternalServerErrorException('Could not get rankings');
    }
    const ids = ((data ?? []) as { project_id: string }[]).map(
      (row) => row.project_id,
    );
    return { ids, total: count ?? ids.length };
  }

  private async loadCardRows(ids: string[]): Promise<ProjectCardRow[]> {
    if (ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from('projects')
      .select(PROJECT_CARD_COLUMNS)
      .eq('owner.status', 'active')
      .in('id', ids);
    if (error) {
      throw new InternalServerErrorException('Could not get rankings');
    }
    const byId = new Map(
      ((data ?? []) as unknown as ProjectCardRow[]).map((row) => [row.id, row]),
    );
    return ids
      .map((id) => byId.get(id))
      .filter((row): row is ProjectCardRow => row !== undefined);
  }

  private async loadCardsInOrder(ids: string[]): Promise<PublicProjectCard[]> {
    return this.enrichProjectCards(await this.loadCardRows(ids));
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
      license: p.license ?? null,
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
