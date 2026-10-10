import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'

const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline' 'unsafe-eval' https:;
  style-src 'self' 'unsafe-inline' https:;
  img-src 'self' data: blob: https:;
  font-src 'self' data: https:;
  connect-src 'self' https:;
  frame-src 'self' https:;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
  upgrade-insecure-requests;
`
  .replace(/\s{2,}/g, ' ')
  .trim()

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspHeader,
          },
        ],
      },
    ]
  },
  images: {
    loader: 'custom',
    loaderFile: './lib/utilFunctions/gdrive-loader.ts',
    deviceSizes: [480, 768, 1024, 1600],
    imageSizes: [32, 64, 128], // for icons/thumbnails
    formats: ['image/webp'], // choose webp to cut transformations, can use avif
    domains: [
      'images.unsplash.com',
      'drive.google.com',
      'lh3.googleusercontent.com', // Google avatars/images
      'avatars.githubusercontent.com', // GitHub avatars
      'platform-lookaside.fbsbx.com', // Facebook avatars
      'www.facebook.com',
      'www.instagram.com',
    ],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.fbcdn.net', // Facebook CDN (posts, stories, etc.)
      },
      {
        protocol: 'https',
        hostname: '**.cdninstagram.com', // Instagram CDN (posts, reels, etc.)
      },
    ],
  },
}

export default withBotId(nextConfig)
