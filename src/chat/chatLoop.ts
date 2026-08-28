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

/**
 * When the chat is opened from a draft room, the GUI passes this so the server
 * can inject the live board into the model's context on every turn — the
 * assistant is always current without the user pasting a draft id or asking it
 * to "check the board".
 */
export interface DraftContextRef {
  leagueId: string;
  draftId: string;
  rosterId?: number;
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
  opts: {
    model?: string;
    maxIterations?: number;
    maxTokens?: number;
    draftContext?: DraftContextRef;
    /** Enable the web-search server tool (on-demand). false disables it. */
    web?: { maxUses?: number } | false;
  } = {},
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
  const maxTokens = opts.maxTokens ?? 4096;

  // Web search is a server-side tool: basic variant works across models
  // (incl. Haiku). It's available on-demand; the system prompt tells the model
  // to only reach for it when the user wants current external info.
  const webOn = opts.web !== false && (process.env.SLEEPBOT_WEB_SEARCH ?? "on") !== "off";
  const tools: Anthropic.MessageCreateParams["tools"] = [...CHAT_TOOLS];
  if (webOn) {
    tools.push({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: (opts.web ? opts.web.maxUses : undefined) ?? 3,
    });
  }

  // Resolve the live draft snapshot once at the start of the turn (seconds old
  // when the model answers). It's re-fetched fresh on the next turn.
  const system = opts.draftContext
    ? `${SYSTEM}\n\n${await draftContextBlock(ops, opts.draftContext)}`
    : SYSTEM;

  for (let i = 0; i < maxIterations; i++) {
    const res = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system,
      tools,
      messages,
    });
    messages.push({ role: "assistant", content: res.content });

    // Record server-side tool use (web search) for observability.
    for (const b of res.content) {
      if (b.type === "server_tool_use") toolCalls.push(b.name);
    }

    // A server tool (web search) is mid-run — let it continue, nothing to send back.
    if (res.stop_reason === "pause_turn") continue;

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
    // No custom tool actually ran (e.g. only server-tool blocks) — return text.
    if (results.length === 0) {
      const reply = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return { reply: reply || "(no response)", toolCalls };
    }
    messages.push({ role: "user", content: results });
  }

  return { reply: "Stopped after too many tool calls — try a narrower question.", toolCalls };
}

/** Build a compact live-draft snapshot to prepend to the system prompt. */
async function draftContextBlock(ops: SleepBotOperations, ref: DraftContextRef): Promise<string> {
  try {
    const [board, recs, byPos] = await Promise.all([
      ops.getDraftBoard(ref.leagueId, ref.draftId, ref.rosterId),
      ops.getDraftRecommendations(ref.leagueId, ref.draftId, { rosterId: ref.rosterId, limit: 12 }),
      ops.getDraftBestByPosition(ref.leagueId, ref.draftId, { rosterId: ref.rosterId, perPosition: 3 }),
    ]);
    const otc = board.onTheClock
      ? `pick #${board.onTheClock.pickNo} (round ${board.onTheClock.round}, slot ${board.onTheClock.slot}` +
        `${board.onTheClock.rosterId != null ? `, roster ${board.onTheClock.rosterId}` : ""})`
      : "n/a";
    const recent =
      board.recentPicks
        .slice(0, 8)
        .map((p) => `#${p.pickNo} ${p.playerName} (${p.position})`)
        .join(", ") || "none yet";
    const overall = recs
      .map((r) => `${r.name} (${r.position}${r.team ? ` ${r.team}` : ""}, val ${r.value})`)
      .join("; ");
    // Per-position so kickers, defenses, and every position stay visible even
    // late in the draft when they don't crack the overall top list.
    const perPos = ["QB", "RB", "WR", "TE", "K", "DEF"]
      .filter((pos) => byPos[pos]?.length)
      .map((pos) => `${pos}: ${byPos[pos].map((r) => r.name).join(", ")}`)
      .join(" | ");
    return [
      `## LIVE DRAFT ROOM (this is the user's active draft; snapshot current as of this message)`,
      `draftId ${ref.draftId} · status ${board.draft.status} · ${board.draft.type} · ${board.draft.rounds} rounds × ${board.draft.teams} teams · ${board.pickCount} picks made.`,
      `On the clock: ${otc}.`,
      ref.rosterId != null
        ? `The user is roster ${ref.rosterId}; their next pick is #${board.yourNextPickNo ?? "unknown"}.`
        : `The user did not set their roster/slot, so "your next pick" and roster-need weighting are unavailable.`,
      `Recent picks (newest first): ${recent}.`,
      `Top available overall (value-over-replacement, need-weighted): ${overall}.`,
      `Best available by position: ${perPos}.`,
      `Values reflect the league's mode (redraft = Sleeper season ranks, dynasty = KTC). For deeper queries call the draft tools with draftId ${ref.draftId}.`,
      `SPEED: this is a live draft with a pick clock. Answer who-to-pick / availability questions IMMEDIATELY from this snapshot — do NOT web-search for those, the data is already current. Only web_search when the user explicitly asks for news, injuries, or outside opinion. Keep answers short.`,
    ].join("\n");
  } catch (err) {
    return `## LIVE DRAFT ROOM\n(Could not load the live board: ${(err as Error).message}. Use the draft tools with draftId ${ref.draftId} to fetch it.)`;
  }
}
