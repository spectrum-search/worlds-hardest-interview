import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdf-parse"],
  turbopack: {
    resolveAlias: {
      "pdf-parse": "pdf-parse/lib/pdf-parse.js",
    },
  },
};

export default nextConfig;
