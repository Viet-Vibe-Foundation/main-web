import { describe, expect, test, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

vi.mock('@/lib/appVersion', () => ({
  getAppVersionInfo: () => ({
    version: '0.1.0',
    branch: 'dev',
    commit: 'abc1234',
    buildDate: '2026-10-08T12:00:00.000Z',
    buildDateLabel: 'Oct 8, 2026, 12:00 p.m. UTC',
  }),
}))

import { auth } from '@/auth'
import AdminBuildInfo from './AdminBuildInfo'

const mockAuth = vi.mocked(auth)

describe('AdminBuildInfo', () => {
  test('renders nothing for non-admin users', async () => {
    mockAuth.mockResolvedValue({
      user: { role: ['USER'] },
    } as never)

    const jsx = await AdminBuildInfo()
    const { container } = render(jsx)
    expect(container).toBeEmptyDOMElement()
  })

  test('shows version, branch, commit, and date for admins', async () => {
    mockAuth.mockResolvedValue({
      user: { role: ['ADMIN'] },
    } as never)

    const jsx = await AdminBuildInfo()
    render(jsx)

    expect(screen.getByTestId('admin-build-info')).toBeInTheDocument()
    expect(screen.getByText('v0.1.0')).toBeInTheDocument()
    expect(screen.getByText('dev')).toBeInTheDocument()
    expect(screen.getByText('abc1234')).toBeInTheDocument()
    expect(
      screen.getByText('Oct 8, 2026, 12:00 p.m. UTC')
    ).toBeInTheDocument()
  })
})
