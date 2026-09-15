'use client';
// 관리 화면 공용: 날짜 표시, 클립보드 복사(http LAN에서도 되게), 목록 불러오기 훅.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError, api } from '@/lib/client/api';

const pad = (n: number) => String(n).padStart(2, '0');

/** "9월 11일 18:30" (올해가 아니면 "2025년 9월 11일 18:30") */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const year = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}년 ` : '';
  return `${year}${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const year = d.getFullYear() !== new Date().getFullYear() ? `${d.getFullYear()}년 ` : '';
  return `${year}${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 클립보드 복사. 보안 컨텍스트가 아니면(http://192.168.x.x) textarea + execCommand로 대신한다. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 아래 방법으로 다시 시도
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof ApiClientError ? err.message : fallback;
}

/** GET 목록 불러오기: data·error·loading·reload */
export function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const ctrl = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setLoading(true);
    try {
      const res = await api<T>(path, { signal: c.signal });
      if (c.signal.aborted) return;
      setData(res);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      if (err instanceof ApiClientError && err.status === 401) {
        window.location.assign('/login?next=%2Fadmin');
        return;
      }
      setError(errorMessage(err, '목록을 불러오지 못했습니다.'));
    } finally {
      if (!c.signal.aborted) setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    void reload();
    return () => ctrl.current?.abort();
  }, [reload]);

  return { data, setData, error, loading, reload };
}

/** 표 행 안의 작은 버튼: 데스크톱 32px, 폰에서는 44px 터치 목표 */
export const ROW_BTN = 'max-md:h-11 max-md:px-3';
/** 위험한 행 동작(삭제·취소): ghost 위에 danger 글자색 */
export const ROW_BTN_DANGER = `${ROW_BTN} text-danger! hover:bg-danger/10 hover:text-danger!`;
