// 라우트 핸들러 공용: 오류 형식, JSON 응답, 본문 검증, 출처 검사 (docs/WEBSITE_SPEC.md §4–§5). 서버 전용.
import { NextResponse } from 'next/server';
import { unstable_rethrow } from 'next/navigation';
import type { ZodType } from 'zod';
import type { ApiErrorBody } from '@/lib/contracts';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** 오류 본문에 함께 실어 보낼 필드 (예: 409의 doc/version) */
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const badRequest = (message: string, code = 'bad_request', extra?: Record<string, unknown>) =>
  new HttpError(400, code, message, extra);
export const unauthorized = (message = '로그인이 필요합니다.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = '권한이 없습니다.', code = 'forbidden') => new HttpError(403, code, message);
export const notFound = (message = '찾을 수 없습니다.') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict', extra?: Record<string, unknown>) =>
  new HttpError(409, code, message, extra);
export const tooMany = (message: string) => new HttpError(429, 'rate_limited', message);

export function json<T>(data: T, status = 200, headers: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message }, ...err.extra }, err.status);
  }
  console.error('[api]', err);
  return json<ApiErrorBody>(
    { error: { code: 'internal', message: '서버에서 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.' } },
    500,
  );
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** 앞단 프록시를 믿는가 (OWL_TRUST_PROXY=1일 때만 X-Forwarded-* 헤더를 쓴다) */
export function trustProxy(): boolean {
  return process.env.OWL_TRUST_PROXY === '1';
}

/** 요청이 온 호스트. X-Forwarded-Host는 클라이언트가 넣을 수 있으므로 프록시를 믿을 때만 쓴다 */
export function requestHost(req: Request): string | null {
  const fwd = trustProxy() ? req.headers.get('x-forwarded-host') : null;
  const h = fwd ? fwd.split(',').map((s) => s.trim()).filter(Boolean).pop() : null;
  return h || req.headers.get('host');
}

/** 변경 요청은 같은 사이트에서 온 것만 받는다 (Origin, 없으면 Referer). */
export function assertSameOrigin(req: Request): void {
  const host = requestHost(req);
  const origin = req.headers.get('origin') ?? req.headers.get('referer');
  if (!host || !origin) throw forbidden('요청 출처를 확인할 수 없습니다.', 'bad_origin');
  let originHost = '';
  try {
    originHost = new URL(origin).host;
  } catch {
    throw forbidden('요청 출처를 확인할 수 없습니다.', 'bad_origin');
  }
  if (originHost !== host) throw forbidden('다른 사이트에서 온 요청은 받을 수 없습니다.', 'bad_origin');
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RouteContext<P = {}> = { params: Promise<P> };

/**
 * 라우트 핸들러 래퍼: 변경 요청의 출처 검사 + HttpError/예외를 spec 오류 형식으로 바꾼다.
 * 사용: export const POST = handle<{ code: string }>(async (req, { params }) => { const { code } = await params; ... })
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function handle<P = {}>(fn: (req: Request, ctx: RouteContext<P>) => Promise<Response> | Response) {
  return async (req: Request, ctx: RouteContext<P>): Promise<Response> => {
    try {
      if (MUTATING.has(req.method)) assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (err) {
      unstable_rethrow(err); // redirect()/notFound() 같은 Next 내부 제어 흐름은 그대로 통과
      return errorResponse(err);
    }
  };
}

/**
 * 본문을 최대 maxBytes까지만 읽는다. Content-Length가 크면 바로 413,
 * 스트림이 한도를 넘으면 읽기를 취소하고 413 (전체를 메모리에 올리지 않는다).
 */
export async function readBodyCapped(req: Request, maxBytes: number): Promise<string> {
  const tooLarge = () => new HttpError(413, 'too_large', '요청이 너무 큽니다.');
  const declaredRaw = req.headers.get('content-length');
  if (declaredRaw !== null) {
    const declared = Number(declaredRaw);
    if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  }
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw tooLarge();
    }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(buf);
}

/** JSON 본문을 읽고 zod로 검증한다. 크기 초과 413, 형식 오류 400. */
export async function readJson<T>(req: Request, schema: ZodType<T>, maxBytes = 32_000): Promise<T> {
  const text = await readBodyCapped(req, maxBytes);
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw badRequest('요청 형식이 올바르지 않습니다.', 'bad_json');
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first ? first.path.map(String).join('.') : '';
    throw badRequest(`입력값을 확인해 주세요${where ? ` (${where})` : ''}.`, 'invalid_input');
  }
  return parsed.data;
}

/**
 * 요청자 IP. 클라이언트가 X-Forwarded-For/X-Real-IP를 마음대로 넣을 수 있으므로,
 * OWL_TRUST_PROXY=1(앞단에 헤더를 덧붙이는 프록시가 있음)일 때만 헤더를 믿고 오른쪽 끝 값(프록시가 붙인 값)을 쓴다.
 * 그 밖에는 라우트 핸들러에서 소켓 주소를 알 수 없으므로 'direct' 하나로 본다 (아이디당 제한이 따로 있다).
 */
export function clientIp(req: Request): string {
  if (trustProxy()) {
    const fwd = req.headers.get('x-forwarded-for');
    if (fwd) {
      const hops = fwd.split(',').map((s) => s.trim()).filter(Boolean);
      if (hops.length > 0) return hops[hops.length - 1];
    }
    const real = req.headers.get('x-real-ip');
    if (real && real.trim()) return real.trim();
  }
  return 'direct';
}

/** https 요청인가 (Secure 쿠키 판단) */
export function isHttps(req: Request): boolean {
  // X-Forwarded-Proto는 클라이언트가 넣을 수 있으므로 프록시를 믿을 때만 쓴다 (프록시가 붙인 오른쪽 끝 값)
  const proto = trustProxy() ? req.headers.get('x-forwarded-proto') : null;
  const last = proto ? proto.split(',').map((s) => s.trim()).filter(Boolean).pop() : null;
  if (last) return last === 'https';
  try {
    return new URL(req.url).protocol === 'https:';
  } catch {
    return false;
  }
}

/** 사이트 origin (초대 링크 만들 때) */
export function siteOrigin(req: Request): string {
  const host = requestHost(req) ?? 'localhost:3000';
  return `${isHttps(req) ? 'https' : 'http'}://${host}`;
}
