import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/shell";
import { NavWorkspace } from "@/components/layout/nav-workspace";
import { NavBerater } from "@/components/layout/nav-berater";
import { NavHaiway } from "@/components/layout/nav-haiway";
import { AuthProvider } from "@/components/providers/auth-provider";
import { getSession } from "@/lib/db/supabase-server";
import { getOrgBranding, isPlatformAdmin } from "@/lib/db/queries/organization";
import { getMemberRole } from "@/lib/db/org-context";
import { hasFeature } from "@/lib/features/flags";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "HAIway",
  description: "AI-Ready Knowledge & Operations Platform",
};

type Persona = "haiway" | "berater" | "workspace";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await getSession();
  const user = session?.user ?? null;

  let branding = undefined;
  let hasPhoneAssistant = false;
  let persona: Persona = "workspace";

  if (user) {
    try {
      const [b, platformAdmin, phoneFlag, role] = await Promise.all([
        getOrgBranding(),
        isPlatformAdmin(),
        hasFeature("phone_assistant"),
        getMemberRole(),
      ]);
      branding = b;
      hasPhoneAssistant = phoneFlag;

      if (platformAdmin) {
        persona = "haiway";
      } else if (role === "admin" || role === "owner") {
        persona = "berater";
      } else {
        persona = "workspace";
      }
    } catch {
      // User may not have org membership yet (onboarding)
    }
  }

  const nav =
    persona === "haiway" ? (
      <NavHaiway />
    ) : persona === "berater" ? (
      <NavBerater hasPhoneAssistant={hasPhoneAssistant} />
    ) : (
      <NavWorkspace hasPhoneAssistant={hasPhoneAssistant} />
    );

  return (
    <html lang="de" className={`${fraunces.variable} ${dmSans.variable}`} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var t=localStorage.getItem('theme')||'system';var dark=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme:dark)').matches);d.classList.toggle('dark',dark);d.classList.toggle('light',!dark)}catch(e){}})()`,
          }}
        />
      </head>
      <body>
        <AuthProvider initialUser={user}>
          {user ? (
            <Shell branding={branding} nav={nav}>
              {children}
            </Shell>
          ) : (
            children
          )}
        </AuthProvider>
      </body>
    </html>
  );
}
