import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['better-sqlite3', 'adm-zip'],
  allowedDevOrigins: ['192.168.2.42', 'share.local'],
};

export default nextConfig;
