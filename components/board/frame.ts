// 보드 재생의 순수 프레임 함수 (docs/WEBSITE_SPEC.md §9 /board, 브리프 §3).
// Playback.tsx는 경과 시간만 재고, 무엇을 그릴지는 전부 여기서 정한다 → 단위 테스트 가능.
// 훅·DOM·JSX 없음. 엔진은 타입만 가져온다.
import { ENDING_MS, TICK_MS } from '@/lib/contracts';
import type { Dir, Step } from '@/lib/engine/types';

/** 칸 사이 이동 시간 (MapActor transition) */
export const MOVE_MS = 450;
/** 결말의 큰 메시지(흔들림)를 보여 주는 시간 */
export const ENDING_MESSAGE_MS = 1500;
/** 이벤트 토스트가 떠 있는 시간 */
export const TOAST_MS = 1500;

/**
 * 보드 재생 시작 키: 팀·라운드·재생 회차(runSeq).
 * 패치 허용(usedPatch만 바뀜)으로는 다시 재생하지 않고, 재실행·같은 팀 다시 고르기(runSeq 증가)에는 처음부터 재생한다.
 */
export function playKey(r: { teamId: string; round: number; runSeq: number }): string {
  return `${r.teamId}|${r.round}|${r.runSeq}`;
}

export type PlaybackStage = 'playing' | 'ending' | 'done';

export interface PlaybackFrame {
  /** 지금 그릴 trace 인덱스 */
  index: number;
  step: Step;
  /** 마지막 스텝에 도달했는가 */
  atLast: boolean;
  /** playing: 틱 진행 중 · ending: 결말 연출(큰 메시지·흔들림·글로우) · done: 마지막 프레임 유지 */
  stage: PlaybackStage;
  /** 하단 이벤트 토스트 (가장 최근의 메시지 있는 스텝) */
  toast: { message: string; tick: number } | null;
  /** 결말 연출이 시작된 뒤 지난 시간 (ending/done 에서만 0 이상, 아니면 -1) */
  endingElapsedMs: number;
  /**
   * 이 스텝의 부엉이 이동(MOVE_MS)이 끝났는가 (칸을 옮기지 않은 스텝은 바로 true).
   * 끝나기 전에는 쥐·열쇠·문을 앞 스텝 상태로 그리고, 이 스텝의 토스트도 아직 띄우지 않는다
   */
  settled: boolean;
  /** 맵과 카운터에 그릴 쥐·열쇠·문 상태: 이동이 끝나면 이 스텝, 아니면 앞 스텝 */
  items: Pick<Step, 'eaten' | 'taken' | 'opened' | 'mice' | 'keys'>;
}

/** 고양이를 부엉이 위에 그릴 프레임: 고양이에게 잡힌 스텝이거나 같은 칸에 있을 때 */
export function catOnTop(step: Step): boolean {
  if (!step.cat) return false;
  return step.event === 'cat' || (step.cat.x === step.owl.x && step.cat.y === step.owl.y);
}

/** 마지막 틱 번호 (= trace.length − 1, 빈 trace면 0) */
export function lastIndex(trace: readonly Step[]): number {
  return Math.max(0, trace.length - 1);
}

/** 결말 연출이 시작되는 시각: 마지막 스텝이 뜨고 이동이 끝난 뒤 */
export function endingStartMs(trace: readonly Step[]): number {
  const last = lastIndex(trace);
  return last === 0 ? 0 : last * TICK_MS + MOVE_MS;
}

/**
 * 스텝 i의 쥐·열쇠·문·토스트가 바뀌기까지 기다리는 시간: 부엉이가 칸을 옮기면 MOVE_MS(도착한 뒤),
 * 제자리 스텝(회전·문 열기 등)이면 0.
 */
export function settleDelayMs(trace: readonly Step[], i: number): number {
  if (i <= 0 || i >= trace.length) return 0;
  const a = trace[i - 1].owl;
  const b = trace[i].owl;
  return a.x !== b.x || a.y !== b.y ? MOVE_MS : 0;
}

/** 한 팀 재생 전체 길이 (진행자 autoplay 계산과 같은 규칙: ticks × TICK_MS + ENDING_MS) */
export function playbackDurationMs(trace: readonly Step[]): number {
  return lastIndex(trace) * TICK_MS + ENDING_MS;
}

/**
 * 경과 시간(ms) → 그릴 프레임. elapsedMs가 Infinity면 마지막 프레임(새로고침 직후).
 * 스텝 i는 i × TICK_MS 에 나타난다(0번 = 초기 프레임).
 */
export function frameAt(trace: readonly Step[], elapsedMs: number): PlaybackFrame {
  if (trace.length === 0) throw new Error('frameAt: 빈 trace');
  const last = lastIndex(trace);
  const t = Number.isNaN(elapsedMs) ? 0 : Math.max(0, elapsedMs);
  const index = Math.min(last, Math.floor(t / TICK_MS));
  const step = trace[index];
  const atLast = index === last;

  const endStart = endingStartMs(trace);
  let stage: PlaybackStage = 'playing';
  let endingElapsedMs = -1;
  if (atLast && t >= endStart) {
    endingElapsedMs = t === Infinity ? Infinity : t - endStart;
    stage = endingElapsedMs < ENDING_MESSAGE_MS ? 'ending' : 'done';
  }

  // 토스트는 그 스텝의 쥐·열쇠·문이 바뀌는 순간(부엉이 도착)에 떠서 TOAST_MS 동안 있는다
  let toast: PlaybackFrame['toast'] = null;
  if (stage === 'playing') {
    for (let i = index; i >= 0; i--) {
      const shownAt = i * TICK_MS + settleDelayMs(trace, i);
      if (t < shownAt) continue; // 이 스텝의 부엉이가 아직 이동 중 → 앞 스텝 토스트를 본다
      if (t - shownAt >= TOAST_MS) break;
      const s = trace[i];
      if (s.message) {
        toast = { message: s.message, tick: s.tick };
        break;
      }
    }
  }
  // 쥐·열쇠·문은 부엉이가 그 칸에 도착한 뒤(이동 MOVE_MS가 끝난 뒤)에 바뀐다. 제자리 스텝은 바로 바뀐다
  const settled = t - index * TICK_MS >= settleDelayMs(trace, index);
  const src = settled ? step : trace[index - 1];
  const items = { eaten: src.eaten, taken: src.taken, opened: src.opened, mice: src.mice, keys: src.keys };
  return { index, step, atLast, stage, toast, endingElapsedMs, settled, items };
}

const DEG: Record<Dir, number> = { N: 0, E: 90, S: 180, W: 270 };

/**
 * 스텝마다 부엉이 누적 회전 각도. 이전 각도에서 짧은 쪽으로 돈다
 * (components/map/OwlSprite 의 nextRotation 과 같은 규칙, JSX 없는 모듈이라 여기서 다시 계산).
 */
export function rotations(trace: readonly Step[]): number[] {
  const out: number[] = [];
  let prev = 0;
  trace.forEach((s, i) => {
    const target = DEG[s.owl.dir];
    if (i === 0) {
      prev = target;
    } else {
      const cur = ((prev % 360) + 360) % 360;
      let delta = target - cur;
      if (delta > 180) delta -= 360;
      if (delta < -180) delta += 360;
      prev += delta;
    }
    out.push(prev);
  });
  return out;
}
