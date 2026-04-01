import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Time Keeper Platform",
  description: "AI Foundation Platform",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
