const PUBLIC_ROUTES = new Set(['/', '/login', '/mfa'])

export function normalizeAdminRoute(route: string): string {
  const path = route.split(/[?#]/, 1)[0]
  if (
    !route.startsWith('/') ||
    path === '/app' ||
    path.startsWith('/app/') ||
    PUBLIC_ROUTES.has(path)
  ) {
    return route
  }
  return `/app${route}`
}
