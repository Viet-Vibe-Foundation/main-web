import { auth } from '@/auth'
import { getAppVersionInfo } from '@/lib/appVersion'
import { Role } from '@prisma/client'

function isAdminRole(roles: Role[] | string[] | undefined): boolean {
  if (!roles?.length) return false
  return roles.includes(Role.ADMIN) || roles.includes(Role.SUPERADMIN)
}

/**
 * Admin-only deploy identity strip (version, branch, commit, build date).
 */
export default async function AdminBuildInfo() {
  const session = await auth()
  if (!isAdminRole(session?.user?.role as Role[] | undefined)) {
    return null
  }

  const info = getAppVersionInfo()

  return (
    <div
      className="mt-4 rounded-md border border-dashed border-slate-400/60 bg-slate-100/70 px-3 py-2 text-left text-xs text-slate-600"
      data-testid="admin-build-info"
    >
      <p className="font-semibold text-slate-700">Site build (admin)</p>
      <dl className="mt-1 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="inline text-slate-500">Version: </dt>
          <dd className="inline font-mono">v{info.version}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Branch: </dt>
          <dd className="inline font-mono break-all">{info.branch}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Commit: </dt>
          <dd className="inline font-mono">{info.commit}</dd>
        </div>
        <div>
          <dt className="inline text-slate-500">Built: </dt>
          <dd className="inline font-mono">{info.buildDateLabel}</dd>
        </div>
      </dl>
    </div>
  )
}
