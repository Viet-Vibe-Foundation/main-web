/**
 * Build / deploy identity shown to admins.
 * Values are injected at build time via next.config.ts (with Vercel git env fallbacks).
 */
export type AppVersionInfo = {
  version: string
  branch: string
  commit: string
  buildDate: string
  buildDateLabel: string
}

function readEnv(name: string, fallback: string): string {
  const value = process.env[name]
  return value && value.trim() ? value.trim() : fallback
}

export function getAppVersionInfo(): AppVersionInfo {
  const buildDate = readEnv('APP_BUILD_DATE', new Date().toISOString())
  let buildDateLabel = buildDate
  try {
    buildDateLabel = new Date(buildDate).toLocaleString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    })
  } catch {
    // keep raw ISO
  }

  return {
    version: readEnv('APP_VERSION', '0.0.0'),
    branch: readEnv('APP_GIT_BRANCH', 'unknown'),
    commit: readEnv('APP_GIT_COMMIT', 'unknown'),
    buildDate,
    buildDateLabel,
  }
}
