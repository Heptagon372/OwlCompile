// POST /api/auth/logout — 폼 POST면 /login으로 303, fetch(Accept: application/json)면 {ok:true}.
import { NextResponse } from 'next/server';
import type { OkResponse } from '@/lib/contracts';
import { handle, json, siteOrigin } from '@/lib/server/http';
import { destroySession } from '@/lib/server/session';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req) => {
  await destroySession();
  const accept = req.headers.get('accept') ?? '';
  if (accept.includes('application/json')) return json<OkResponse>({ ok: true });
  return NextResponse.redirect(new URL('/login', siteOrigin(req)), 303);
});
