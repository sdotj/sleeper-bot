import { randomUUID } from "node:crypto";
import type { Store } from "../audit/index.js";

/**
 * Long-term chat memory (dec.chat-history-memory, Phase 2): short durable facts
 * the assistant should apply across ALL conversations — preferences, league
 * quirks, your team's situation. Model-assisted + manual: the model saves facts
 * via the remember_fact tool when you ask it to, and you curate the list in the
 * UI. Notes are injected into the chat system prompt every turn. A pure store
 * sink, like ChatHistory.
 */

export interface MemoryNote {
  id: string;
  text: string;
  createdAt: number;
  /** "user" = added in the memory editor; "model" = saved via remember_fact. */
  source: "user" | "model";
}

const COLLECTION = "chat_memory";
const MAX_LEN = 500;
const DEFAULT_MAX_NOTES = 50;

export class MemoryStore {
  constructor(
    private readonly store: Store,
    /** Cap on stored notes; the oldest beyond this are pruned (dec.chat-history-memory). */
    private readonly maxNotes: number = DEFAULT_MAX_NOTES,
  ) {}

  /** All notes, oldest first (stable order for the injected block). */
  async list(): Promise<MemoryNote[]> {
    const all = await this.store.list<MemoryNote>(COLLECTION);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Add a note, de-duplicating on identical (case-insensitive) text. Because the
   * assistant captures facts proactively, a cap keeps the list bounded: once over
   * the cap, the oldest notes are pruned.
   */
  async add(text: string, source: "user" | "model" = "user"): Promise<MemoryNote> {
    const trimmed = text.trim().slice(0, MAX_LEN);
    if (!trimmed) throw new Error("memory text is required");
    const current = await this.list();
    const existing = current.find((n) => n.text.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;

    const note: MemoryNote = { id: randomUUID(), text: trimmed, createdAt: Date.now(), source };
    await this.store.put(COLLECTION, note.id, note);

    // Prune the oldest beyond the cap (current + the one just added).
    const overflow = current.length + 1 - this.maxNotes;
    for (let i = 0; i < overflow; i++) await this.store.delete(COLLECTION, current[i].id);
    return note;
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(COLLECTION, id);
  }
}

/**
 * Standing instruction to capture memory PROACTIVELY, injected into every
 * persisted main-chat turn even when there are no notes yet (dec.chat-history-memory).
 */
export const MEMORY_GUIDANCE = [
  "## REMEMBERING",
  "You keep long-term memory across chats. PROACTIVELY call remember_fact whenever the user reveals a durable fact — even if they don't say \"remember\": their team situation or strategy (rebuilding, win-now), roster/league context (dynasty vs redraft, PPR, team size), players they love or refuse to drop, and standing preferences. Save one concise fact per call; don't duplicate what's already in MEMORY below. Do NOT save one-off questions, this week's matchup, or ephemeral game state. When the user asks you to forget something, call forget_fact with its [id].",
].join("\n");

/**
 * Format the current memory notes as a system-prompt block. Ids are included so
 * the model can forget a specific note by id. Empty string when there are none.
 */
export function memoryBlock(notes: MemoryNote[]): string {
  if (!notes.length) return "";
  return [
    "## MEMORY",
    "Durable facts you've remembered about this user. Apply them, and prefer them over assumptions.",
    ...notes.map((n) => `- [${n.id}] ${n.text}`),
  ].join("\n");
}
