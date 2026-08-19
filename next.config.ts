import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // lighthouse isn't on Next's default external-packages list (puppeteer/@sparticuz/chromium
  // already are), and its dynamic requires for audit/report assets don't bundle cleanly.
  serverExternalPackages: ['lighthouse'],
};

export default nextConfig;
