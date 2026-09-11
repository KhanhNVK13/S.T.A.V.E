import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DraftSnapshot,
  DraftNote,
  DraftTrack,
  CommitRow,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
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

/** Raw row from commits table */
interface CommitDbRow {
  id: string;
  branch_id: string;
  message: string;
  snapshot: DraftSnapshot;
  created_by: string;
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

/** Delete branch preview */
export interface DeleteBranchPreview {
  branchId: string;
  branchName: string;
  isDefault: boolean;
  unmergedCommitsCount: number;
  unmergedCommitIds: string[];
}

@Injectable()
export class MergeService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient<any, 'public', any>,
  ) {}

  // ==========================================================================
  // UC-51: Merge Branch
  // ==========================================================================

  /**
   * Initiate a merge from source branch to target branch
   *
   * Implements 3-way merge algorithm based on:
   * - Base: branches.base_commit_id (Common Ancestor)
   * - Source: head_commit_id of source branch
   * - Target: head_commit_id of target branch
   */
  async mergeBranch(userId: string, dto: MergeBranchDto): Promise<MergeResult> {
    const { sourceBranchId, targetBranchId } = dto;

    // Get both branches
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

    // 2.E1: Check branches have common ancestor
    if (sourceBranch.base_commit_id !== targetBranch.base_commit_id) {
      throw new BadRequestException('Branches have no common ancestor');
    }

    // 3.E1: Check if there's something to merge
    if (sourceBranch.head_commit_id === targetBranch.head_commit_id) {
      throw new BadRequestException(
        'Nothing to merge. Target branch is already up to date.',
      );
    }

    // Get the three snapshots
    const { baseSnapshot, sourceSnapshot, targetSnapshot } =
      await this.getThreeSnapshots(sourceBranch, targetBranch);

    // Fast-Forward Check (7.1)
    // If target hasn't moved from base, just update pointer
    if (
      targetBranch.head_commit_id === sourceBranch.base_commit_id &&
      sourceBranch.head_commit_id !== targetBranch.head_commit_id
    ) {
      // Fast-forward: update target head to source head
      const { error } = await this.supabase
        .from('branches')
        .update({ head_commit_id: sourceBranch.head_commit_id })
        .eq('id', targetBranchId);

      if (error) {
        throw new InternalServerErrorException(
          `Failed to fast-forward branch: ${error.message}`,
        );
      }

      // Create auto-merge message commit for tracking
      const mergeCommit = await this.createMergeCommit(
        userId,
        targetBranchId,
        sourceSnapshot ?? this.createEmptySnapshot(),
        `Merge branch '${sourceBranch.name}' into ${targetBranch.name}`,
      );

      return { hasConflicts: false, commit: mergeCommit };
    }

    // Perform 3-way merge
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
   * Resolve conflicts and complete the merge
   */
  async resolveConflictsAndMerge(
    userId: string,
    dto: ResolveConflictDto,
  ): Promise<MergeSuccessResult> {
    const { sourceBranchId, targetBranchId, resolutions, message } = dto;

    // Get both branches
    const [sourceBranch, targetBranch] = await Promise.all([
      this.getBranchById(sourceBranchId),
      this.getBranchById(targetBranchId),
    ]);

    if (!sourceBranch || !targetBranch) {
      throw new NotFoundException('Branch not found');
    }

    // Get the three snapshots
    const { baseSnapshot, sourceSnapshot, targetSnapshot } =
      await this.getThreeSnapshots(sourceBranch, targetBranch);

    // Handle null snapshots
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

    // Create merge commit
    const commitMessage =
      message ??
      `Merge branch '${sourceBranch.name}' into ${targetBranch.name}`;
    const commit = await this.createMergeCommit(
      userId,
      targetBranchId,
      finalMergedSnapshot,
      commitMessage,
    );

    return { hasConflicts: false, commit };
  }

  // ==========================================================================
  // 3-Way Merge Algorithm
  // ==========================================================================

  /**
   * Perform 3-way merge of two branches
   */
  private async perform3WayMerge(
    userId: string,
    sourceBranch: BranchDbRow,
    targetBranch: BranchDbRow,
    baseSnapshot: DraftSnapshot | null,
    sourceSnapshot: DraftSnapshot | null,
    targetSnapshot: DraftSnapshot | null,
  ): Promise<MergeResult> {
    // Handle null snapshots
    const base = baseSnapshot ?? this.createEmptySnapshot();
    const source = sourceSnapshot ?? this.createEmptySnapshot();
    const target = targetSnapshot ?? this.createEmptySnapshot();

    // Run merge on notes
    const notesResult = this.mergeNotes(base.notes, source.notes, target.notes);
    const tracksResult = this.mergeTracks(
      base.tracks,
      source.tracks,
      target.tracks,
    );

    // Check for conflicts
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

    // No conflicts - create merge commit
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
      targetBranch.id,
      mergedSnapshot,
      message,
    );

    return { hasConflicts: false, commit };
  }

  /**
   * Merge notes using 3-way algorithm
   */
  private mergeNotes(
    baseNotes: DraftNote[],
    sourceNotes: DraftNote[],
    targetNotes: DraftNote[],
  ): { merged: DraftNote[]; conflicts: NoteConflict[] } {
    const conflicts: NoteConflict[] = [];

    // Create maps by note ID
    const baseMap = new Map(baseNotes.map((n) => [n.id, n]));
    const sourceMap = new Map(sourceNotes.map((n) => [n.id, n]));
    const targetMap = new Map(targetNotes.map((n) => [n.id, n]));

    // Get all unique note IDs
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

      // Case 1: Note exists in both source and target - check if unchanged
      if (sourceNote && targetNote) {
        if (this.notesEqual(sourceNote, targetNote)) {
          // Unchanged - include it
          merged.push(sourceNote);
        } else {
          // Both modified - check if same change
          const sourceChanged = baseNote
            ? !this.notesEqual(sourceNote, baseNote)
            : true;
          const targetChanged = baseNote
            ? !this.notesEqual(targetNote, baseNote)
            : true;

          if (sourceChanged && targetChanged) {
            // Both changed differently - CONFLICT
            conflicts.push({
              noteId,
              baseNote,
              sourceNote,
              targetNote,
              type: 'MODIFIED_DIFFERENTLY',
            });
          } else if (sourceChanged) {
            // Only source changed - use source
            merged.push(sourceNote);
          } else {
            // Only target changed - use target
            merged.push(targetNote);
          }
        }
        continue;
      }

      // Case 2: Source has note, Target doesn't
      if (sourceNote && !targetNote) {
        if (!baseNote) {
          // Source added new note - include it
          merged.push(sourceNote);
        } else {
          // Base had note, Target doesn't = Target deleted
          // Source modified or kept it = Source modified
          // This is DELETE_VS_MODIFY conflict
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

      // Case 3: Target has note, Source doesn't
      if (targetNote && !sourceNote) {
        if (!baseNote) {
          // Target added new note - include it
          merged.push(targetNote);
        } else {
          // Base had note, Source doesn't = Source deleted
          // Target modified or kept it = Target modified
          // This is DELETE_VS_MODIFY conflict
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

      // Case 4: Only in base (deleted from both) - skip
      if (baseNote && !sourceNote && !targetNote) {
        // Note deleted from both - don't include
        continue;
      }
    }

    return { merged, conflicts };
  }

  /**
   * Merge tracks - simplified merge
   */
  private mergeTracks(
    baseTracks: DraftTrack[],
    sourceTracks: DraftTrack[],
    targetTracks: DraftTrack[],
  ): DraftTrack[] {
    // Create maps by track ID
    const baseMap = new Map(baseTracks.map((t) => [t.id, t]));
    const sourceMap = new Map(sourceTracks.map((t) => [t.id, t]));
    const targetMap = new Map(targetTracks.map((t) => [t.id, t]));

    // Get all unique track IDs
    const allIds = new Set([
      ...baseTracks.map((t) => t.id),
      ...sourceTracks.map((t) => t.id),
      ...targetTracks.map((t) => t.id),
    ]);

    const merged: DraftTrack[] = [];

    for (const trackId of allIds) {
      const baseTrack = baseMap.get(trackId);
      const sourceTrack = sourceMap.get(trackId);
      const targetTrack = targetMap.get(trackId);

      // Use source if available, otherwise target, otherwise base
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
   * Apply resolutions to resolve conflicts
   */
  private applyResolutions(
    baseSnapshot: DraftSnapshot | null,
    sourceSnapshot: DraftSnapshot | null,
    targetSnapshot: DraftSnapshot | null,
    resolutions: Array<{
      noteId: string;
      choice: ConflictChoice;
      customNote?: Partial<DraftNote>;
    }>,
  ): DraftSnapshot {
    // Handle null snapshots
    const base = baseSnapshot ?? this.createEmptySnapshot();
    const source = sourceSnapshot ?? this.createEmptySnapshot();
    const target = targetSnapshot ?? this.createEmptySnapshot();

    // Start with target as base
    const resultNotes: DraftNote[] = [...target.notes];
    const resultTracks = this.mergeTracks(
      base.tracks,
      source.tracks,
      target.tracks,
    );

    // Apply each resolution
    for (const resolution of resolutions) {
      const { noteId, choice, customNote } = resolution;

      switch (choice) {
        case ConflictChoice.PICK_SOURCE: {
          // Find source note and add/replace
          const sourceNote = source.notes.find((n) => n.id === noteId);
          if (sourceNote) {
            // Remove existing note with same ID
            const idx = resultNotes.findIndex((n) => n.id === noteId);
            if (idx >= 0) resultNotes.splice(idx, 1);
            resultNotes.push(sourceNote);
          }
          break;
        }
        case ConflictChoice.PICK_TARGET: {
          // Keep target note (already in result)
          // Nothing to do
          break;
        }
        case ConflictChoice.PICK_CUSTOM: {
          // Add custom note
          if (customNote) {
            const idx = resultNotes.findIndex((n) => n.id === noteId);
            if (idx >= 0) resultNotes.splice(idx, 1);
            resultNotes.push({
              id: noteId,
              trackId: customNote.trackId ?? '',
              pitch: customNote.pitch ?? 60,
              start: customNote.start ?? 0,
              duration: customNote.duration ?? 480,
              velocity: customNote.velocity ?? 80,
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

  /**
   * Apply resolutions to conflicting notes with pre-merged notes
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
    // Start with pre-merged notes (non-conflicting)
    const resultNotes: DraftNote[] = [...preMergedNotes];
    const resultTracks = this.mergeTracks(
      base.tracks,
      source.tracks,
      target.tracks,
    );

    // Apply resolutions to conflicting notes
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

  /**
   * Check if two notes are equal
   */
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
   * Group conflicts by bar number using dynamic calculation
   */
  private groupConflictsByBar(
    conflicts: NoteConflict[],
    meta?: { ppq?: number; timeSignature?: [number, number] },
  ): Record<number, NoteConflict[]> {
    // Dynamic ticks per bar: ppq * beats_per_bar
    // beats_per_bar = numerator * (4/denominator) for standard time sigs
    const ppq = meta?.ppq ?? 480;
    const [numerator = 4, denominator = 4] = meta?.timeSignature ?? [4, 4];
    const ticksPerBar = ppq * (numerator / denominator) * 4;

    const grouped: Record<number, NoteConflict[]> = {};

    for (const conflict of conflicts) {
      // Use target note's start time if available, otherwise source, otherwise base
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

  /**
   * Get three snapshots for 3-way merge
   */
  private async getThreeSnapshots(
    sourceBranch: BranchDbRow,
    targetBranch: BranchDbRow,
  ): Promise<{
    baseSnapshot: DraftSnapshot | null;
    sourceSnapshot: DraftSnapshot | null;
    targetSnapshot: DraftSnapshot | null;
  }> {
    const [baseSnapshot, sourceSnapshot, targetSnapshot] = await Promise.all([
      sourceBranch.base_commit_id
        ? this.getCommitSnapshot(sourceBranch.base_commit_id)
        : Promise.resolve(null),
      sourceBranch.head_commit_id
        ? this.getCommitSnapshot(sourceBranch.head_commit_id)
        : Promise.resolve(null),
      targetBranch.head_commit_id
        ? this.getCommitSnapshot(targetBranch.head_commit_id)
        : Promise.resolve(null),
    ]);

    return { baseSnapshot, sourceSnapshot, targetSnapshot };
  }

  /**
   * Get snapshot from a commit
   */
  private async getCommitSnapshot(
    commitId: string,
  ): Promise<DraftSnapshot | null> {
    const { data } = await this.supabase
      .from('commits')
      .select('snapshot')
      .eq('id', commitId)
      .single();

    return data?.snapshot ?? null;
  }

  /**
   * Create merge commit
   */
  private async createMergeCommit(
    userId: string,
    targetBranchId: string,
    snapshot: DraftSnapshot,
    message: string,
  ): Promise<CommitRow> {
    const commitId = uuidv4();

    const { data: commit, error } = await this.supabase
      .from('commits')
      .insert({
        id: commitId,
        branch_id: targetBranchId,
        message,
        snapshot,
        created_by: userId,
      })
      .select('*')
      .single<CommitDbRow>();

    if (error) {
      throw new InternalServerErrorException(
        `Failed to create merge commit: ${error.message}`,
      );
    }

    // Update branch head
    await this.supabase
      .from('branches')
      .update({ head_commit_id: commitId })
      .eq('id', targetBranchId);

    // Update draft
    await this.supabase.from('drafts').upsert({
      branch_id: targetBranchId,
      snapshot,
      updated_at: new Date().toISOString(),
    });

    return {
      id: commit.id,
      branch_id: commit.branch_id,
      message: commit.message,
      snapshot: commit.snapshot,
      created_by: commit.created_by,
      created_at: commit.created_at,
    };
  }

  /**
   * Get branch by ID
   */
  private async getBranchById(branchId: string): Promise<BranchDbRow | null> {
    const { data } = await this.supabase
      .from('branches')
      .select('*')
      .eq('id', branchId)
      .single();

    return data as BranchDbRow | null;
  }

  /**
   * Verify user has edit permission on project
   */
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

  /**
   * Create empty snapshot template
   */
  private createEmptySnapshot(): DraftSnapshot {
    return {
      schemaVersion: 1,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [],
      notes: [],
    };
  }

  // ==========================================================================
  // UC-52: Delete Branch
  // ==========================================================================

  /**
   * Get preview of what will be deleted when removing a branch
   */
  async getDeletePreview(branchId: string): Promise<DeleteBranchPreview> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Count commits unique to this branch
    const { data: commits } = await this.supabase
      .from('commits')
      .select('id')
      .eq('branch_id', branchId);

    const unmergedCommitIds = (commits ?? []).map((c) => c.id);

    return {
      branchId: branch.id,
      branchName: branch.name,
      isDefault: branch.is_default,
      unmergedCommitsCount: unmergedCommitIds.length,
      unmergedCommitIds,
    };
  }

  /**
   * Delete a branch
   */
  async deleteBranch(userId: string, branchId: string): Promise<void> {
    const branch = await this.getBranchById(branchId);
    if (!branch) {
      throw new NotFoundException('Branch not found');
    }

    // Verify user has edit permission
    await this.verifyUserEditPermission(branch.project_id, userId);

    // BR-54: Cannot delete default branch
    if (branch.is_default) {
      throw new BadRequestException(
        "Cannot delete the project's default branch",
      );
    }

    // BR-54: Cannot delete currently active branch
    const isActive = await this.isBranchActiveForUser(userId, branchId);
    if (isActive) {
      throw new BadRequestException(
        'Cannot delete the currently active branch. Switch to another branch first.',
      );
    }

    // Delete draft record first
    await this.supabase.from('drafts').delete().eq('branch_id', branchId);

    // Delete branch record
    const { error } = await this.supabase
      .from('branches')
      .delete()
      .eq('id', branchId);

    if (error) {
      throw new InternalServerErrorException(
        `Failed to delete branch: ${error.message}`,
      );
    }

    // Note: We do NOT delete commits - they are kept for history integrity
  }

  /**
   * Check if a branch is currently active for a user
   */
  private async isBranchActiveForUser(
    userId: string,
    branchId: string,
  ): Promise<boolean> {
    // Check if there's a recent draft activity for this user on this branch
    // This is a simplified check - in production, you might have a user_sessions table
    // or check the most recently accessed draft
    const { data: recentDraft } = await this.supabase
      .from('drafts')
      .select('branch_id')
      .eq('branch_id', branchId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // If there's a draft associated with this branch, consider it potentially active
    // The actual "active branch" for a user would be tracked in a user session/context
    return recentDraft !== null;
  }
}
