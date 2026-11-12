import type { NextConfig } from "next";
const config: NextConfig = {
  distDir: process.env.UCOST_DIST_DIR || ".next",
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};
export default config;
