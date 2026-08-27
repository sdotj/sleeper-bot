import Anthropic from "@anthropic-ai/sdk";
import type { SleepBotOperations } from "../core/index.js";
import { CHAT_TOOLS, dispatchTool } from "./tools.js";

/** Raised when chat can't run because no Anthropic credential is configured. */
export class ChatUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatUnavailableError";
  }
}

/** One turn of chat history as the GUI sends it. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const SYSTEM = `You are SleepBot, a fantasy-football assistant for the user's Sleeper league(s).

- Use the tools to fetch real data before answering; never invent rosters, standings, scores, or players.
- Player ids are opaque. Use search_players to turn a name into an id, and resolve ids back to names when you report anything.
- WRITES ARE CONFIRM-BY-DEFAULT. The propose_* tools only create a DRAFT and never send anything. Only call execute_action after the user has explicitly confirmed, in their own words, that they want that specific action sent. If a proposal is blocked or warned by a rule, relay that to the user and do not try to bypass it.
- Be concise and specific. Prefer tables/short lists for rosters and standings.`;

/**
 * Run one chat turn server-side: an Anthropic Messages API tool-use loop over
 * the shared operations (dec.chat-panel). Returns the assistant's final text
 * plus the names of tools it called. The Anthropic key stays on the server.
 */
export async function runChatTurn(
  ops: SleepBotOperations,
  history: ChatMessage[],
  opts: { model?: string; maxIterations?: number } = {},
): Promise<{ reply: string; toolCalls: string[] }> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new ChatUnavailableError(
      "Chat is unavailable: set ANTHROPIC_API_KEY on the server to enable the assistant.",
    );
  }

  const client = new Anthropic();
  const model = opts.model ?? process.env.ANTHROPIC_MODEL ?? "claude-opus-5";
  const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
  const toolCalls: string[] = [];
  const maxIterations = opts.maxIterations ?? 12;

  for (let i = 0; i < maxIterations; i++) {
    const res = await client.messages.create({
      model,
      max_tokens: 4096,
      system: SYSTEM,
      tools: CHAT_TOOLS,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    if (res.stop_reason !== "tool_use") {
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "(no response)", toolCalls };
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of res.content) {
      if (block.type === "tool_use") {
        toolCalls.push(block.name);
        try {
          const out = await dispatchTool(ops, block.name, block.input);
          results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out ?? null) });
        } catch (err) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            is_error: true,
            content: `Error: ${(err as Error).message}`,
          });
        }
      }
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: "Stopped after too many tool calls — try a narrower question.", toolCalls };
}
