// 관리 표 패널 (DESIGN_V4 §3·§6): 유리 패널(glass + 1px stroke + 윗변 반사 + 그림자, 20px), 머리 줄은 구분선 없이 여백으로.
// 폰(<768px)에서는 머리 줄을 56px로 키워 44px 터치 목표 컨트롤(셀렉트·버튼)을 담는다. 본문은 여백 없이 표를 꽉 채운다.
import type { ReactNode } from 'react';
import { PanelBody, PanelHeader, PanelTitle } from '@/components/ui/Panel';

export function ListPanel({
  title, icon, right, 'aria-label': ariaLabel, children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  'aria-label'?: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className="glass relative flex min-h-0 flex-col overflow-hidden rounded-card border border-stroke shadow-glass"
    >
      <PanelHeader className="max-md:h-14">
        <PanelTitle icon={icon}>{title}</PanelTitle>
        {right ? <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div> : null}
      </PanelHeader>
      <PanelBody noPadding>{children}</PanelBody>
    </section>
  );
}
