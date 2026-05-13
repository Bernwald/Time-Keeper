import { NextResponse, type NextRequest } from "next/server";
import { gatewayGenerate, SUPPORTED_MODELS } from "@/lib/ai/gateway";

// Dev-only Smoke-Test für die Vercel-AI-Gateway-Anbindung. Hard-disabled in
// Production — gibt 404, selbst wenn die Datei aus Versehen mitausgerollt wird.
//
// Aufruf:
//   GET /api/dev/gateway-test
//   GET /api/dev/gateway-test?model=anthropic/claude-haiku-4-5&prompt=Sag+Hallo
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const url = request.nextUrl;
  const model = url.searchParams.get("model") ?? "anthropic/claude-haiku-4-5";
  const prompt = url.searchParams.get("prompt") ?? "Antworte mit genau einem Satz: Wieviele Planeten hat unser Sonnensystem?";

  // Verfügbarkeits-Check
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return NextResponse.json(
      {
        error: "Gateway-Token fehlt",
        hint: "Setze AI_GATEWAY_API_KEY in apps/web/.env.local — siehe https://vercel.com/docs/ai-gateway",
        supported_models: SUPPORTED_MODELS.map((m) => m.id),
      },
      { status: 503 },
    );
  }

  try {
    const start = Date.now();
    const result = await gatewayGenerate({
      model,
      prompt,
      maxOutputTokens: 200,
    });
    return NextResponse.json({
      ok: true,
      model: result.model,
      latency_ms: Date.now() - start,
      text: result.text,
    });
  } catch (e) {
    const err = e as Error;
    return NextResponse.json(
      { error: err.message, model, prompt },
      { status: 500 },
    );
  }
}
