import { describe, expect, it, vi } from "vitest";
import { InMemoryStore } from "../audit/index.js";
import { TelegramClient, type TgFetch } from "./telegramClient.js";
import { Notifier, type ProposalNotice } from "./notifier.js";

const notice = (over: Partial<ProposalNotice> = {}): ProposalNotice => ({
  id: "a1",
  leagueId: "L1",
  kind: "add_drop",
  payload: { rosterId: 2, addPlayerId: "x", dropPlayerId: "y" },
  summary: "Add X, drop Y",
  warnings: [],
  blockedReasons: [],
  ...over,
});

/** Fake TelegramClient recording calls; sendMessage returns an incrementing id. */
function fakeTelegram() {
  let mid = 100;
  return {
    sendMessage: vi.fn(async () => ({ message_id: ++mid })),
    editMessageText: vi.fn(async () => ({})),
    answerCallbackQuery: vi.fn(async () => ({})),
    getUpdates: vi.fn(async () => []),
  };
}

function makeNotifier(perform = vi.fn(async () => ({ ok: true, message: "sent" }))) {
  const telegram = fakeTelegram();
  const store = new InMemoryStore();
  const notifier = new Notifier({ telegram: telegram as unknown as TelegramClient, store, chatId: "555", perform });
  return { notifier, telegram, store, perform };
}

describe("TelegramClient", () => {
  it("posts sendMessage with text + inline keyboard and returns the message id", async () => {
    const calls: { url: string; body: string }[] = [];
    const fetchFn: TgFetch = async (url, init) => {
      calls.push({ url, body: init.body });
      return { status: 200, text: async () => JSON.stringify({ ok: true, result: { message_id: 7 } }) };
    };
    const client = new TelegramClient("TOKEN", fetchFn);
    const r = await client.sendMessage("555", "hi", [[{ text: "Yes", callback_data: "ok:1" }]]);
    expect(r.message_id).toBe(7);
    expect(calls[0].url).toBe("https://api.telegram.org/botTOKEN/sendMessage");
    const body = JSON.parse(calls[0].body);
    expect(body.chat_id).toBe("555");
    expect(body.reply_markup.inline_keyboard[0][0].callback_data).toBe("ok:1");
  });

  it("registers a webhook with a secret token", async () => {
    let sent: any;
    const fetchFn: TgFetch = async (url, init) => {
      sent = { url, body: JSON.parse(init.body) };
      return { status: 200, text: async () => JSON.stringify({ ok: true, result: true }) };
    };
    await new TelegramClient("TOKEN", fetchFn).setWebhook("https://x.run.app/internal/telegram", "s3cret");
    expect(sent.url).toBe("https://api.telegram.org/botTOKEN/setWebhook");
    expect(sent.body).toMatchObject({ url: "https://x.run.app/internal/telegram", secret_token: "s3cret" });
  });
});

describe("Notifier", () => {
  it("sends an Approve/Deny proposal and stores it", async () => {
    const { notifier, telegram, store } = makeNotifier();
    await notifier.propose(notice(), "approve");
    const buttons = telegram.sendMessage.mock.calls[0][2] as { callback_data: string }[][];
    expect(buttons[0].map((b) => b.callback_data)).toEqual(["ok:a1", "no:a1"]);
    expect(await store.get("agent_outbox", "a1")).toBeTruthy();
  });

  it("approve tap executes (no override), clears the outbox, and edits the message", async () => {
    const { notifier, telegram, store, perform } = makeNotifier();
    await notifier.propose(notice(), "approve");
    await notifier.handleCallback("ok:a1", "cq1");
    expect(perform).toHaveBeenCalledWith("L1", "add_drop", expect.anything(), { override: false });
    expect(await store.get("agent_outbox", "a1")).toBeNull();
    expect(telegram.editMessageText).toHaveBeenCalledOnce();
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith("cq1");
  });

  it("override tap executes with override:true", async () => {
    const { notifier, perform } = makeNotifier();
    await notifier.propose(notice({ blockedReasons: ["protect: Ja'Marr Chase"] }), "override");
    await notifier.handleCallback("ovr:a1", "cq2");
    expect(perform).toHaveBeenCalledWith("L1", "add_drop", expect.anything(), { override: true });
  });

  it("deny tap dismisses without performing", async () => {
    const { notifier, store, perform } = makeNotifier();
    await notifier.propose(notice(), "approve");
    await notifier.handleCallback("no:a1", "cq3");
    expect(perform).not.toHaveBeenCalled();
    expect(await store.get("agent_outbox", "a1")).toBeNull();
  });

  it("ignores a tap for an unknown/expired proposal", async () => {
    const { notifier, telegram, perform } = makeNotifier();
    await notifier.handleCallback("ok:missing", "cq4");
    expect(perform).not.toHaveBeenCalled();
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith("cq4", expect.stringMatching(/no longer pending/));
  });

  it("handleUpdate (webhook path) dispatches a tap from the allowed chat", async () => {
    const { notifier, perform } = makeNotifier();
    await notifier.propose(notice(), "approve");
    await notifier.handleUpdate({
      update_id: 5,
      callback_query: { id: "cq6", data: "ok:a1", message: { message_id: 1, chat: { id: 555 } } },
    });
    expect(perform).toHaveBeenCalledOnce();
  });

  it("rejects an ovr: tap on an approve-mode proposal without performing (audit #11)", async () => {
    const { notifier, store, perform, telegram } = makeNotifier();
    await notifier.propose(notice(), "approve"); // stored mode = approve
    await notifier.handleCallback("ovr:a1", "cq7"); // attacker/mismatched verb
    expect(perform).not.toHaveBeenCalled();
    expect(await store.get("agent_outbox", "a1")).toBeTruthy(); // left for the right button
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith("cq7", expect.stringMatching(/doesn't match/));
  });

  it("rejects a callback with no message (can't be authorized to the chat) (audit #11)", async () => {
    const { notifier, perform, telegram } = makeNotifier();
    await notifier.propose(notice(), "approve");
    await notifier.handleUpdate({ update_id: 9, callback_query: { id: "cq8", data: "ok:a1" } } as never);
    expect(perform).not.toHaveBeenCalled();
    expect(telegram.answerCallbackQuery).toHaveBeenCalledWith("cq8", expect.stringMatching(/Unauthorized/));
  });

  it("pollOnce ignores callbacks from a different chat", async () => {
    const { notifier, telegram, store, perform } = makeNotifier();
    await notifier.propose(notice(), "approve");
    telegram.getUpdates.mockResolvedValueOnce([
      { update_id: 1, callback_query: { id: "cq5", data: "ok:a1", message: { message_id: 1, chat: { id: 999 } } } },
    ] as never);
    await notifier.pollOnce();
    expect(perform).not.toHaveBeenCalled();
    expect(await store.get("agent_outbox", "a1")).toBeTruthy(); // untouched
  });
});
