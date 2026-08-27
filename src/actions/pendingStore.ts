import type { Store } from "../audit/store.js";
import type { ProposedAction } from "./ProposedAction.js";

/**
 * PendingStore — the durable set of proposed actions awaiting confirmation.
 * Backed by the shared {@link Store}, so drafts survive a cloud redeploy
 * (dec.write-action-pipeline, dec.action-audit-log).
 */
export class PendingStore {
  private static readonly COLLECTION = "pending";

  constructor(private readonly store: Store) {}

  async put(action: ProposedAction): Promise<void> {
    await this.store.put(PendingStore.COLLECTION, action.id, action);
  }

  async get(id: string): Promise<ProposedAction | null> {
    return this.store.get<ProposedAction>(PendingStore.COLLECTION, id);
  }

  /** Still-pending actions (optionally for one league), newest first. */
  async list(leagueId?: string): Promise<ProposedAction[]> {
    const all = await this.store.list<ProposedAction>(PendingStore.COLLECTION);
    return all
      .filter((a) => a.status === "pending" && (!leagueId || a.leagueId === leagueId))
      .sort((a, b) => b.createdMs - a.createdMs);
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(PendingStore.COLLECTION, id);
  }
}
