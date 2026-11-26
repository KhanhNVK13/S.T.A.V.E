import { Inject, Injectable, Logger } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DraftSnapshot } from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { TonalityMode } from '../ai/theory-analysis';
import {
  extractMusicalFingerprint,
  formatPgVector,
} from './musical-fingerprint';

export interface SimilarProjectMatch {
  projectId: string;
  similarity: number;
  tempo: number;
  tonalityTonic: string | null;
  tonalityMode: TonalityMode | null;
}

export interface MusicalFilterParams {
  tempoMin?: number;
  tempoMax?: number;
  mode?: TonalityMode;
}

interface MatchSimilarProjectRpcRow {
  project_id: string;
  similarity: number;
  tempo: number;
  tonality_tonic: string | null;
  tonality_mode: TonalityMode | null;
}

@Injectable()
export class MusicalFingerprintService {
  private readonly logger = new Logger(MusicalFingerprintService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async upsertForProject(
    projectId: string,
    snapshot: DraftSnapshot,
  ): Promise<void> {
    try {
      const fingerprint = extractMusicalFingerprint(snapshot);
      if (!fingerprint) {
        const { error } = await this.supabase
          .from('project_musical_fingerprints')
          .delete()
          .eq('project_id', projectId);
        if (error) {
          this.logger.warn(
            `Could not delete empty musical fingerprint for ${projectId}: ${error.message}`,
          );
        }
        return;
      }

      const { error } = await this.supabase
        .from('project_musical_fingerprints')
        .upsert(
          {
            project_id: projectId,
            embedding: formatPgVector(fingerprint.embedding),
            tempo: fingerprint.tempo,
            tonality_tonic: fingerprint.tonalityTonic,
            tonality_mode: fingerprint.tonalityMode,
            note_density: fingerprint.noteDensity,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'project_id' },
        );

      if (error) {
        this.logger.warn(
          `Could not upsert musical fingerprint for ${projectId}: ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Unexpected error updating musical fingerprint for ${projectId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  async findSimilarProjectMatches(
    projectId: string,
    limit = 6,
  ): Promise<SimilarProjectMatch[]> {
    const clampedLimit = Math.min(12, Math.max(1, Math.round(limit)));
    try {
      const { data, error } = await this.supabase.rpc(
        'match_similar_projects',
        {
          p_project_id: projectId,
          p_limit: clampedLimit,
        },
      );

      if (error) {
        this.logger.warn(
          `Could not match similar projects for ${projectId}: ${error.message}`,
        );
        return [];
      }

      const rows = (data ?? []) as MatchSimilarProjectRpcRow[];
      return rows.map((row) => ({
        projectId: row.project_id,
        similarity: Math.max(0, Math.min(1, Number(row.similarity) || 0)),
        tempo: Number(row.tempo) || 120,
        tonalityTonic: row.tonality_tonic ?? null,
        tonalityMode:
          row.tonality_mode === 'major' || row.tonality_mode === 'minor'
            ? row.tonality_mode
            : null,
      }));
    } catch (err) {
      this.logger.warn(
        `Unexpected error matching similar projects for ${projectId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return [];
    }
  }

  async findProjectIdsByMusicalFilters(
    filters: MusicalFilterParams,
  ): Promise<string[] | null> {
    if (
      filters.tempoMin === undefined &&
      filters.tempoMax === undefined &&
      filters.mode === undefined
    ) {
      return null;
    }

    try {
      let query = this.supabase
        .from('project_musical_fingerprints')
        .select('project_id');

      if (filters.tempoMin !== undefined) {
        query = query.gte('tempo', filters.tempoMin);
      }
      if (filters.tempoMax !== undefined) {
        query = query.lte('tempo', filters.tempoMax);
      }
      if (filters.mode !== undefined) {
        query = query.eq('tonality_mode', filters.mode);
      }

      const { data, error } = await query;
      if (error) {
        this.logger.warn(
          `Could not filter projects by musical fingerprint: ${error.message}`,
        );
        return null;
      }

      return ((data ?? []) as { project_id: string }[]).map(
        (row) => row.project_id,
      );
    } catch (err) {
      this.logger.warn(
        `Unexpected error filtering projects by musical fingerprint: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return null;
    }
  }
}
