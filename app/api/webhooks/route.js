export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

export async function GET() {
  return new Response('ok', { status: 200 })
}
