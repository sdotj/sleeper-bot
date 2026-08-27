import { useRef, useState } from "react";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export function Chat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

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
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "chat failed");
      else setMsgs([...history, { role: "assistant", content: data.reply }]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollTo(0, listRef.current.scrollHeight));
    }
  }

  return (
    <div className="chat">
      <div className="chat-log" ref={listRef}>
        {msgs.length === 0 && (
          <p className="muted">
            Ask SleepBot about your league — “how do my starters look this week?”, “who’s trending on
            waivers?”, “draft a trade sending my WR2 for a RB”. It uses the same tools; writes stay
            confirm-first.
          </p>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content}
          </div>
        ))}
        {busy && <div className="bubble assistant muted">thinking…</div>}
        {error && <p className="error">⚠ {error}</p>}
      </div>
      <div className="chat-input">
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
        />
        <button onClick={() => void send()} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
