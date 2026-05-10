// Wordmark-Renderer: hebt das "AI" in "hAIway" als Akzent hervor.
// Für andere Display-Namen (Pilotkunden mit eigenem Branding) wird der Text
// 1:1 ohne Hervorhebung gerendert.

export function Wordmark({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  // Strikt nur den exakten Markennamen highlighten — Pilotkunden bekommen
  // ihren eigenen Display-Namen pur dargestellt.
  if (name === "hAIway") {
    return (
      <span className={className} style={style}>
        h
        <span style={{ color: "var(--color-accent)" }}>AI</span>
        way
      </span>
    );
  }
  return (
    <span className={className} style={style}>
      {name}
    </span>
  );
}
