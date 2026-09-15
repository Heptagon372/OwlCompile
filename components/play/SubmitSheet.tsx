'use client';
// 아키텍트 제출 확인: "봉인하면 더 못 고칩니다". validate 오류가 있으면 목록을 보여 주고 봉인 버튼을 막는다.
import { useEffect, useState } from 'react';
import { API, type GameMap, type SubmitRejectedBody, type SubmitRequest, type SubmitResponse } from '@/lib/contracts';
import type { Block } from '@/lib/engine/types';
import { validate } from '@/lib/engine/validate';
import { api, ApiClientError } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { IconAlert, IconLock } from '@/components/ui/icons';

export function SubmitSheet({
  open, onClose, code, round, doc, map, patchActive, beforeSubmit, onSubmitted,
}: {
  open: boolean;
  onClose: () => void;
  code: string;
  /** 지금 편집 중인 라운드 (서버가 다른 라운드면 거절한다) */
  round: number;
  doc: Block[];
  map: GameMap;
  patchActive: boolean;
  /** 대기 중인 저장을 먼저 끝낸다 */
  beforeSubmit: () => Promise<void>;
  onSubmitted: (res: SubmitResponse) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const v = validate(doc, map);
  const errors = serverErrors.length ? serverErrors : v.errors;

  useEffect(() => {
    if (open) {
      setServerErrors([]);
      setMessage(null);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await beforeSubmit();
      const body: SubmitRequest = { round };
      const res = await api<SubmitResponse>(API.gameSubmit(code), { method: 'POST', body });
      onSubmitted(res);
    } catch (err) {
      if (err instanceof ApiClientError) {
        const body = err.body as Partial<SubmitRejectedBody> | null;
        if (body && Array.isArray(body.errors) && body.errors.length) setServerErrors(body.errors);
        else setMessage(err.message);
      } else {
        setMessage('제출하지 못했어요. 다시 시도해 주세요.');
      }
    } finally {
      setBusy(false);
    }
  };

  const blocked = errors.length > 0;
  const over = v.blocks > v.cap;
  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      size="sm"
      title={patchActive ? '고친 코드를 다시 제출할까요?' : '제출할까요?'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            더 고칠게요
          </Button>
          <Button onClick={() => void submit()} disabled={busy || blocked} loading={busy} icon={<IconLock />}>
            {busy ? '봉인하는 중…' : '봉인하고 제출'}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-relaxed text-text">
        봉인하면 더 못 고칩니다. 팀원 모두 준비됐는지 확인하세요.
      </p>
      <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 rounded-ctl border border-line bg-inset px-3 py-2 text-[13px]">
        <div className="flex items-baseline gap-1.5">
          <dt className="text-text-faint">블록</dt>
          <dd className={`font-mono font-semibold tabular-nums ${over ? 'text-danger' : 'text-text'}`}>
            {v.blocks}개 / 상한 {v.cap}개
          </dd>
        </div>
        {patchActive ? (
          <div className="flex items-baseline gap-1.5">
            <dt className="text-text-faint">패치권</dt>
            <dd className="font-display font-semibold tabular-nums text-warn">−10점</dd>
          </div>
        ) : null}
      </dl>
      {blocked ? (
        <div className="mt-4 rounded-ctl border border-danger/40 bg-danger/10 p-3" role="alert">
          <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-danger">
            <IconAlert size={16} />
            이대로는 제출할 수 없어요
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-[13px] leading-relaxed text-text">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {message ? (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-semibold text-danger" role="alert">
          <IconAlert size={16} />
          {message}
        </p>
      ) : null}
    </Sheet>
  );
}
