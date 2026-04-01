import { NextResponse } from "next/server";
import { createUserClient } from "@/lib/db/supabase-server";

export async function POST(request: Request) {
  const supabase = await createUserClient();
  await supabase.auth.signOut();

  const url = new URL("/auth/anmelden", request.url);
  return NextResponse.redirect(url, { status: 302 });
}
