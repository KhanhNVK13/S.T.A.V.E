import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException as HttpConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DraftSnapshot,
  DraftNote,
  DraftTrack,
  CommitRow,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { BranchesService } from '../branches/branches.service';
import { MergeBranchDto } from './dto/merge-branch.dto';
import { ResolveConflictDto, ConflictChoice } from './dto/resolve-conflict.dto';

/** Raw row from branches table */
interface BranchDbRow {
  id: string;
  project_id: string;
  name: string;
  is_default: boolean;
  created_by: string;
  created_at: string;
  base_commit_id: string | null;
  head_commit_id: string | null;
}

/** Raw row from the real `commits` table (author_id, not created_by). */
interface CommitDbRow {
  id: string;
  branch_id: string;
  message: string;
  snapshot: DraftSnapshot;
  author_id: string;
  created_at: string;
}

/** Note conflict detail */
export interface NoteConflict {
  noteId: string;
  baseNote?: DraftNote;
  sourceNote?: DraftNote;
  targetNote?: DraftNote;
  type: 'MODIFIED_DIFFERENTLY' | 'DELETE_VS_MODIFY';
}

/** Merge conflict response */
export interface MergeConflictResult {
  hasConflicts: boolean;
  conflictsCount: number;
  conflictsByBar: Record<
    number,
    Array<{
      noteId: string;
      baseNote?: DraftNote;
      sourceNote?: DraftNote;
      targetNote?: DraftNote;
      type: 'MODIFIED_DIFFERENTLY' | 'DELETE_VS_MODIFY';
    }>
  >;
}

/** Successful merge result */
export interface MergeSuccessResult {
  hasConflicts: false;
  commit: CommitRow;
}

/** Merge result - either success or conflict */
export type MergeResult = MergeConflictResult | MergeSuccessResult;

@Injectable()
export class MergeService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient<any, 'public', any>,
    private readonly branchesService: BranchesService,
  ) {}

  // ==========================================================================
  // UC-51: Merge Branch
  // ==========================================================================

  /**
   * Initiate a merge from source branch into target branch.
   *
   * 3-way merge based on a merge-base found by walking the real
   * `parent_commit_id` chain (BranchesService.findMergeBase) — not the
   * branches' static `base_commit_id`, which only reflects the ancestor at
   * branch-creation time and goes stale after either branch has since merged
   * elsewhere.
   */
  async mergeBranch(userId: string, dto: MergeBranchDto): Promise<MergeResult> {
    const { sourceBranchId, targetBranchId, expectedTargetHeadCommitId } = dto;

    const [sourceBranch, targetBranch] = await Promise.all([
      this.getBranchById(sourceBranchId),
      this.getBranchById(targetBranchId),
    ]);

    if (!sourceBranch) {
      throw new NotFoundException('Source branch not found');
    }
    if (!targetBranch) {
      throw new NotFoundException('Target branch not found');
    }

    // PRE-3: Verify both branches belong to the same project
    if (sourceBranch.project_id !== targetBranch.project_id) {
      throw new BadRequestException('Branches must belong to the same project');
    }

    // Verify user has edit permission
    await this.verifyUserEditPermission(sourceBranch.project_id, userId);

    // 8.E1: someone else may have committed to target while this merge was
    // being reviewed on the client — caller must restart against fresh state.
    if (
      expectedTargetHeadCommitId !== undefined &&
      targetBranch.head_commit_id !== expectedTargetHeadCommitId
    ) {
      throw new HttpConflictException(
        'Target branch has moved on since this merge was started. Please restart the merge.',
      );
    }

    // 2.E1: branches must share a real common ancestor
    const mergeBase = await this.branchesService.findMergeBase(
      sourceBranch.head_commit_id,
      targetBranch.head_commit_id,
    );
    if (!mergeBase) {
      throw new BadRequestException('Branches have no common ancestor');
    }

    // 3.E1: source has nothing the target doesn't already contain
    if (mergeBase === sourceBranch.head_commit_id) {
      throw new BadRequestException(
        'Nothing to merge. Source branch has no commits the target does not already contain.',
      );
    }

    // 7.1: target hasn't moved since divergence — fast-forward, no merge commit
    if (mergeBase === targetBranch.head_commit_id) {
      return this.fastForward(sourceBranch, targetBranch);
    }

    // Full 3-way merge
    const [baseSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
      this.getCommitSnapshot(mergeBase),
      this.getCommitSnapshot(sourceBranch.head_commit_id),
      this.getCommitSnapshot(targetBranch.head_commit_id),
    ]);

    return this.perform3WayMerge(
      userId,
      sourceBranch,
      targetBranch,
      baseSnapshot,
      sourceSnapshot,
      targetSnapshot,
    );
  }

  /**
   * Fast-forward: source is entirely ahead of target with no divergent work
   * on target's side, so the merge completes by just moving target's head —
   * no separate merge commit (SRS UC-51 alt-flow 7.1).
   */
  private async fastForward(
    sourceBranch: BranchDbRow,
    targetBranch: BranchDbRow,
  ): Promise<MergeSuccessResult> {
    const headCommitId = sourceBranch.head_commit_id;
    if (!headCommitId) {
      throw new InternalServerErrorException(
        'Source branch has no head commit to fast-forward to',
      );
    }

    const snapshot = await this.getCommitSnapshot(headCommitId);
    if (!snapshot) {
      throw new InternalServerErrorException(
        'Source head commit has no snapshot',
      );
    }

    const { error: branchError } = await this.supabase
      .from('branches')
      .update({ head_commit_id: headCommitId })
      .eq('id', targetBranch.id);
    if (branchError) {
      throw new InternalServerErrorException(
        `Failed to fast-forward branch: ${branchError.message}`,
      );
    }

    const { error: draftError } = await this.supabase.from('drafts').upsert(
      {
        branch_id: targetBranch.id,
        snapshot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'branch_id' },
    );
    if (draftError) {
      throw new InternalServerErrorException(
        `Failed to update draft after fast-forward: ${draftError.message}`,
      );
    }

    const { data: commit, error: commitError } = await this.supabase
      .from('commits')
      .select('*')
      .eq('id', headCommitId)
      .single<CommitDbRow>();
    if (commitError || !commit) {
      throw new InternalServerErrorException(
        'Failed to load fast-forwarded commit',
      );
    }

    return { hasConflicts: false, commit: this.toCommitRow(commit) };
  }

  /**
   * Resolve conflicts and complete the merge.
   */
  async resolveConflictsAndMerge(
    userId: string,
    dto: ResolveConflictDto,
  ): Promise<MergeSuccessResult> {
    const {
      sourceBranchId,
      targetBranchId,
      resolutions,
      message,
      expectedTargetHeadCommitId,
    } = dto;

    const [sourceBranch, targetBranch] = await Promise.all([
      this.getBranchById(sourceBranchId),
      this.getBranchById(targetBranchId),
    ]);

    if (!sourceBranch || !targetBranch) {
      throw new NotFoundException('Branch not found');
    }

    if (sourceBranch.project_id !== targetBranch.project_id) {
      throw new BadRequestException('Branches must belong to the same project');
    }

    // Same authorization requirement as starting a merge — this endpoint
    // writes a commit into the target project, it can't be left open.
    await this.verifyUserEditPermission(sourceBranch.project_id, userId);

    if (
      expectedTargetHeadCommitId !== undefined &&
      targetBranch.head_commit_id !== expectedTargetHeadCommitId
    ) {
      throw new HttpConflictException(
        'Target branch has moved on since this merge was started. Please restart the merge.',
      );
    }

    const mergeBase = await this.branchesService.findMergeBase(
      sourceBranch.head_commit_id,
      targetBranch.head_commit_id,
    );

    const [baseSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
      mergeBase ? this.getCommitSnapshot(mergeBase) : Promise.resolve(null),
      this.getCommitSnapshot(sourceBranch.head_commit_id),
      this.getCommitSnapshot(targetBranch.head_commit_id),
    ]);

    const base = baseSnapshot ?? this.createEmptySnapshot();
    const source = sourceSnapshot ?? this.createEmptySnapshot();
    const target = targetSnapshot ?? this.createEmptySnapshot();

    // Run full 3-way merge to get non-conflicting notes
    const notesResult = this.mergeNotes(base.notes, source.notes, target.notes);

    // Apply resolutions to conflicting notes
    const finalMergedSnapshot = this.applyResolutionsWithMergedNotes(
      base,
      source,
      target,
      notesResult.merged,
      notesResult.conflicts,
      resolutions,
    );

    const commitMessage =
      message ??
      `Merge branch '${sourceBranch.name}' into ${targetBranch.name}`;
    const commit = await this.createMergeCommit(
      userId,
      targetBranch,
      sourceBranch.id,
      finalMergedSnapshot,
      commitMessage,
    );

    return { hasConflicts: false, commit };
  }

  // ==========================================================================
  // 3-Way Merge Algorithm
  // ==========================================================================

  private async perform3WayMerge(
    userId: string,
    sourceBranch: BranchDbRow,
    targetBranch: BranchDbRow,
    baseSnapshot: DraftSnapshot | null,
    sourceSnapshot: DraftSnapshot | null,
    targetSnapshot: DraftSnapshot | null,
  ): Promise<MergeResult> {
    const base = baseSnapshot ?? this.createEmptySnapshot();
    const source = sourceSnapshot ?? this.createEmptySnapshot();
    const target = targetSnapshot ?? this.createEmptySnapshot();

    const notesResult = this.mergeNotes(base.notes, source.notes, target.notes);
    const tracksResult = this.mergeTracks(
      base.tracks,
      source.tracks,
      target.tracks,
    );

    if (notesResult.conflicts.length > 0) {
      return {
        hasConflicts: true,
        conflictsCount: notesResult.conflicts.length,
        conflictsByBar: this.groupConflictsByBar(
          notesResult.conflicts,
          source.meta ?? target.meta,
        ),
      };
    }

    const mergedSnapshot: DraftSnapshot = {
      schemaVersion: source.schemaVersion ?? 1,
      meta: source.meta ??
        target.meta ??
        base.meta ?? { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: tracksResult,
      notes: notesResult.merged,
    };

    const message = `Merge branch '${sourceBranch.name}' into ${targetBranch.name}`;
    const commit = await this.createMergeCommit(
      userId,
      targetBranch,
      sourceBranch.id,
      mergedSnapshot,
      message,
    );

    return { hasConflicts: false, commit };
  }

  /**
   * Merge notes using a 3-way algorithm, joined by persistent note UUID.
   */
  private mergeNotes(
    baseNotes: DraftNote[],
    sourceNotes: DraftNote[],
    targetNotes: DraftNote[],
  ): { merged: DraftNote[]; conflicts: NoteConflict[] } {
    const conflicts: NoteConflict[] = [];

    const baseMap = new Map(baseNotes.map((n) => [n.id, n]));
    const sourceMap = new Map(sourceNotes.map((n) => [n.id, n]));
    const targetMap = new Map(targetNotes.map((n) => [n.id, n]));

    const allIds = new Set([
      ...baseNotes.map((n) => n.id),
      ...sourceNotes.map((n) => n.id),
      ...targetNotes.map((n) => n.id),
    ]);

    const merged: DraftNote[] = [];

    for (const noteId of allIds) {
      const baseNote = baseMap.get(noteId);
      const sourceNote = sourceMap.get(noteId);
      const targetNote = targetMap.get(noteId);

      // Case 1: present on both sides
      if (sourceNote && targetNote) {
        if (this.notesEqual(sourceNote, targetNote)) {
          merged.push(sourceNote);
        } else {
          const sourceChanged = baseNote
            ? !this.notesEqual(sourceNote, baseNote)
            : true;
          const targetChanged = baseNote
            ? !this.notesEqual(targetNote, baseNote)
            : true;

          if (sourceChanged && targetChanged) {
            conflicts.push({
              noteId,
              baseNote,
              sourceNote,
              targetNote,
              type: 'MODIFIED_DIFFERENTLY',
            });
          } else if (sourceChanged) {
            merged.push(sourceNote);
          } else {
            merged.push(targetNote);
          }
        }
        continue;
      }

      // Case 2: source has it, target doesn't
      if (sourceNote && !targetNote) {
        if (!baseNote) {
          // Never existed at base — source added it fresh
          merged.push(sourceNote);
        } else if (this.notesEqual(sourceNote, baseNote)) {
          // Source kept it unchanged, target deleted it — clean delete, no conflict
          continue;
        } else {
          // Source modified it, target deleted it — DELETE_VS_MODIFY conflict
          conflicts.push({
            noteId,
            baseNote,
            sourceNote,
            targetNote: undefined,
            type: 'DELETE_VS_MODIFY',
          });
        }
        continue;
      }

      // Case 3: target has it, source doesn't
      if (targetNote && !sourceNote) {
        if (!baseNote) {
          merged.push(targetNote);
        } else if (this.notesEqual(targetNote, baseNote)) {
          // Target kept it unchanged, source deleted it — clean delete, no conflict
          continue;
        } else {
          conflicts.push({
            noteId,
            baseNote,
            sourceNote: undefined,
            targetNote,
            type: 'DELETE_VS_MODIFY',
          });
        }
        continue;
      }

      // Case 4: deleted on both sides — nothing to include
    }

    return { merged, conflicts };
  }

  /**
   * Merge tracks — source wins over target wins over base on any given id
   * (tracks don't carry per-field conflict detection like notes do).
   */
  private mergeTracks(
    baseTracks: DraftTrack[],
    sourceTracks: DraftTrack[],
    targetTracks: DraftTrack[],
  ): DraftTrack[] {
    const sourceMap = new Map(sourceTracks.map((t) => [t.id, t]));
    const targetMap = new Map(targetTracks.map((t) => [t.id, t]));
    const baseMap = new Map(baseTracks.map((t) => [t.id, t]));

    const allIds = new Set([
      ...baseTracks.map((t) => t.id),
      ...sourceTracks.map((t) => t.id),
      ...targetTracks.map((t) => t.id),
    ]);

    const merged: DraftTrack[] = [];
    for (const trackId of allIds) {
      const sourceTrack = sourceMap.get(trackId);
      const targetTrack = targetMap.get(trackId);
      const baseTrack = baseMap.get(trackId);

      if (sourceTrack) {
        merged.push(sourceTrack);
      } else if (targetTrack) {
        merged.push(targetTrack);
      } else if (baseTrack) {
        merged.push(baseTrack);
      }
    }

    return merged;
  }

  /**
   * Apply user resolutions to conflicting notes on top of the already-merged
   * non-conflicting notes (from `mergeNotes`) — this is what makes the final
   * commit contain both the resolutions AND every non-conflicting change from
   * source, instead of discarding the latter.
   */
  private applyResolutionsWithMergedNotes(
    base: DraftSnapshot,
    source: DraftSnapshot,
    target: DraftSnapshot,
    preMergedNotes: DraftNote[],
    conflicts: NoteConflict[],
    resolutions: Array<{
      noteId: string;
      choice: ConflictChoice;
      customNote?: Partial<DraftNote>;
    }>,
  ): DraftSnapshot {
    const resultNotes: DraftNote[] = [...preMergedNotes];
    const resultTracks = this.mergeTracks(
      base.tracks,
      source.tracks,
      target.tracks,
    );

    for (const conflict of conflicts) {
      const resolution = resolutions.find((r) => r.noteId === conflict.noteId);
      const { noteId, choice, customNote } = resolution ?? {
        noteId: conflict.noteId,
        choice: ConflictChoice.PICK_TARGET as ConflictChoice,
      };

      switch (choice) {
        case ConflictChoice.PICK_SOURCE: {
          if (conflict.sourceNote) {
            resultNotes.push(conflict.sourceNote);
          }
          break;
        }
        case ConflictChoice.PICK_TARGET: {
          if (conflict.targetNote) {
            resultNotes.push(conflict.targetNote);
          }
          break;
        }
        case ConflictChoice.PICK_CUSTOM: {
          if (customNote) {
            resultNotes.push({
              id: noteId,
              trackId: customNote.trackId ?? conflict.baseNote?.trackId ?? '',
              pitch: customNote.pitch ?? conflict.baseNote?.pitch ?? 60,
              start: customNote.start ?? conflict.baseNote?.start ?? 0,
              duration:
                customNote.duration ?? conflict.baseNote?.duration ?? 480,
              velocity:
                customNote.velocity ?? conflict.baseNote?.velocity ?? 80,
            });
          }
          break;
        }
      }
    }

    return {
      schemaVersion: source.schemaVersion ?? 1,
      meta: source.meta ?? target.meta ?? base.meta,
      tracks: resultTracks,
      notes: resultNotes,
    };
  }

  private notesEqual(a: DraftNote, b: DraftNote): boolean {
    return (
      a.pitch === b.pitch &&
      a.start === b.start &&
      a.duration === b.duration &&
      a.velocity === b.velocity &&
      a.trackId === b.trackId
    );
  }

  /**
   * Group conflicts by bar number, deriving ticks-per-bar from the actual
   * snapshot's meta (CLAUDE.md §4.2: ppq/timeSignature live in meta and can
   * differ per project) instead of a hardcoded 4/4 @ 480ppq assumption.
   */
  private groupConflictsByBar(
    conflicts: NoteConflict[],
    meta?: { ppq?: number; timeSignature?: [number, number] },
  ): Record<number, NoteConflict[]> {
    const ppq = meta?.ppq ?? 480;
    const [numerator = 4, denominator = 4] = meta?.timeSignature ?? [4, 4];
    const ticksPerBar = ppq * (numerator / denominator) * 4;

    const grouped: Record<number, NoteConflict[]> = {};

    for (const conflict of conflicts) {
      const note =
        conflict.targetNote ?? conflict.sourceNote ?? conflict.baseNote;
      if (note) {
        const bar = Math.floor(note.start / ticksPerBar) + 1;
        if (!grouped[bar]) grouped[bar] = [];
        grouped[bar].push(conflict);
      }
    }

    return grouped;
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async getCommitSnapshot(
    commitId: string | null,
  ): Promise<DraftSnapshot | null> {
    if (!commitId) return null;
    const { data } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', commitId)
      .single();

    return data?.snapshot ?? null;
  }

  /**
   * Create the merge commit atomically (insert + move target head + reset
   * target draft) via the same RPC used by CommitsService, recording both
   * `parent_commit_id` (target's previous head) and `merged_from_branch_id`
   * (the source branch) — BR-52: "refers to both contributing versions".
   */
  private async createMergeCommit(
    userId: string,
    targetBranch: BranchDbRow,
    sourceBranchId: string,
    snapshot: DraftSnapshot,
    message: string,
  ): Promise<CommitRow> {
    const { data: commit, error } = await this.supabase.rpc(
      'create_commit_atomic',
      {
        p_branch_id: targetBranch.id,
        p_author_id: userId,
        p_message: message,
        p_snapshot: snapshot,
        p_parent_commit_id: targetBranch.head_commit_id,
        p_merged_from_branch_id: sourceBranchId,
      },
    );

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create merge commit: ${error.message}`,
      );
    }

    return this.toCommitRow(commit as CommitDbRow);
  }

  private toCommitRow(row: CommitDbRow): CommitRow {
    return {
      id: row.id,
      branch_id: row.branch_id,
      message: row.message,
      snapshot: row.snapshot,
      created_by: row.author_id,
      created_at: row.created_at,
    };
  }

  private async getBranchById(branchId: string): Promise<BranchDbRow | null> {
    const { data } = await this.supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();

    return data as BranchDbRow | null;
  }

  private async verifyUserEditPermission(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const { data: project } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    if (project.owner_id !== userId) {
      throw new ForbiddenException(
        'You do not have edit permission on this project',
      );
    }
  }

  private createEmptySnapshot(): DraftSnapshot {
    return {
      schemaVersion: 1,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    };
  }
}
