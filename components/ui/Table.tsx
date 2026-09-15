// 촘촘한 표 (훅 없음) — 유리 패널 안에 둔다. 행 40px(size="lg" 44px), hover 강조, 고정 머리 줄은 불투명 유리(solid-2).
// <Table><THead><Tr><Th>이름</Th>…</Tr></THead><TBody><Tr hover onClick=…><Td>…</Td></Tr></TBody></Table>
// selected 행 = 보라 15% + 왼쪽 3px 네온 막대.
import type { HTMLAttributes, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';

type Align = 'left' | 'center' | 'right';
const ALIGN: Record<Align, string> = { left: 'text-left', center: 'text-center', right: 'text-right' };

export function Table({ className = '', wrapClassName = '', children, ...rest }: HTMLAttributes<HTMLTableElement> & { wrapClassName?: string }) {
  return (
    <div className={`relative w-full overflow-x-auto ${wrapClassName}`}>
      <table className={`w-full border-collapse text-sm ${className}`} {...rest}>
        {children}
      </table>
    </div>
  );
}

export function THead({ className = '', children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`sticky top-0 z-10 bg-solid-2/95 backdrop-blur-sm ${className}`} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ className = '', children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...rest}>{children}</tbody>;
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** hover 행 강조 (기본 true) */
  hover?: boolean;
  selected?: boolean;
  /** 흐리게 (비활성 계정 등) */
  muted?: boolean;
  /** 행 높이: md 40px(기본) · lg 44px (진행자 팀 표) */
  size?: 'md' | 'lg';
}

export function Tr({ hover = true, selected = false, muted = false, size = 'md', className = '', children, onClick, ...rest }: TrProps) {
  return (
    <tr
      className={
        `${size === 'lg' ? 'h-11' : 'h-10'} border-b border-stroke transition-colors duration-150 last:border-b-0 ` +
        (selected ? 'bg-violet/15 shadow-[inset_3px_0_0_var(--color-neon-violet)] ' : hover ? 'hover:bg-tint/[0.04] ' : '') +
        (onClick ? 'cursor-pointer ' : '') +
        (muted ? 'text-text-dim ' : '') +
        className
      }
      onClick={onClick}
      aria-selected={selected || undefined}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function Th({ align = 'left', className = '', children, ...rest }: ThHTMLAttributes<HTMLTableCellElement> & { align?: Align }) {
  return (
    <th scope="col" className={`ui-caption h-9 whitespace-nowrap border-b border-stroke-strong px-3 font-semibold ${ALIGN[align]} ${className}`} {...rest}>
      {children}
    </th>
  );
}

export function Td({ align = 'left', mono = false, dim = false, className = '', children, ...rest }:
  TdHTMLAttributes<HTMLTableCellElement> & { align?: Align; mono?: boolean; dim?: boolean }) {
  return (
    <td className={`h-10 px-3 py-0 align-middle ${ALIGN[align]} ${mono ? 'font-mono text-[13px] tabular-nums' : ''} ${dim ? 'text-text-dim' : ''} ${className}`} {...rest}>
      {children}
    </td>
  );
}

/** 표가 비었을 때 한 줄 */
export function TEmpty({ colSpan, children }: { colSpan: number; children: ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="h-24 px-3 text-center text-sm text-text-faint">{children}</td>
    </tr>
  );
}
