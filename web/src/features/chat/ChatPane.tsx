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
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
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
      setMessages(convo.messages.map((m) => ({ role: m.role, content: m.content })));
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
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
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
    if (!window.confirm("Delete this conversation? This can't be undone.")) return;
    try {
      await api.deleteConversation(id);
      if (id === activeId) newChat();
      await refreshConvos();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex h-[72vh] overflow-hidden rounded-xl border border-border bg-surface">
      {/* Sidebar */}
      <aside className="flex w-52 shrink-0 flex-col border-r border-border">
        <div className="p-2">
          <Button variant="primary" onClick={newChat} className="w-full">
            + New chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {convos.length === 0 && <p className="px-2 py-1 text-xs text-faint">No conversations yet.</p>}
          {convos.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm",
                c.id === activeId ? "bg-surface-2 text-text" : "text-muted hover:bg-surface-2/60",
              )}
            >
              <button className="flex-1 truncate text-left" onClick={() => void openConvo(c.id)} title={c.title}>
                {c.title}
              </button>
              <button
                className="hidden text-faint hover:text-text group-hover:block"
                onClick={() => void rename(c.id)}
                title="Rename"
              >
                ✎
              </button>
              <button
                className="hidden text-faint hover:text-danger group-hover:block"
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
      <div className="flex min-w-0 flex-1 flex-col p-3">
        <div ref={listRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-1">
          {loadingThread && <p className="px-1 py-2 text-sm text-muted">Loading…</p>}
          {!loadingThread && messages.length === 0 && (
            <p className="px-1 py-2 text-sm leading-relaxed text-muted">
              Ask SleepBot about your league — rosters, waivers, trades, start/sit. Conversations are
              saved; pick one on the left or start a new chat. Writes stay confirm-first.
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
        <div className="mt-3 flex items-end gap-2">
          <textarea
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
          <Button variant="primary" onClick={() => void send()} disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
