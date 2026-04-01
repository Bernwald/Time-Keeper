import { NextResponse } from "next/server";
import { isPlatformAdmin } from "@/lib/db/queries/organization";
import { createServiceClient } from "@/lib/db/supabase-server";

export async function POST(request: Request) {
  const isAdmin = await isPlatformAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Nicht autorisiert" }, { status: 403 });
  }

  const body = await request.json();
  const { name, slug } = body;

  if (!name?.trim() || !slug?.trim()) {
    return NextResponse.json({ error: "Name und Slug sind erforderlich" }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("organizations")
    .insert({
      name: name.trim(),
      slug: slug.trim(),
      status: "active",
      metadata: {
        branding: {
          display_name: name.trim(),
          short_name: name.trim().slice(0, 2).toUpperCase(),
        },
        instance_type: "shared",
        plan: "standard",
      },
    })
    .select("id")
    .single();

  if (error) {
    if (error.message.includes("duplicate") || error.message.includes("unique")) {
      return NextResponse.json({ error: "Dieser Slug ist bereits vergeben." }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ id: data.id });
}
