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
};

export default nextConfig;