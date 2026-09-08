import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { cn } from "../../lib/cn";
import type { ConversationSummary } from "../../lib/types";
import { Button } from "../../components/ui";
import { Bubble, TypingIndicator } from "./Chat";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/**
 * The main, PERSISTED chat (dec.chat-history-memory): a conversation sidebar
 * plus a thread view. Sends `{ conversationId?, message }`; the server owns the
 * history. (The draft-room chat still uses the ephemeral <Chat/> component.)
 */
export function ChatPane() {
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Bumped whenever the visible thread changes (open a convo / new chat). An
  // in-flight request captures the token at send time and only applies its
  // result if the token still matches — so a response can't land in a thread the
  // user has since switched away to (audit #16).
  const viewToken = useRef(0);

  // Initial load: list conversations and open the most recent one.
  useEffect(() => {
    void (async () => {
      try {
        const list = await api.conversations();
        setConvos(list);
        if (list.length) await openConvo(list[0].id);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  async function refreshConvos() {
    try {
      setConvos(await api.conversations());
    } catch {
      /* non-fatal */
    }
  }

  async function openConvo(id: string) {
    const token = ++viewToken.current;
    setActiveId(id);
    setError(null);
    setLoadingThread(true);
    try {
      const convo = await api.conversation(id);
      if (viewToken.current !== token) return; // switched threads while loading
      setMessages(
        convo.messages.map((m) => ({ role: m.role, content: m.content })),
      );
    } catch (e) {
      if (viewToken.current !== token) return;
      setError((e as Error).message);
      setMessages([]);
    } finally {
      if (viewToken.current === token) setLoadingThread(false);
    }
  }

  function newChat() {
    ++viewToken.current;
    setActiveId(null);
    setMessages([]);
    setInput("");
    setError(null);
    setLoadingThread(false); // a pending openConvo's finally won't fire for the new view (audit #16)
  }

  async function send() {
    const text = input.trim();
    // Don't send while a thread is still loading — a late history response could
    // otherwise replace the turn we just added (audit #16).
    if (!text || busy || loadingThread) return;
    const token = viewToken.current; // the thread this send belongs to
    const sentConvoId = activeId ?? undefined;
    setMessages((m) => [...m, { role: "user", content: text }]);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await api.sendChat(text, sentConvoId);
      if (viewToken.current === token) {
        // Still on the thread we sent from — show the reply here.
        setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
        if (!sentConvoId) setActiveId(res.conversationId);
      }
      // The reply is persisted server-side regardless; refresh the list either way.
      void refreshConvos();
    } catch (e) {
      if (viewToken.current === token) setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    const current = convos.find((c) => c.id === id)?.title ?? "";
    const title = window.prompt("Rename conversation", current);
    if (title == null) return;
    try {
      await api.renameConversation(id, title);
      await refreshConvos();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this conversation? This can't be undone."))
      return;
    try {
      await api.deleteConversation(id);
      if (id === activeId) newChat();
      await refreshConvos();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="chat-layout grid min-h-[560px] gap-4 md:h-[660px] md:grid-cols-[300px_minmax(0,1fr)]">
      {/* Sidebar */}
      <aside className="flex max-h-48 flex-col overflow-hidden rounded-[14px] border border-border bg-surface md:max-h-none">
        <div className="p-[10px]">
          <Button variant="primary" onClick={newChat} className="w-full">
            + New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto pb-2">
          {convos.length === 0 && (
            <p className="px-2 py-1 text-xs text-faint">
              No conversations yet.
            </p>
          )}
          {convos.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 border-l-[3px] px-[11px] py-[11px] text-[13px]",
                c.id === activeId
                  ? "border-accent bg-surface-2 text-text"
                  : "border-transparent text-muted hover:bg-surface-2",
              )}
            >
              <button
                className="flex-1 truncate text-left"
                onClick={() => void openConvo(c.id)}
                title={c.title}
              >
                {c.title}
                <span className="mt-0.5 block text-[11px] leading-[13px] text-faint">
                  {new Date(c.updatedAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </button>
              <button
                className="text-faint hover:text-text opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                onClick={() => void rename(c.id)}
                title="Rename"
              >
                ✎
              </button>
              <button
                className="text-faint hover:text-danger opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"
                onClick={() => void remove(c.id)}
                title="Delete"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </aside>

      {/* Thread */}
      <div className="flex min-h-[440px] min-w-0 flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
        <div
          ref={listRef}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
        >
          {loadingThread && (
            <p className="px-1 py-2 text-sm text-muted">Loading…</p>
          )}
          {!loadingThread && messages.length === 0 && (
            <p className="px-1 py-2 text-sm leading-relaxed text-muted">
              Ask SleepBot about your league — rosters, waivers, trades,
              start/sit. Conversations are saved; pick one on the left or start
              a new chat. Writes stay confirm-first.
            </p>
          )}
          {messages.map((m, i) => (
            <Bubble key={i} role={m.role}>
              {m.content}
            </Bubble>
          ))}
          {busy && <TypingIndicator />}
          {error && <p className="px-1 text-sm text-danger">⚠ {error}</p>}
        </div>
        <div className="flex items-end gap-[10px] border-t border-border p-[14px]">
          <textarea
            aria-label="Message SleepBot"
            value={input}
            placeholder="Message SleepBot…"
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            className="h-10 flex-1 resize-none rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text placeholder:text-faint focus:border-accent/40 focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
          <Button
            variant="primary"
            onClick={() => void send()}
            disabled={busy || loadingThread || !input.trim()}
          >
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
