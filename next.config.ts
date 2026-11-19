import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

export default function nextConfig(phase: string): NextConfig {
  return {
    devIndicators: false,
    // A production build must not overwrite the running dev server's client chunks.
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? ".next/dev" : ".next/build",
  };
}
