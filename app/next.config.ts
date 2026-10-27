import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Browser integration tests run alongside the user's dev server.
  distDir: process.env.ARC_UI_TEST === "1" ? ".next-arc-ui-test" : ".next",
  async redirects() {
    // AegisAgent is a single product: the treasury review. Earlier pages are not part of it.
    return ['/', '/arc', '/developers', '/infrastructure', '/security', '/testnet', '/earlypay', '/earlypay/:path*']
      .map(source => ({ source, destination: '/treasury', permanent: false }));
  },
};

export default nextConfig;
