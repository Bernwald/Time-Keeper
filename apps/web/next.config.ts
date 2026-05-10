import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  // Next.js dev-indicator ("N"-Bubble unten links) im Workspace-View aus —
  // End-User sollen lokal/in Preview eine clean UI sehen, nicht Tooling-Chrome.
  devIndicators: false,
};

export default nextConfig;
