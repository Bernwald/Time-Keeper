// PDF text extraction using pdf-parse (Node.js only, runs in Server Actions)
// Gracefully returns empty string if pdf-parse is not available or parse fails.

export async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  try {
    // Dynamic import to avoid issues in edge environments
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return result.text ?? "";
  } catch {
    return "";
  }
}

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
