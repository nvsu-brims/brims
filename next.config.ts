/** @type {import('next').NextConfig} */
const nextConfig = {
  // Item pictures are uploaded through Server Actions (FormData). The default
  // body limit is 1MB, which would reject any picture over that before the
  // action runs. 11mb = the 10MB picture limit plus form-field overhead.
  experimental: {
    serverActions: {
      bodySizeLimit: "11mb",
    },
  },
  // TEMPORARY — FOR LOCAL TESTING VIA NGROK ONLY.
  // Allows the dev server to accept requests from this ngrok tunnel origin,
  // which fixes the HMR websocket 503 / dropdowns-not-clickable issue seen
  // when accessing `next dev` through an ngrok URL instead of localhost.
  //
  // ngrok free tunnels generate a NEW random subdomain every time you start
  // one, so this value will need to be updated (or removed) each session.
  //
  // Remove this before deploying to production — it should not ship.
  allowedDevOrigins: ["likely-limpness-panama.ngrok-free.dev"],
};

module.exports = nextConfig;