import type { NextConfig } from 'next'
import { withBotId } from 'botid/next/config'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

const projectRoot = process.cwd()

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

function safeGit(command: string): string {
  try {
    return execSync(command, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return ''
  }
}

function readPackageVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(join(projectRoot, 'package.json'), 'utf8')
    ) as { version?: string }
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

const appVersion = process.env.APP_VERSION || readPackageVersion()
const appGitBranch =
  process.env.APP_GIT_BRANCH ||
  process.env.VERCEL_GIT_COMMIT_REF ||
  safeGit('git rev-parse --abbrev-ref HEAD') ||
  'unknown'
const appGitCommit =
  process.env.APP_GIT_COMMIT ||
  process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ||
  safeGit('git rev-parse --short HEAD') ||
  'unknown'
const appBuildDate = process.env.APP_BUILD_DATE || new Date().toISOString()

const nextConfig: NextConfig = {
  env: {
    APP_VERSION: appVersion,
    APP_GIT_BRANCH: appGitBranch,
    APP_GIT_COMMIT: appGitCommit,
    APP_BUILD_DATE: appBuildDate,
  },
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
