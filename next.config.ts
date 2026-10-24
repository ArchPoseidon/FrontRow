import type { NextConfig } from "next";

const immutable = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  async headers() {
    // Static media never changes under the same filename: cache it for a year so repeat visits are instant.
    return ["/models/:path*", "/concert/:path*", "/mock/:path*", "/merch/:path*"].map((source) => ({ source, headers: immutable }));
  },
  cacheComponents: true,
  partialPrefetching: true,
  images: {
    remotePatterns: [{ protocol: "https", hostname: "i.scdn.co" }],
  },
};

export default nextConfig;
