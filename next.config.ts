import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // Receipt photos are shrunk in the browser to well under this.
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
