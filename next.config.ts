import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server bundle for the Railway Docker image.
  output: "standalone",
};

export default nextConfig;
