import { afterEach, describe, expect, test, vi } from 'vitest'

describe('getAppVersionInfo', () => {
  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  test('reads injected env values', async () => {
    vi.stubEnv('APP_VERSION', '1.2.3')
    vi.stubEnv('APP_GIT_BRANCH', 'cursor/ticket-qr-checkin-7c54')
    vi.stubEnv('APP_GIT_COMMIT', 'abc1234')
    vi.stubEnv('APP_BUILD_DATE', '2026-10-08T15:00:00.000Z')

    const { getAppVersionInfo } = await import('./appVersion')
    const info = getAppVersionInfo()

    expect(info.version).toBe('1.2.3')
    expect(info.branch).toBe('cursor/ticket-qr-checkin-7c54')
    expect(info.commit).toBe('abc1234')
    expect(info.buildDate).toBe('2026-10-08T15:00:00.000Z')
    expect(info.buildDateLabel.length).toBeGreaterThan(5)
  })

  test('falls back when env is missing', async () => {
    vi.stubEnv('APP_VERSION', '')
    vi.stubEnv('APP_GIT_BRANCH', '')
    vi.stubEnv('APP_GIT_COMMIT', '')
    vi.stubEnv('APP_BUILD_DATE', '')

    const { getAppVersionInfo } = await import('./appVersion')
    const info = getAppVersionInfo()

    expect(info.version).toBe('0.0.0')
    expect(info.branch).toBe('unknown')
    expect(info.commit).toBe('unknown')
    expect(info.buildDate).toBeTruthy()
  })
})
