import { randomUUID } from "node:crypto";
import type { Store } from "../audit/index.js";

/**
 * Persistent chat history (dec.chat-history-memory). Conversations live in the
 * store (Postgres in the cloud), so the main chat survives a reload and past
 * threads can be listed and resumed. This module is a pure sink over the Store —
 * it knows nothing about the model loop — so the core can compose it without a
 * dependency cycle. The draft-room chat is deliberately NOT persisted (it's
 * bound to a live board and ephemeral by design).
 */

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
  /** Epoch ms. */
  at: number;
}

export interface Conversation {
  id: string;
  title: string;
  /** The league the chat was opened under, when known (for future scoping). */
  leagueId?: string;
  createdAt: number;
  updatedAt: number;
  messages: StoredMessage[];
}

/** A lightweight row for the conversation list (no message bodies). */
export interface ConversationSummary {
  id: string;
  title: string;
  leagueId?: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/** A model-ready message (structurally the chat loop's ChatMessage). */
export interface ModelMessage {
  role: "user" | "assistant";
  content: string;
}

const COLLECTION = "chat_conversations";

export class ChatHistory {
  constructor(private readonly store: Store) {}

  /** All conversations, newest activity first, without message bodies. */
  async list(): Promise<ConversationSummary[]> {
    const all = await this.store.list<Conversation>(COLLECTION);
    return all
      .map((c) => ({
        id: c.id,
        title: c.title,
        leagueId: c.leagueId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        messageCount: c.messages?.length ?? 0,
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async get(id: string): Promise<Conversation | null> {
    return this.store.get<Conversation>(COLLECTION, id);
  }

  async save(convo: Conversation): Promise<void> {
    await this.store.put(COLLECTION, convo.id, convo);
  }

  async rename(id: string, title: string): Promise<Conversation> {
    const convo = await this.get(id);
    if (!convo) throw new Error(`unknown conversationId "${id}"`);
    const trimmed = title.trim();
    if (trimmed) convo.title = trimmed.slice(0, 80);
    convo.updatedAt = Date.now();
    await this.save(convo);
    return convo;
  }

  async delete(id: string): Promise<void> {
    await this.store.delete(COLLECTION, id);
  }
}

/** A concise conversation title from the first user message. */
export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, " ");
  return t.length <= 48 ? t || "New chat" : `${t.slice(0, 47)}…`;
}

/**
 * Build the message list sent to the model, keeping the MOST RECENT messages
 * within a rough character budget so a long thread can't blow the context
 * window. (A token-count budget is a later refinement; chars/4 ≈ tokens.)
 */
export function trimForModel(messages: StoredMessage[], maxChars = 48_000): ModelMessage[] {
  const out: ModelMessage[] = [];
  let total = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    total += messages[i].content.length;
    if (total > maxChars && out.length > 0) break;
    out.unshift({ role: messages[i].role, content: messages[i].content });
  }
  return out;
}

/** Assemble a fresh conversation document (lazy-created on the first message). */
export function newConversation(firstMessage: string, leagueId?: string): Conversation {
  const now = Date.now();
  return {
    id: randomUUID(),
    title: titleFrom(firstMessage),
    leagueId,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}
