/**
 * In-memory fallback store for collaborator statuses ('pending' | 'accepted')
 * when the remote database table `project_collaborators` has not run the
 * migration to add the `status` column yet.
 */
export class CollaboratorStatusStore {
  private static statuses = new Map<string, 'pending' | 'accepted'>();

  static setStatus(id: string, status: 'pending' | 'accepted'): void {
    this.statuses.set(id, status);
  }

  static getStatus(id: string): 'pending' | 'accepted' | undefined {
    return this.statuses.get(id);
  }

  static deleteStatus(id: string): void {
    this.statuses.delete(id);
  }
}
