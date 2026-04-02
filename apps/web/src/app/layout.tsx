import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/shell";
import { AuthProvider } from "@/components/providers/auth-provider";
import { getUser } from "@/lib/db/supabase-server";
import { getOrgBranding, isPlatformAdmin } from "@/lib/db/queries/organization";
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
  title: "Time Keeper",
  description: "AI-Ready Knowledge & Operations Platform",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getUser();

  let branding = undefined;
  let isAdmin = false;
  let hasPhoneAssistant = false;

  if (user) {
    try {
      [branding, isAdmin, hasPhoneAssistant] = await Promise.all([
        getOrgBranding(),
        isPlatformAdmin(),
        hasFeature("phone_assistant"),
      ]);
    } catch {
      // User may not have org membership yet (onboarding)
    }
  }

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
            <Shell branding={branding} isAdmin={isAdmin} hasPhoneAssistant={hasPhoneAssistant}>
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
