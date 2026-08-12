import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/admin/:path*',
        destination: `${process.env.API_INTERNAL_ORIGIN ?? 'http://api:4000'}/api/admin/:path*`
      }
    ];
  }
};

export default nextConfig;
