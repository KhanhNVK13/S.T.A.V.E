import { Injectable, Logger } from '@nestjs/common';

export type BranchMovedListener = (
  projectId: string,
  branchId: string,
  commitId: string,
  byUserId: string,
) => void;

@Injectable()
export class BranchMovedNotifier {
  private readonly logger = new Logger(BranchMovedNotifier.name);
  private readonly listeners = new Set<BranchMovedListener>();

  subscribe(listener: BranchMovedListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(
    projectId: string,
    branchId: string,
    commitId: string,
    byUserId: string,
  ): void {
    for (const listener of this.listeners) {
      try {
        listener(projectId, branchId, commitId, byUserId);
      } catch (err) {
        this.logger.error(
          `branch:moved listener failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }
}
