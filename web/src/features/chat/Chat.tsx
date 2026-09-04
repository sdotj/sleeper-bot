import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { authHeaders, signalAuthRequired } from "../../lib/auth";
import { Button } from "../../components/ui";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

/** Optional live-draft scope: when set, the server injects the current board. */
export interface DraftContext {
  leagueId: string;
  draftId: string;
  rosterId?: number;
}

export function Chat({
  draftContext,
  placeholder = "Message SleepBot…",
  emptyHint,
}: {
  draftContext?: DraftContext;
  placeholder?: string;
  emptyHint?: ReactNode;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message (and the typing indicator) in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: text }];
    setMsgs(history);
    setInput("");
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: authHeaders({ "content-type": "application/json" }),
        body: JSON.stringify({ messages: history, draftContext }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 401 && data.code === "auth_required") signalAuthRequired();
        setError(data.error ?? "chat failed");
      } else setMsgs([...history, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={listRef} className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-1">
        {msgs.length === 0 && (
          <p className="px-1 py-2 text-sm leading-relaxed text-muted">
            {emptyHint ?? (
              <>
                Ask SleepBot about your league — “how do my starters look this week?”, “who’s
                trending on waivers?”, “draft a trade sending my WR2 for a RB”. It uses the same
                tools; writes stay confirm-first.
              </>
            )}
          </p>
        )}
        {msgs.map((m, i) => (
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
          placeholder={placeholder}
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
  );
}

function TypingIndicator() {
  return (
    <div
      className="flex max-w-[85%] items-center gap-1.5 self-start rounded-2xl rounded-bl-md border border-border bg-surface-2 px-4 py-3.5"
      aria-label="SleepBot is typing"
    >
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className="typing-dot h-1.5 w-1.5 rounded-full bg-muted"
          style={{ animationDelay: `${delay}ms` }}
        />
      ))}
    </div>
  );
}

function Bubble({
  role,
  muted,
  children,
}: {
  role: "user" | "assistant";
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
        role === "user"
          ? "self-end rounded-br-md bg-accent text-[#04122a]"
          : "self-start rounded-bl-md border border-border bg-surface-2",
        muted && "text-muted",
      )}
    >
      {children}
    </div>
  );
}
