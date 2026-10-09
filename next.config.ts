import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  experimental: { optimizePackageImports: ["@chakra-ui/react"] },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "same-origin" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), screen-wake-lock=(self), fullscreen=(self)" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'" }
    ] }, { source: "/display-sw.js", headers: [
      { key: "Cache-Control", value: "no-cache" },
      { key: "Service-Worker-Allowed", value: "/display/" }
    ] }];
  }
};
export default config;
