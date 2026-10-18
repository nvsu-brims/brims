import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Item pictures are uploaded through Server Actions (FormData). The default
  // body limit is 1MB, which would reject any picture over that before the
  // action runs. 11mb = the 10MB picture limit plus form-field overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },

  // Hide the "X-Powered-By: Next.js" header, which tells attackers the framework.
  poweredByHeader: false,

  // Security headers for every route. These are safe to set now and do not
  // change how pages load. A Content-Security-Policy is deliberately NOT set
  // here yet: a strict policy can block Next.js inline scripts and the
  // Supabase image host, so it needs testing first (see the note below).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Stops browsers from guessing a file's type (MIME sniffing).
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Blocks the site from being embedded in another page (clickjacking).
          { key: "X-Frame-Options", value: "DENY" },
          // Sends only the site origin, not full URLs, to other sites.
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Turns off browser features the app does not use.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;