"use client";

import { useState } from "react";
import { chatAnswer } from "./actions";
import type { ChatResponse } from "@/lib/ai/chat";
import { card, badge, btn, input } from "@/components/ui/table-classes";

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: ChatResponse };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;

    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setQuestion("");
    setPending(true);

    try {
      const response = await chatAnswer(q);
      setMessages((prev) => [...prev, { role: "assistant", response }]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          response: { type: "chunks", items: [] },
        },
      ]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col h-full min-h-screen">
      {/* Header */}
      <div
        className="p-6 border-b"
        style={{ borderColor: "var(--color-line)", background: "var(--color-panel)" }}
      >
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-display)", color: "var(--color-text)" }}
        >
          Chat
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--color-muted)" }}>
          Stelle Fragen — die Antwort kommt aus deiner Wissensbasis.
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col gap-4 p-6 overflow-y-auto">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center py-16">
            <p className="text-base font-medium" style={{ color: "var(--color-text)" }}>
              Stell eine Frage
            </p>
            <p className="text-sm max-w-sm" style={{ color: "var(--color-muted)" }}>
              Durchsucht automatisch alle Quellen und liefert die relevantesten Textabschnitte —
              oder eine KI-Antwort, wenn ein API-Key hinterlegt ist.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end">
                <div
                  className="rounded-xl px-4 py-3 max-w-[80%] text-sm"
                  style={{ background: "var(--color-accent)", color: "#fff" }}
                >
                  {msg.text}
                </div>
              </div>
            );
          }

          const { response } = msg;

          if (response.type === "answer") {
            return (
              <div key={i} className="flex flex-col gap-3">
                <div
                  className={card.base}
                  style={{
                    background: "var(--color-panel)",
                    border: "1px solid var(--color-line)",
                    boxShadow: "var(--shadow-card)",
                  }}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-text)" }}>
                    {response.text}
                  </p>
                  {response.sources.length > 0 && (
                    <div className="mt-3 pt-3 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid var(--color-line)" }}>
                      <span className="text-xs" style={{ color: "var(--color-muted)" }}>Quellen:</span>
                      {[...new Set(response.sources.map((s) => s.source_title))].map((title) => (
                        <span
                          key={title}
                          className={badge.base}
                          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                        >
                          {title}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }

          // type === "chunks"
          return (
            <div key={i} className="flex flex-col gap-2">
              {response.items.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--color-muted)" }}>
                  Keine relevanten Textabschnitte gefunden.
                </p>
              ) : (
                <>
                  <p className="text-xs font-medium" style={{ color: "var(--color-muted)" }}>
                    Relevante Abschnitte:
                  </p>
                  {response.items.map((chunk) => (
                    <div
                      key={chunk.id}
                      className={card.base}
                      style={{
                        background: "var(--color-panel)",
                        border: "1px solid var(--color-line)",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1.5">
                        <span
                          className={badge.base}
                          style={{ background: "var(--color-accent-soft)", color: "var(--color-accent)" }}
                        >
                          {chunk.source_title}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                        {chunk.chunk_text.slice(0, 300)}
                        {chunk.chunk_text.length > 300 ? " …" : ""}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}

        {pending && (
          <div className="flex items-center gap-2 px-4 py-3">
            <span className="text-sm" style={{ color: "var(--color-muted)" }}>
              Suche läuft …
            </span>
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="p-4 border-t pb-[env(safe-area-inset-bottom)]"
        style={{ borderColor: "var(--color-line)", background: "var(--color-panel)" }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Frage stellen …"
            disabled={pending}
            className={input.base}
            style={{
              borderColor: "var(--color-line)",
              background: "var(--color-panel-strong)",
              color: "var(--color-text)",
              flex: 1,
            }}
          />
          <button
            type="submit"
            disabled={pending || !question.trim()}
            className={btn.primary}
            style={{
              background: "var(--color-accent)",
              color: "#fff",
              opacity: pending || !question.trim() ? 0.5 : 1,
            }}
          >
            Senden
          </button>
        </form>
      </div>
    </div>
  );
}
