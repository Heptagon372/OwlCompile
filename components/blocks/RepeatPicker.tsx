'use client';
// 반복 횟수 1~9 선택 (12px 모서리 유리 숫자 버튼, 포커스 violet-ink). 폰은 5칸 2줄(44px), 넓은 화면은 9칸 1줄.
// 선택 = 짙은 제어 보라 면(control-deep 토큰 #5B2FDB, 흰 숫자 7.3:1) + 보라 테두리. 문서 대표색 #9670FF 면은 흰 숫자 3.5:1 이라 쓰지 않는다.
export function RepeatPicker({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="반복 횟수" className="grid grid-cols-5 gap-1.5 sm:grid-cols-9">
      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => {
        const on = n === value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onPick(n)}
            className={
              'grid h-11 place-items-center rounded-ctl border font-mono text-base font-semibold tabular-nums transition-colors duration-150 sm:h-10 ' +
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-ink ' +
              (on
                ? 'border-violet-ink/70 bg-control-deep text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]'
                : 'border-stroke-strong bg-glass-2 text-text hover:border-violet/60 hover:bg-tint/[0.06]')
            }
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}
