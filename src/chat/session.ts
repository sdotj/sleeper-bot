import type { SleepBotOperations } from "../core/index.js";
import {
  ChatHistory,
  memoryBlock,
  MEMORY_GUIDANCE,
  newConversation,
  trimForModel,
  type Conversation,
} from "../history/index.js";
import { generateTitle, runChatTurn, type ChatMessage } from "./chatLoop.js";

/** The model-loop function, injectable so the orchestration is testable offline. */
export type ChatRunner = (
  ops: SleepBotOperations,
  history: ChatMessage[],
  opts: Parameters<typeof runChatTurn>[2],
) => Promise<{ reply: string; toolCalls: string[] }>;

/** Generates a thread title; injectable for offline tests. */
export type Titler = (userMsg: string, reply: string) => Promise<string | null>;

/**
 * Per-conversation in-process mutex (audit #6). The model call runs unlocked
 * (concurrency preserved), but the read-modify-write that appends the turn is
 * serialized per conversation, so two concurrent turns can't each save a stale
 * snapshot and lose the other's messages. Single-process only — a multi-writer
 * deploy needs append-only rows or a transaction (see docs/deploy.md).
 */
const convoLocks = new Map<string, Promise<void>>();
async function withConvoLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  while (convoLocks.has(id)) await convoLocks.get(id);
  let release!: () => void;
  convoLocks.set(id, new Promise<void>((r) => (release = r)));
  try {
    return await fn();
  } finally {
    convoLocks.delete(id);
    release();
  }
}

export interface PersistedTurnInput {
  conversationId?: string;
  message: string;
  leagueId?: string;
}

/**
 * Run one turn of the PERSISTED main chat (dec.chat-history-memory): load the
 * conversation, append the user message, run the model loop over the trimmed
 * history, then save the user + assistant messages. Nothing is written until the
 * turn succeeds, so a missing ANTHROPIC_API_KEY (runChatTurn throws) can't leave
 * an orphan thread. Returns the (possibly newly created) conversation id.
 */
export async function runPersistedTurn(
  ops: SleepBotOperations,
  history: ChatHistory,
  input: PersistedTurnInput,
  opts: Parameters<typeof runChatTurn>[2] = {},
  runner: ChatRunner = runChatTurn,
  titler: Titler = generateTitle,
): Promise<{ conversationId: string; reply: string; toolCalls: string[] }> {
  const message = input.message.trim();
  if (!message) throw new Error("message is required");

  const existing = input.conversationId ? await history.get(input.conversationId) : null;
  if (input.conversationId && !existing) {
    throw new Error(`unknown conversationId "${input.conversationId}"`);
  }
  const convo: Conversation = existing ?? newConversation(message, input.leagueId);

  const modelHistory = trimForModel([...convo.messages, { role: "user", content: message, at: Date.now() }]);
  // Always inject the proactive-memory guidance; add the current notes when any
  // exist. This makes the assistant capture facts from the very first message.
  const systemExtra = [opts.systemExtra, MEMORY_GUIDANCE, memoryBlock(await ops.memory.list())]
    .filter(Boolean)
    .join("\n\n");
  // May throw (e.g. ChatUnavailableError) BEFORE we persist anything.
  const { reply, toolCalls } = await runner(ops, modelHistory, { ...opts, systemExtra });

  // Auto-title a brand-new thread from its first exchange (best-effort).
  if (!existing) {
    const title = await titler(message, reply).catch(() => null);
    if (title) convo.title = title;
  }

  const userTurn = { role: "user" as const, content: message, at: Date.now() };
  const assistantTurn = { role: "assistant" as const, content: reply, at: Date.now() };

  // Serialize the append PER CONVERSATION (audit #6/#13). Inside the lock we
  // re-read the freshest stored copy and append to THAT, so concurrent turns on
  // one thread each build on the other's write instead of clobbering it.
  return withConvoLock(convo.id, async () => {
    let target = convo;
    if (existing) {
      const fresh = await history.get(convo.id);
      // Deleted mid-turn → do NOT resurrect it (audit #6); the reply is already
      // returned to the caller, it just isn't persisted to a gone thread.
      if (!fresh) return { conversationId: convo.id, reply, toolCalls };
      target = fresh;
    }
    target.messages.push(userTurn, assistantTurn);
    target.updatedAt = Date.now();
    if (convo.title && !target.title) target.title = convo.title;
    await history.save(target);
    return { conversationId: target.id, reply, toolCalls };
  });
}
