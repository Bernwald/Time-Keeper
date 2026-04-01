import type { Metadata } from "next";
import { Fraunces, DM_Sans } from "next/font/google";
import "./globals.css";
import { Shell } from "@/components/layout/shell";

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

export const metadata: Metadata = {
  title: "Time Keeper Platform",
  description: "AI-Ready Knowledge & Operations Platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={`${fraunces.variable} ${dmSans.variable}`}>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
