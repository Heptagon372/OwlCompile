// 생성된 파일: engine/에서 복사됨. 직접 수정 금지
// OWL COMPILE — 점수 (docs/ENGINE_SPEC.md §7)
import type { RunResult, Score, ScoreContext, ScoreLine } from './types';

export function score(result: RunResult, ctx: ScoreContext): Score {
  const lines: ScoreLine[] = [];
  const mice = result.mice;

  if (result.outcome === 'dead') {
    // 사망: 쥐·최초 제출 무효. 패치 페널티만 적용(총점은 0 아래로 안 내려감).
    lines.push({ label: '사망', points: 0 });
  } else {
    if (result.outcome === 'goal') {
      lines.push({ label: '둥지 도착', points: 100 });
    } else {
      const d = result.distance;
      lines.push({ label: `미도착 (둥지까지 ${d}칸)`, points: Math.max(0, 40 - 5 * d) });
    }
    if (mice > 0) lines.push({ label: `쥐 ${mice}마리`, points: 20 * mice });
    if (result.outcome === 'goal') {
      const golf = ctx.cap - result.blocks;
      if (golf > 0) lines.push({ label: `코드 골프 (${ctx.cap} − ${result.blocks}블록)`, points: 5 * golf });
    }
    if (ctx.firstSubmit) lines.push({ label: '최초 제출', points: 10 });
  }
  if (ctx.usedPatch) lines.push({ label: '패치권 사용', points: -10 });

  const total = Math.max(0, lines.reduce((s, l) => s + l.points, 0));
  return { total, lines };
}
