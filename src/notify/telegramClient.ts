/**
 * TelegramClient — a thin wrapper over the Telegram Bot API (HTTPS, no SDK).
 * The bot token is server-side only; the transport is injectable so the
 * approval flow is unit-tested offline (dec.telegram-notifications).
 */
const BASE = "https://api.telegram.org";

export interface InlineButton {
  text: string;
  callback_data: string;
}

/** One long-poll update we care about (a button tap). */
export interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
    from?: { id: number };
  };
}

/** Minimal fetch shape so tests can inject a fake transport. */
export type TgFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<{ status: number; text(): Promise<string> }>;

const defaultFetch: TgFetch = (url, init) => fetch(url, init) as unknown as ReturnType<TgFetch>;

export class TelegramClient {
  constructor(
    private readonly token: string,
    private readonly fetchFn: TgFetch = defaultFetch,
  ) {}

  private async call<T>(method: string, body: unknown): Promise<T> {
    const res = await this.fetchFn(`${BASE}/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const parsed = JSON.parse(await res.text()) as { ok: boolean; result?: T; description?: string };
    if (!parsed.ok) throw new Error(`Telegram ${method} failed: ${parsed.description ?? res.status}`);
    return parsed.result as T;
  }

  sendMessage(chatId: string | number, text: string, buttons?: InlineButton[][]): Promise<{ message_id: number }> {
    return this.call("sendMessage", {
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }

  editMessageText(chatId: string | number, messageId: number, text: string): Promise<unknown> {
    return this.call("editMessageText", { chat_id: chatId, message_id: messageId, text, parse_mode: "HTML" });
  }

  answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
    return this.call("answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
  }

  /** Long-poll for updates since `offset`. */
  getUpdates(offset: number, timeoutSec = 25): Promise<TelegramUpdate[]> {
    return this.call("getUpdates", { offset, timeout: timeoutSec, allowed_updates: ["callback_query"] });
  }
}
