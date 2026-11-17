import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
if (process.env.NODE_ENV === "development") {
  process.env.CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV = "false";
  initOpenNextCloudflareForDev();
}
const config: NextConfig = {
  distDir: process.env.UCOST_DIST_DIR || ".next",
  serverExternalPackages: [],
};
export default config;
