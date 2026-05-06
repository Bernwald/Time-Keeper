import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

// Dev-only test-login endpoint used by the Claude autonomous dev loop and
// Playwright smoke tests. Hard-disabled outside development — production
// returns 404 even if the file ships.

const TEST_USERS = {
  "claude-tester": {
    email: "claude-tester@bernwald.net",
    password: "Test1234!",
  },
} as const;

type TestUserKey = keyof typeof TEST_USERS;

function isTestUserKey(key: string): key is TestUserKey {
  return key in TEST_USERS;
}

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const userParam = request.nextUrl.searchParams.get("user") ?? "claude-tester";
  if (!isTestUserKey(userParam)) {
    return NextResponse.json(
      { error: `unknown test user "${userParam}"`, available: Object.keys(TEST_USERS) },
      { status: 400 },
    );
  }
  const credentials = TEST_USERS[userParam];

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  const { error } = await supabase.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });

  if (error) {
    return NextResponse.json({ error: error.message, user: userParam }, { status: 401 });
  }

  const next = request.nextUrl.searchParams.get("next") ?? "/";
  return NextResponse.redirect(new URL(next, request.url));
}
