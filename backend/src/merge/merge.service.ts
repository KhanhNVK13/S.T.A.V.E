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

    // Apply resolutions
    const mergedSnapshot = this.applyResolutions(
      baseSnapshot,
      sourceSnapshot,
      targetSnapshot,
      resolutions,
    );

    // Create merge commit
    const commitMessage =
      message ??
      `Merge branch '${sourceBranch.name}' into ${targetBranch.name}`;
    const commit = await this.createMergeCommit(
      userId,
      targetBranchId,
      mergedSnapshot,
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
        conflictsByBar: this.groupConflictsByBar(notesResult.conflicts),
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

      // Case 1: Unchanged - note same in source and target
      if (sourceNote && targetNote && this.notesEqual(sourceNote, targetNote)) {
        merged.push(sourceNote);
        continue;
      }

      // Case 2: Source-Only Modified/Added (target unchanged from base)
      if (sourceNote && !targetNote) {
        // Check if target changed from base
        if (!baseNote) {
          // Source added new note - include it
          merged.push(sourceNote);
          continue;
        }
        // Target deleted this note - it's a conflict
        if (targetNote && !this.notesEqual(baseNote, targetNote)) {
          // Target explicitly deleted
          conflicts.push({
            noteId,
            baseNote,
            sourceNote,
            targetNote: undefined,
            type: 'DELETE_VS_MODIFY',
          });
          continue;
        }
        merged.push(sourceNote);
        continue;
      }

      // Case 3: Target-Only Modified/Added (source unchanged from base)
      if (targetNote && !sourceNote) {
        // Check if source changed from base
        if (!baseNote) {
          // Target added new note - include it
          merged.push(targetNote);
          continue;
        }
        // Source deleted this note - it's a conflict
        if (sourceNote && !this.notesEqual(baseNote, sourceNote)) {
          // Source explicitly deleted
          conflicts.push({
            noteId,
            baseNote,
            sourceNote: undefined,
            targetNote,
            type: 'DELETE_VS_MODIFY',
          });
          continue;
        }
        merged.push(targetNote);
        continue;
      }

      // Case 4: Both Modified
      if (sourceNote && targetNote) {
        // Check if both modified the same way
        const sourceChanged = baseNote
          ? !this.notesEqual(sourceNote, baseNote)
          : true;
        const targetChanged = baseNote
          ? !this.notesEqual(targetNote, baseNote)
          : true;

        if (sourceChanged && targetChanged) {
          // Both changed - check if they changed the same way
          if (this.notesEqual(sourceNote, targetNote)) {
            // Same change - include it
            merged.push(sourceNote);
          } else {
            // Different changes - CONFLICT
            conflicts.push({
              noteId,
              baseNote,
              sourceNote,
              targetNote,
              type: 'MODIFIED_DIFFERENTLY',
            });
          }
        } else if (sourceChanged) {
          // Only source changed - use source
          merged.push(sourceNote);
        } else if (targetChanged) {
          // Only target changed - use target
          merged.push(targetNote);
        } else {
          // Neither changed - include base
          merged.push(baseNote!);
        }
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
   * Group conflicts by bar number
   */
  private groupConflictsByBar(
    conflicts: NoteConflict[],
  ): Record<number, NoteConflict[]> {
    const ticksPerBar = 1920; // Assuming 4/4 time signature at 480 PPQ

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
}
