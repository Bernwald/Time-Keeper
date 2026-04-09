"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import { getTestCallConfig } from "@/app/telefon-assistent/actions";
import { btn } from "@/components/ui/table-classes";

type CallState = "idle" | "connecting" | "active" | "ended" | "error";

type CallEndEvent = { endedReason?: string } | undefined;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TestCallButton() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const vapiRef = useRef<Vapi | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callStateRef = useRef<CallState>("idle");

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop();
        vapiRef.current = null;
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const startCall = useCallback(async () => {
    setError(null);
    setEndedReason(null);
    setCallState("connecting");
    setDuration(0);

    const config = await getTestCallConfig();
    if (!config.ok || !config.assistantId) {
      setError(config.error ?? "Unbekannter Fehler");
      setCallState("error");
      return;
    }

    const publicKey = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;
    if (!publicKey) {
      setError("VAPI Public Key nicht konfiguriert. Bitte NEXT_PUBLIC_VAPI_PUBLIC_KEY in Vercel setzen.");
      setCallState("error");
      return;
    }

    const vapi = new Vapi(publicKey);
    vapiRef.current = vapi;

    vapi.on("call-start", () => {
      setCallState("active");
      setDuration(0);
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
    });

    vapi.on("call-end", (evt: CallEndEvent) => {
      const reason = evt?.endedReason ?? null;
      console.info("[vapi] call-end", evt);
      setEndedReason(reason);
      setCallState("ended");
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    });

    vapi.on("error", (e) => {
      console.error("[vapi] error event", e);
      const msg = typeof e === "object" && e !== null && "message" in e
        ? String((e as { message: string }).message)
        : "Verbindungsfehler";
      // Only flip to error state when the call is not yet active.
      // Mid-call errors are often non-fatal; the call-end event will
      // eventually fire if the connection truly drops.
      if (callStateRef.current !== "active") {
        setError(msg);
        setCallState("error");
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    });

    try {
      await vapi.start(config.assistantId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Anruf konnte nicht gestartet werden.";
      if (msg.includes("Permission denied") || msg.includes("NotAllowedError")) {
        setError("Mikrofonzugriff wurde verweigert. Bitte erlauben Sie den Zugriff in Ihren Browsereinstellungen.");
      } else {
        setError(msg);
      }
      setCallState("error");
    }
  }, []);

  const endCall = useCallback(() => {
    vapiRef.current?.stop();
  }, []);

  return (
    <div className="flex flex-col gap-3">
      {/* Call button */}
      {callState === "active" ? (
        <button
          type="button"
          onClick={endCall}
          className={btn.primary}
          style={{
            background: "var(--color-danger)",
            color: "var(--color-bg)",
          }}
        >
          Auflegen
        </button>
      ) : (
        <button
          type="button"
          onClick={startCall}
          disabled={callState === "connecting"}
          className={btn.primary}
          style={{
            background: callState === "connecting" ? "var(--color-muted)" : "var(--color-accent)",
            color: "var(--color-bg)",
            opacity: callState === "connecting" ? 0.7 : 1,
            cursor: callState === "connecting" ? "wait" : "pointer",
          }}
        >
          {callState === "connecting"
            ? "Verbinde..."
            : callState === "ended" || callState === "error"
              ? "Erneut testen"
              : "Testanruf starten"}
        </button>
      )}

      {/* Active call indicator */}
      {callState === "active" && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium"
          style={{
            background: "var(--color-success-soft, rgba(34,197,94,0.1))",
            color: "var(--color-success)",
            border: "1px solid var(--color-success)",
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--color-success)" }}
          />
          Anruf aktiv — {formatDuration(duration)}
        </div>
      )}

      {/* Connecting indicator */}
      {callState === "connecting" && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs"
          style={{
            background: "var(--color-accent-soft)",
            color: "var(--color-accent)",
            border: "1px solid var(--color-accent)",
          }}
        >
          <span
            className="w-2 h-2 rounded-full animate-pulse"
            style={{ background: "var(--color-accent)" }}
          />
          Verbindung wird hergestellt...
        </div>
      )}

      {/* Ended */}
      {callState === "ended" && (
        <div
          className="px-3 py-2 rounded-xl text-xs"
          style={{ color: "var(--color-muted)" }}
        >
          Anruf beendet — Dauer: {formatDuration(duration)}
          {endedReason ? ` · Grund: ${endedReason}` : ""}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          className="px-3 py-2 rounded-xl text-xs"
          style={{
            background: "var(--color-danger-soft, rgba(239,68,68,0.1))",
            color: "var(--color-danger, #ef4444)",
            border: "1px solid var(--color-danger, #ef4444)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
