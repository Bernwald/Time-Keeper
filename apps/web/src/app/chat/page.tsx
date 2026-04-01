"use client";

import { useState, useRef, useEffect } from "react";
import { chatAnswer, getAvailableModels } from "./actions";
import type { ChatResponse, ModelId } from "@/lib/ai/chat";
import { card, badge, btn, input, styles } from "@/components/ui/table-classes";

type ModelOption = { id: ModelId; label: string; available: boolean };

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; response: ChatResponse };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelId>("claude");
  const [models, setModels] = useState<ModelOption[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getAvailableModels().then((m) => {
      setModels(m);
      // Default to first available model
      const first = m.find((x) => x.available);
      if (first) setSelectedModel(first.id);
    });
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || pending) return;
    setMessages((p) => [...p, { role: "user", text: q }]);
    setQuestion("");
    setPending(true);
    try {
      const response = await chatAnswer(q, selectedModel);
      setMessages((p) => [...p, { role: "assistant", response }]);
    } catch {
      setMessages((p) => [...p, { role: "assistant", response: { type: "chunks", items: [] } }]);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col h-[100dvh] md:h-full md:min-h-[100dvh]">
      {/* Header */}
      <div
        className="shrink-0 px-4 md:px-6 py-4 border-b flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderColor: "var(--color-line-soft)", background: "var(--color-panel)" }}
      >
        <div>
          <h1 className="text-lg md:text-xl font-semibold" style={styles.title}>Chat</h1>
          <p className="text-xs mt-0.5" style={styles.muted}>
            Fragen an deine Wissensbasis stellen.
          </p>
        </div>

        {/* Model selector */}
        {models.length > 0 && (
          <div className="flex items-center gap-1.5">
            {models.filter((m) => m.available).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModel(m.id)}
                className="px-3 py-1.5 rounded-full text-xs font-medium transition-all min-h-[36px]"
                style={{
                  background: selectedModel === m.id ? "var(--color-accent)" : "var(--color-bg-elevated)",
                  color: selectedModel === m.id ? "var(--color-accent-text)" : "var(--color-muted)",
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center flex-1 gap-3 text-center py-12 animate-scale-in">
            <div
              className="w-14 h-14 rounded-full flex items-center justify-center text-xl"
              style={styles.accentSoft}
            >
              ?
            </div>
            <p className="text-base font-medium" style={{ color: "var(--color-text)" }}>
              Stell eine Frage
            </p>
            <p className="text-sm max-w-sm" style={styles.muted}>
              Die Antwort kommt aus deinen Quellen — mit Hybrid-Suche (Volltext + Semantik).
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === "user") {
            return (
              <div key={i} className="flex justify-end animate-slide-up">
                <div
                  className="rounded-2xl rounded-br-md px-4 py-2.5 max-w-[85%] md:max-w-[70%] text-sm"
                  style={styles.accent}
                >
                  {msg.text}
                </div>
              </div>
            );
          }

          const { response } = msg;

          if (response.type === "answer") {
            return (
              <div key={i} className="max-w-[90%] md:max-w-[80%] animate-slide-up">
                <div className={card.flat} style={styles.panel}>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-text)" }}>
                    {response.text}
                  </p>
                  <div className="mt-3 pt-3 flex flex-wrap items-center gap-1.5" style={{ borderTop: "1px solid var(--color-line-soft)" }}>
                    <span className={badge.pill} style={{ background: "var(--color-bg-elevated)", color: "var(--color-muted)" }}>
                      {response.model === "claude" ? "Claude" : response.model}
                    </span>
                    {response.sources.length > 0 && (
                      <>
                        <span className="text-[11px]" style={styles.muted}>Quellen:</span>
                        {[...new Set(response.sources.map((s) => s.source_title))].map((t) => (
                          <span key={t} className={badge.pill} style={styles.accentSoft}>{t}</span>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <div key={i} className="flex flex-col gap-2 max-w-[90%] md:max-w-[80%] animate-slide-up">
              {response.items.length === 0 ? (
                <p className="text-sm" style={styles.muted}>Keine relevanten Abschnitte gefunden.</p>
              ) : (
                <>
                  <p className="text-[11px] font-medium" style={styles.muted}>Relevante Abschnitte:</p>
                  {response.items.map((c) => (
                    <div key={c.id} className={card.flat} style={styles.panel}>
                      <span className={`${badge.pill} mb-1.5 inline-block`} style={styles.accentSoft}>
                        {c.source_title}
                      </span>
                      <p className="text-sm leading-relaxed" style={{ color: "var(--color-text)" }}>
                        {c.chunk_text.slice(0, 300)}{c.chunk_text.length > 300 ? " …" : ""}
                      </p>
                    </div>
                  ))}
                </>
              )}
            </div>
          );
        })}

        {pending && (
          <div className="flex items-center gap-2 animate-fade-in">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-accent)" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-accent)", animationDelay: "150ms" }} />
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--color-accent)", animationDelay: "300ms" }} />
            </div>
            <span className="text-xs" style={styles.muted}>Suche läuft …</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="shrink-0 px-4 md:px-6 py-3 border-t pb-[calc(12px+env(safe-area-inset-bottom))] md:pb-3"
        style={{ borderColor: "var(--color-line-soft)", background: "var(--color-panel)" }}
      >
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Frage stellen …"
            disabled={pending}
            className={input.base}
            style={{ ...styles.input, flex: 1, borderColor: "var(--color-line-soft)" }}
          />
          <button
            type="submit"
            disabled={pending || !question.trim()}
            className={btn.primary}
            style={{ ...styles.accent, opacity: pending || !question.trim() ? 0.5 : 1 }}
          >
            Senden
          </button>
        </form>
      </div>
    </div>
  );
}
