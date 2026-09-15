'use client';
// 초대 만들기 패널: 메모(한 줄에 한 장) 텍스트영역, 역할 분할 버튼, 만료 셀렉트. 만든 초대를 부모에게 넘긴다.
import { useState, type FormEvent } from 'react';
import { API, LIMITS, type CreateInvitesRequest, type InviteListResponse, type InviteRole, type InviteRow } from '@/lib/contracts';
import { api } from '@/lib/client/api';
import { Button } from '@/components/ui/Button';
import { Field, Select, Textarea } from '@/components/ui/Field';
import { IconPlus } from '@/components/ui/icons';
import { Panel } from '@/components/ui/Panel';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from './util';

const NOTE_MAX = 60;
const MAX_DAYS = 90;
const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: 'player', label: '참가자' },
  { value: 'host', label: '진행자' },
];
/** 만료 선택지 (일). 0 = 만료 없음. 기본값이 목록에 없으면 끼워 넣는다. */
const DAY_OPTIONS: number[] = Array.from(new Set([1, 3, 7, LIMITS.inviteDefaultDays, 30, 60, MAX_DAYS, 0])).filter(
  (d) => Number.isInteger(d) && d >= 0 && d <= MAX_DAYS,
);

export function InviteCreateForm({ onCreated }: { onCreated: (invites: InviteRow[]) => void }) {
  const toast = useToast();
  const [role, setRole] = useState<InviteRole>('player');
  const [notesText, setNotesText] = useState('');
  const [days, setDays] = useState<string>(String(LIMITS.inviteDefaultDays));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const notes = notesText.split(/\r?\n/).map((n) => n.trim()).filter((n) => n.length > 0);
  const count = Math.max(1, notes.length);
  const tooLong = notes.find((n) => [...n].length > NOTE_MAX);
  const daysNum = Number(days);
  const daysOk = days.trim() !== '' && Number.isInteger(daysNum) && daysNum >= 0 && daysNum <= MAX_DAYS;
  const tooMany = notes.length > LIMITS.inviteMaxBatch;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (tooMany) return setError(`한 번에 ${LIMITS.inviteMaxBatch}장까지 만들 수 있습니다.`);
    if (tooLong) return setError(`메모는 한 줄에 ${NOTE_MAX}자까지 쓸 수 있습니다: "${tooLong.slice(0, 20)}…"`);
    if (!daysOk) return setError(`만료 기간은 0~${MAX_DAYS}일로 입력해 주세요.`);
    setBusy(true);
    setError(null);
    try {
      const body: CreateInvitesRequest = { role, notes, expiresInDays: daysNum };
      const res = await api<InviteListResponse>(API.adminInvites, { body });
      onCreated(res.invites);
      setNotesText('');
      toast(`초대 ${res.invites.length}장을 만들었습니다`, 'success');
    } catch (err) {
      setError(errorMessage(err, '초대를 만들지 못했습니다.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      as="section"
      title="초대 만들기"
      icon={<IconPlus />}
      right={<span className="hidden text-xs text-text-faint sm:inline">한 줄 = 초대 한 장</span>}
      bodyClassName="p-4"
    >
      <form onSubmit={onSubmit} noValidate>
        <p className="text-[13px] leading-relaxed text-text-dim">
          메모 한 줄마다 초대 링크가 한 장씩 만들어집니다. 이름 목록을 그대로 붙여 넣어도 됩니다. 비워 두면 메모 없이 한 장.
        </p>
        <div className="mt-3.5 grid gap-4 md:grid-cols-[1fr_13rem]">
          <Field
            id="invite-notes"
            label="메모 (한 줄에 한 명)"
            labelRight={notes.length > 0 ? <span className={`font-mono tabular-nums ${tooMany ? 'text-danger' : ''}`}>{notes.length}줄</span> : null}
          >
            <Textarea
              id="invite-notes"
              rows={5}
              value={notesText}
              onChange={(e) => setNotesText(e.target.value)}
              placeholder={'김철수\n이영희\n박민수'}
              className="min-h-32 resize-y"
              invalid={tooMany || !!tooLong}
            />
          </Field>
          <div className="flex flex-col gap-4">
            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-1.5 text-[13px] font-semibold text-text">역할</legend>
              {/* 알약 세그먼트 (ui/Tabs 와 같은 모양): 이 패널의 보라 채움은 "만들기" 버튼 하나뿐이라, 선택된 칸은 올라온 유리 알약 */}
              {/* 그림자·반사 색은 ui/Tabs 와 같은 모드 토큰 (나이트 값 = v4 그대로) */}
              <div className="grid grid-cols-2 gap-1 rounded-full border border-stroke bg-glass-inset p-1 shadow-[inset_0_1px_2px_var(--inset-shade-2)]">
                {ROLE_OPTIONS.map((o) => {
                  const on = role === o.value;
                  return (
                    <label
                      key={o.value}
                      className={
                        'flex h-9 max-md:h-11 cursor-pointer select-none items-center justify-center rounded-full text-[13px] font-semibold transition-[background-color,color,box-shadow] duration-150 ' +
                        'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-violet-ink ' +
                        (on
                          ? 'bg-glass-2 text-text shadow-[inset_0_0_0_1px_var(--color-stroke-strong),inset_0_1px_0_var(--sheen-3),0_4px_14px_var(--shadow-soft)]'
                          : 'text-text-dim hover:bg-tint/[0.05] hover:text-text')
                      }
                    >
                      <input
                        type="radio"
                        name="invite-role"
                        value={o.value}
                        checked={on}
                        onChange={() => setRole(o.value)}
                        className="sr-only"
                      />
                      {o.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <Field id="invite-days" label="만료" hint="만료 없음을 고르면 계속 쓸 수 있습니다">
              <Select
                id="invite-days"
                value={days}
                onChange={(e) => setDays(e.target.value)}
                invalid={!daysOk}
                className="max-md:h-11"
                aria-describedby="invite-days-hint"
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d} value={String(d)}>{d === 0 ? '만료 없음' : `${d}일`}</option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
        {error ? <p role="alert" className="mt-3 text-[13px] font-medium text-danger">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="submit" icon={<IconPlus />} loading={busy} disabled={tooMany} className="max-md:h-11 max-md:w-full">
            {busy ? '만드는 중…' : `${role === 'host' ? '진행자' : '참가자'} 초대 ${count}장 만들기`}
          </Button>
          {tooMany ? (
            <span className="text-[13px] text-danger">{notes.length}줄: {LIMITS.inviteMaxBatch}장까지만 됩니다</span>
          ) : null}
        </div>
      </form>
    </Panel>
  );
}
