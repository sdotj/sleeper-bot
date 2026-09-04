import type { SleepBotOperations } from "../core/index.js";
import {
  ChatHistory,
  memoryBlock,
  newConversation,
  trimForModel,
  type Conversation,
} from "../history/index.js";
import { runChatTurn, type ChatMessage } from "./chatLoop.js";

/** The model-loop function, injectable so the orchestration is testable offline. */
export type ChatRunner = (
  ops: SleepBotOperations,
  history: ChatMessage[],
  opts: Parameters<typeof runChatTurn>[2],
) => Promise<{ reply: string; toolCalls: string[] }>;

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
): Promise<{ conversationId: string; reply: string; toolCalls: string[] }> {
  const message = input.message.trim();
  if (!message) throw new Error("message is required");

  const existing = input.conversationId ? await history.get(input.conversationId) : null;
  if (input.conversationId && !existing) {
    throw new Error(`unknown conversationId "${input.conversationId}"`);
  }
  const convo: Conversation = existing ?? newConversation(message, input.leagueId);

  const modelHistory = trimForModel([...convo.messages, { role: "user", content: message, at: Date.now() }]);
  // Inject long-term memory into the system prompt for this turn.
  const memoryExtra = memoryBlock(await ops.memory.list());
  const turnOpts = memoryExtra
    ? { ...opts, systemExtra: [opts.systemExtra, memoryExtra].filter(Boolean).join("\n\n") }
    : opts;
  // May throw (e.g. ChatUnavailableError) BEFORE we persist anything.
  const { reply, toolCalls } = await runner(ops, modelHistory, turnOpts);

  const now = Date.now();
  convo.messages.push({ role: "user", content: message, at: now });
  convo.messages.push({ role: "assistant", content: reply, at: now });
  convo.updatedAt = now;
  await history.save(convo);

  return { conversationId: convo.id, reply, toolCalls };
}
