// 브라우저에서 API를 부르는 얇은 fetch 래퍼. 오류는 ApiClientError로 던진다.
import type { ApiErrorBody } from '@/lib/contracts';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    /** 서버가 보낸 본문 전체 (409의 doc/version, 400의 errors 등) */
    readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export async function api<T>(
  path: string,
  init: { method?: Method; body?: unknown; signal?: AbortSignal } = {},
): Promise<T> {
  const hasBody = init.body !== undefined;
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (hasBody ? 'POST' : 'GET'),
      headers: hasBody ? { 'Content-Type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiClientError(0, 'network', '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.', null);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const b = data as Partial<ApiErrorBody> | null;
    throw new ApiClientError(
      res.status,
      b?.error?.code ?? `http_${res.status}`,
      b?.error?.message ?? '요청을 처리하지 못했습니다.',
      data,
    );
  }
  return data as T;
}
