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
  // TEMPORARY — FOR LOCAL TESTING ONLY (ngrok tunnel + LAN access).
  // Allows the dev server to accept requests from these origins, which fixes
  // the HMR websocket 503 / dropdowns-not-clickable issue seen when accessing
  // `next dev` through an ngrok URL or a LAN address instead of localhost,
  // and lets the dev error overlay load (/__nextjs_original-stack-frames).
  //
  // ngrok free tunnels generate a NEW random subdomain every time you start
  // one, so that entry will need to be updated (or removed) each session.
  // The LAN IP (192.168.11.56) changes if your router reassigns it.
  // Restart `npm run dev` after editing this list.
  //
  // Remove this before deploying to production — it should not ship.
  allowedDevOrigins: [
    "likely-limpness-panama.ngrok-free.dev",
    "192.168.11.56",
  ],
};

export default nextConfig;