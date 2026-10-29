import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // Keep the dev badge clear of the phone tab bar at the bottom.
  devIndicators: { position: "top-left" },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
