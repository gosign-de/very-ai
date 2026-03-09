const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true"
})

const withPWA = require("@ducanh2912/next-pwa").default({
  dest: "public"
})

module.exports = withBundleAnalyzer(
  withPWA({
    reactStrictMode: true,
    output: process.env.DOCKER_BUILD === "true" ? "standalone" : undefined,
    images: {
      unoptimized: true,
      remotePatterns: [
        {
          protocol: "http",
          hostname: "localhost"
        },
        {
          protocol: "http",
          hostname: "127.0.0.1"
        },
        {
          protocol: "https",
          hostname: "*.supabase.co"
        },
        {
          protocol: "https",
          hostname: "*.googleapis.com"
        },
        {
          protocol: "https",
          hostname: "*.openai.com"
        }
      ]
    },
    async headers() {
      return [{
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      }];
    },
    // Moved from experimental.serverComponentsExternalPackages (deprecated in Next.js 16)
    serverExternalPackages: ["sharp", "onnxruntime-node", "seenreq"],
    // Empty turbopack config to acknowledge Turbopack is being used
    turbopack: {
      root: __dirname
    }
  })
)
