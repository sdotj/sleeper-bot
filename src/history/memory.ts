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

export class MemoryStore {
  constructor(private readonly store: Store) {}

  /** All notes, oldest first (stable order for the injected block). */
  async list(): Promise<MemoryNote[]> {
    const all = await this.store.list<MemoryNote>(COLLECTION);
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Add a note, de-duplicating on identical (case-insensitive) text. */
  async add(text: string, source: "user" | "model" = "user"): Promise<MemoryNote> {
    const trimmed = text.trim().slice(0, MAX_LEN);
    if (!trimmed) throw new Error("memory text is required");
    const existing = (await this.list()).find((n) => n.text.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing;
    const note: MemoryNote = { id: randomUUID(), text: trimmed, createdAt: Date.now(), source };
    await this.store.put(COLLECTION, note.id, note);
    return note;
  }

  async remove(id: string): Promise<void> {
    await this.store.delete(COLLECTION, id);
  }
}

/**
 * Format memory notes as a system-prompt block. Ids are included so the model
 * can forget a specific note by id when the user asks. Empty string if there are
 * no notes (nothing is injected).
 */
export function memoryBlock(notes: MemoryNote[]): string {
  if (!notes.length) return "";
  return [
    "## MEMORY",
    "Durable facts the user asked you to remember. Apply them, and prefer them over assumptions.",
    ...notes.map((n) => `- [${n.id}] ${n.text}`),
    "When the user shares something worth remembering long-term, call remember_fact. When they ask you to forget one of the above, call forget_fact with its [id].",
  ].join("\n");
}
