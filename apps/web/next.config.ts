import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Strict mode catches double-invocation bugs in dev
  reactStrictMode: true,

  // Transpile workspace packages
  transpilePackages: ['@vantage/ui-kit', '@vantage/contracts', '@vantage/validation'],

  // Security headers — hardened baseline
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },

  // Redirect bare domain to www in production (handled by Cloudflare, but belt-and-suspenders)
  async redirects() {
    return [];
  },
};

export default nextConfig;
