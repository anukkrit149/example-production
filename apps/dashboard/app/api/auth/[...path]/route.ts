import { neonAuth } from '@/lib/auth-server'

/**
 * Built inside each handler rather than at module scope: `createNeonAuth`
 * throws on a short cookie secret, and this module is evaluated by `next build`
 * with an empty environment. Deferring it keeps the build green on a machine
 * with no Neon credentials while still failing loudly on a real request.
 */
export const GET = (req: Request, ctx: { params: Promise<{ path: string[] }> }) => neonAuth().handler().GET(req, ctx)
export const POST = (req: Request, ctx: { params: Promise<{ path: string[] }> }) => neonAuth().handler().POST(req, ctx)
