"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { btn, card, styles } from "@/components/ui/table-classes";

type RecordingState = "idle" | "recording" | "paused" | "stopped";

type AudioRecorderProps = {
  onRecordingComplete: (blob: Blob) => void;
  disabled?: boolean;
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function AudioRecorder({ onRecordingComplete, disabled }: AudioRecorderProps) {
  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
        mediaRecorder.current.stop();
      }
    };
  }, []);

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });

      chunks.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: recorder.mimeType });
        onRecordingComplete(blob);
        setState("stopped");
        stopTimer();
      };

      recorder.start(1000); // collect data every second
      mediaRecorder.current = recorder;
      setState("recording");
      setDuration(0);
      startTimer();
    } catch {
      setError("Mikrofon-Zugriff verweigert. Bitte Berechtigung erteilen.");
    }
  }, [onRecordingComplete, startTimer, stopTimer]);

  const pauseRecording = useCallback(() => {
    if (mediaRecorder.current?.state === "recording") {
      mediaRecorder.current.pause();
      setState("paused");
      stopTimer();
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (mediaRecorder.current?.state === "paused") {
      mediaRecorder.current.resume();
      setState("recording");
      startTimer();
    }
  }, [startTimer]);

  const stopRecording = useCallback(() => {
    if (mediaRecorder.current && mediaRecorder.current.state !== "inactive") {
      mediaRecorder.current.stop();
    }
  }, []);

  const resetRecording = useCallback(() => {
    setState("idle");
    setDuration(0);
    chunks.current = [];
    mediaRecorder.current = null;
  }, []);

  const isActive = state === "recording" || state === "paused";

  return (
    <div className="flex flex-col gap-4">
      {/* Timer display */}
      <div
        className={`${card.base} flex flex-col items-center gap-4 py-8`}
        style={{
          ...styles.panel,
          borderColor: state === "recording" ? "var(--color-danger)" : "var(--color-line)",
        }}
      >
        <div
          className="text-4xl font-mono font-semibold tabular-nums"
          style={{ color: state === "recording" ? "var(--color-danger)" : "var(--color-text)" }}
        >
          {formatDuration(duration)}
        </div>

        {/* Pulse indicator */}
        {state === "recording" && (
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full animate-pulse"
              style={{ background: "var(--color-danger)" }}
            />
            <span className="text-xs font-medium" style={{ color: "var(--color-danger)" }}>
              Aufnahme läuft
            </span>
          </div>
        )}
        {state === "paused" && (
          <span className="text-xs font-medium" style={{ color: "var(--color-warning)" }}>
            Pausiert
          </span>
        )}
        {state === "stopped" && (
          <span className="text-xs font-medium" style={{ color: "var(--color-success)" }}>
            Aufnahme abgeschlossen
          </span>
        )}
        {state === "idle" && (
          <span className="text-xs" style={styles.muted}>
            Mikrofon bereit
          </span>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        {state === "idle" && (
          <button
            type="button"
            onClick={startRecording}
            disabled={disabled}
            className={btn.primary}
            style={{
              ...styles.accent,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            Aufnahme starten
          </button>
        )}

        {isActive && (
          <>
            {state === "recording" ? (
              <button
                type="button"
                onClick={pauseRecording}
                className={btn.secondary}
                style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
              >
                Pause
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeRecording}
                className={btn.secondary}
                style={{ background: "var(--color-bg-elevated)", color: "var(--color-text)" }}
              >
                Fortsetzen
              </button>
            )}
            <button
              type="button"
              onClick={stopRecording}
              className={btn.danger}
              style={{ background: "var(--color-danger)", color: "#fff" }}
            >
              Stoppen
            </button>
          </>
        )}

        {state === "stopped" && (
          <button
            type="button"
            onClick={resetRecording}
            className={btn.ghost}
            style={{ color: "var(--color-muted)" }}
          >
            Neue Aufnahme
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-center" style={{ color: "var(--color-danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
