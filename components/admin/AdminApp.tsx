'use client';
// /admin: 초대 · 회원 · 게임 (DESIGN_V4 §6: 유리 알약 탭 + 유리 패널 안의 표).
// 탭은 주소의 #invites / #users / #games 로 기억한다 (홈의 지표 카드·빠른 실행이 이 해시로 연다).
// 좌우 화살표·Home·End 로 탭을 옮기는 것은 ui/Tabs 가 한다.
import { useEffect, useState } from 'react';
import { IconLink, IconMap, IconUsers } from '@/components/ui/icons';
import type { TabItem } from '@/components/ui/PanelTabs';
import { Tabs } from '@/components/ui/Tabs';
import { GamesTab } from './GamesTab';
import { InvitesTab } from './InvitesTab';
import { UsersTab } from './UsersTab';

type TabId = 'invites' | 'users' | 'games';
const TABS: TabItem<TabId>[] = [
  { key: 'invites', label: '초대', icon: <IconLink /> },
  { key: 'users', label: '회원', icon: <IconUsers /> },
  { key: 'games', label: '게임', icon: <IconMap /> },
];
const HINT: Record<TabId, string> = {
  invites: '초대 링크를 만들어 보냅니다. 가입하면 바로 대기실로 들어갑니다.',
  users: '역할 바꾸기 · 사용 중지 · 비밀번호 초기화 · 삭제',
  games: '모든 게임을 보고 정리합니다.',
};

function isTab(v: string): v is TabId {
  return TABS.some((t) => t.key === v);
}

export function AdminApp({ meId }: { meId: string }) {
  const [tab, setTab] = useState<TabId>('invites');

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (isTab(h)) setTab(h);
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  function select(id: TabId) {
    setTab(id);
    window.history.replaceState(null, '', `#${id}`);
  }

  const label = TABS.find((t) => t.key === tab)?.label;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
        {/* 폰에서는 줄 폭을 채우고 탭 높이를 44px 터치 목표로 */}
        <Tabs
          tabs={TABS}
          value={tab}
          onChange={select}
          aria-label="관리 메뉴"
          className="max-md:w-full max-md:[&>[role=tab]]:h-11 max-md:[&>[role=tab]]:flex-1"
        />
        <p className="text-[13px] text-text-faint">{HINT[tab]}</p>
      </div>
      <div id={`panel-${tab}`} role="tabpanel" aria-label={typeof label === 'string' ? label : undefined}>
        {tab === 'invites' ? <InvitesTab /> : tab === 'users' ? <UsersTab meId={meId} /> : <GamesTab />}
      </div>
    </div>
  );
}
