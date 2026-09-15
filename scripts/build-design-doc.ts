// OWL COMPILE 설계서 조립기
// docs/sections/*.md + DECISIONS + ENGINE_SPEC → docs/DESIGN.md (마크다운 원본) + HTML
// 라운드 요약·블록 카드·보드 재생 미리보기는 엔진의 실제 데이터(MAPS, SOLUTIONS, run, score)로 만든다.
// 사용: npx tsx scripts/build-design-doc.ts [--artifact <html>] [--standalone <html, 기본 docs/design.html>]
//                                           [--draft "<중간본 안내>"] [--date YYYY-MM-DD] [--no-md]
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { marked } from 'marked';
import { MAP_LIST, SOLUTIONS, ROUND_EXTRAS, BLOCKS, run, score, parseMap, toText } from '../engine/index';
import type { Block, GameMap, Pos, Program } from '../engine/types';
import { runCore } from '../engine/verify-core';
import { runRounds } from '../engine/verify-rounds';

const ROOT = resolve(process.cwd());
const DOCS = join(ROOT, 'docs');
const SECTIONS = join(DOCS, 'sections');
const SCRIPTS = join(ROOT, 'scripts');
const args = process.argv.slice(2);
const flag = (name: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? null : null; };
const artifactOut = flag('--artifact');
const standaloneOut = flag('--standalone') ?? join(DOCS, 'design.html');
const draft = flag('--draft');
const docDate = flag('--date') ?? '2026-09-11';
const writeMd = !args.includes('--no-md');
const SOL = SOLUTIONS as unknown as Record<string, Program[]>;
const EXTRAS = ROUND_EXTRAS as unknown as Record<string, { noSleep?: Program } | undefined>;

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string) => escapeHtml(s).replace(/"/g, '&quot;');

// ------------------------------------------------------------------ 마크다운 수집
const read = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const files = readdirSync(SECTIONS).filter((f) => /^\d\d-.*\.md$/.test(f)).sort();
const mainFiles = files.filter((f) => /^(0[1-9]|1[01])-/.test(f));
const appA = files.find((f) => f.startsWith('12-'));
const appB = files.find((f) => f.startsWith('00-'));

/** 코드 펜스 밖의 줄에만 fn 적용 (null이면 줄 삭제) */
function mapOutsideFences(md: string, fn: (line: string) => string | null): string {
  let fence = false;
  const out: string[] = [];
  for (const line of md.split('\n')) {
    if (/^\s*```/.test(line)) { fence = !fence; out.push(line); continue; }
    if (fence) { out.push(line); continue; }
    const r = fn(line);
    if (r !== null) out.push(r);
  }
  return out.join('\n');
}
const stripH1 = (md: string) => mapOutsideFences(md, (l) => (/^# /.test(l) ? null : l));
/** 독립 문서를 부록으로: 첫 H1 제거, 나머지 제목 한 단계 내림 */
function asAppendix(md: string, title: string): string {
  let droppedH1 = false;
  const body = mapOutsideFences(md, (l) => {
    if (!droppedH1 && /^# /.test(l)) { droppedH1 = true; return null; }
    return /^#{2,5} /.test(l) ? '#' + l : l;
  });
  return `## ${title}\n\n${body.trim()}\n`;
}

const parts: string[] = [];
for (const f of mainFiles) parts.push(stripH1(read(join(SECTIONS, f))).trim() + '\n');
if (appA) parts.push(stripH1(read(join(SECTIONS, appA))).trim() + '\n');
if (appB) parts.push(stripH1(read(join(SECTIONS, appB))).trim() + '\n');
const decisionsMd = asAppendix(read(join(DOCS, 'DECISIONS.md')), '부록 C. 공통 설계 결정');
const specMd = asAppendix(read(join(DOCS, 'ENGINE_SPEC.md')), '부록 D. 엔진 스펙');

// ------------------------------------------------------------------ 엔진 데이터
const checks = [...runCore(), ...runRounds()];
const passed = checks.filter((c) => c.ok).length;
if (passed !== checks.length) console.warn(`경고: 엔진 검증 ${passed}/${checks.length}`);

interface RoundFact { map: GameMap; program: Program; blocks: number; ticks: number; mice: number; score: number; note: string | null }
const rounds: RoundFact[] = MAP_LIST.map((map) => {
  const program = SOL[`r${map.round}`][0];
  const r = run(map, program);
  const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  let note: string | null = null;
  const noSleep = EXTRAS[`r${map.round}`]?.noSleep;
  if (noSleep) {
    const d = run(map, noSleep);
    const last = d.trace[d.trace.length - 1];
    note = `잠자기를 빼면 ${d.ticks}틱째 (${last.owl.x},${last.owl.y})에서 “${d.message}”`;
  }
  if (r.outcome !== 'goal') console.warn(`경고: R${map.round} 대표 정답이 ${r.outcome}`);
  return { map, program, blocks: r.blocks, ticks: r.ticks, mice: r.mice, score: s.total, note };
});

// ------------------------------------------------------------------ 재생 시나리오 (보드가 results.trace를 재생하는 방식 그대로)
interface PStep { t: number; l: number | null; x: number; y: number; d: string; c: [number, number] | null; e: string | null; m: string | null; eat: string[]; tak: string[]; opn: string[] }
interface Scenario {
  key: string; tab: string; title: string; tiles: string[]; cat: boolean;
  lines: { text: string; head: boolean }[]; steps: PStep[];
  outcome: string; message: string; score: { label: string; points: number }[]; total: number;
}
const pk = (p: Pos) => `${p.x},${p.y}`;
function scenario(key: string, tab: string, title: string, map: GameMap, program: Program): Scenario {
  const r = run(map, program);
  const s = score(r, { cap: map.cap, firstSubmit: false, usedPatch: false });
  return {
    key, tab, title, tiles: map.tiles, cat: !!map.cat,
    lines: toText(program).lines.map((l) => ({ text: l.text, head: !!l.blockId && BLOCKS[l.blockId].ticks === 0 })),
    steps: r.trace.map((st) => ({
      t: st.tick, l: st.line, x: st.owl.x, y: st.owl.y, d: st.owl.dir,
      c: st.cat ? [st.cat.x, st.cat.y] : null, e: st.event, m: st.message,
      eat: st.eaten.map(pk), tak: st.taken.map(pk), opn: st.opened.map(pk),
    })),
    outcome: r.outcome, message: r.message, score: s.lines, total: s.total,
  };
}
const scenarios: Scenario[] = rounds.map((r) =>
  scenario(`r${r.map.round}`, `R${r.map.round}`, `R${r.map.round} ${r.map.name} · 대표 정답 ${r.blocks}블록`, r.map, r.program));
const r5 = rounds.find((r) => r.map.round === 5);
const r5NoSleep = EXTRAS.r5?.noSleep;
if (r5 && r5NoSleep) {
  scenarios.push(scenario('r5x', 'R5 잠자기 빼기', `R5 ${r5.map.name} · 잠자기를 뺀 코드 ${r5.blocks - 1}블록`, r5.map, r5NoSleep));
}
const DEFAULT_KEY = scenarios.some((s) => s.key === 'r5') ? 'r5' : scenarios[0].key;

// ------------------------------------------------------------------ 블록 카드 (plan/cards.html 이식)
const ICON: Record<string, string> = {
  forward: '<path d="M12 20V4"/><path d="M5 11l7-7 7 7"/>',
  jump: '<path d="M3 18c3-10 15-10 18 0"/><path d="M21 18v-4h-4"/><circle cx="3" cy="18" r="1.4" fill="currentColor"/>',
  left: '<path d="M20 18a8 8 0 0 0-8-8H4"/><path d="M8 6L4 10l4 4"/>',
  right: '<path d="M4 18a8 8 0 0 1 8-8h8"/><path d="M16 6l4 4-4 4"/>',
  repeat: '<path d="M4 12a8 8 0 0 1 14-5.3"/><path d="M20 12a8 8 0 0 1-14 5.3"/><path d="M18 3v4h-4"/><path d="M6 21v-4h4"/>',
  if_wall: '<path d="M12 21V11"/><path d="M12 11 6 5"/><path d="M12 11l6-6"/><path d="M6 5H3v3"/><path d="M18 5h3v3"/>',
  if_pit: '<path d="M12 21V11"/><path d="M12 11 6 5"/><path d="M12 11l6-6"/><path d="M6 5H3v3"/><path d="M18 5h3v3"/>',
  def: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 16V8h5"/><path d="M9 12h4"/>',
  call: '<path d="M7 16V8h5"/><path d="M7 12h4"/><path d="M14 12h7"/><path d="M18 9l3 3-3 3"/>',
  sleep: '<path d="M4 10h5l-5 6h5"/><path d="M13 4h6l-6 7h6"/>',
};
const icon = (id: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg>`;
const stack = (list: Block[]) => `<div class="stack">${list.map(blockHtml).join('')}</div>`;
function blockHtml(b: Block): string {
  const m = BLOCKS[b.id];
  const cat = m.category;
  switch (b.id) {
    case 'repeat':
      return `<div class="cblk ${cat}"><div class="blk ${cat}">${icon(b.id)}반복 <span class="n">${b.n}</span></div><div class="mouth">${stack(b.body)}</div><div class="foot"></div></div>`;
    case 'if_wall':
    case 'if_pit':
      return `<div class="cblk ${cat}"><div class="blk ${cat} long">${icon(b.id)}${m.label}</div><div class="mouth">${stack(b.then)}</div><div class="else">아니면</div><div class="mouth">${stack(b.else)}</div><div class="foot"></div></div>`;
    case 'def':
      return `<div class="cblk ${cat}"><div class="blk ${cat}">${icon(b.id)}${m.label}</div><div class="mouth">${stack(b.body)}</div><div class="foot"></div></div>`;
    default:
      return `<div class="blk ${cat}">${icon(b.id)}${m.label}</div>`;
  }
}

// ------------------------------------------------------------------ 맵 (브리프 §2 타일 표)
const OWL_BODY = '<circle cx="32" cy="34" r="24" fill="#7A4DFF"/><path d="M12 22 L22 6 L30 20 Z M52 22 L42 6 L34 20 Z" fill="#7A4DFF"/><circle cx="23" cy="31" r="8" fill="#F6F2FF"/><circle cx="41" cy="31" r="8" fill="#F6F2FF"/><circle cx="24" cy="32" r="3.5" fill="#14102A"/><circle cx="42" cy="32" r="3.5" fill="#14102A"/><path d="M29 39 L35 39 L32 45 Z" fill="#FFB020"/>';
const OWL_ARROW = '<path d="M32 -9 L38.5 -1 L25.5 -1 Z" fill="#FFC54D"/>';
const DEG: Record<string, number> = { N: 0, E: 90, S: 180, W: 270 };
const owlSprite = (dir: string) =>
  `<svg class="owl" viewBox="-4 -10 72 78" style="transform:rotate(${DEG[dir]}deg)" aria-hidden="true">${OWL_ARROW}${OWL_BODY}</svg>`;
const TILE_NAME: Record<string, string> = { '.': '바닥', '#': '벽', O: '구덩이', M: '쥐', K: '열쇠', D: '문', S: '시작', G: '둥지', c: '고양이 순찰로' };

function cellHtml(t: string, opts: { dir?: string; cat?: boolean } = {}): string {
  switch (t) {
    case '#': return '<span class="c wall"></span>';
    case 'O': return '<span class="c"><i class="pit"></i></span>';
    case 'M': return '<span class="c"><b class="e">🐭</b></span>';
    case 'K': return '<span class="c"><b class="e">🔑</b></span>';
    case 'D': return '<span class="c door"><b class="e">🚪</b></span>';
    case 'S': return `<span class="c start">${owlSprite(opts.dir ?? 'E')}</span>`;
    case 'G': return '<span class="c"><i class="ring"></i></span>';
    case 'c': return `<span class="c patrol">${opts.cat ? '<b class="e">🐱</b>' : ''}</span>`;
    default: return '<span class="c"></span>';
  }
}
function mapHtml(map: GameMap): string {
  parseMap(map); // S/G 개수 검사
  const cat = map.cat?.path[0];
  const cells: string[] = [];
  map.tiles.forEach((row, y) => row.split('').forEach((t, x) => {
    cells.push(cellHtml(t, { dir: map.startDir, cat: !!cat && cat.x === x && cat.y === y }));
  }));
  const label = `R${map.round} ${map.name} 맵. 시작 방향 ${map.startDir}. 행별 타일: ${map.tiles.join(' / ')}`;
  return `<div class="map" role="img" aria-label="${escapeAttr(label)}">${cells.join('')}</div>`;
}

// ------------------------------------------------------------------ 마크다운 → HTML
const MERMAID_VERSION = '11.15.0';
const MERMAID_INIT = '%%{init: {"theme":"base","themeVariables":{"background":"#1E1740","primaryColor":"#2A2150","primaryTextColor":"#F6F2FF","primaryBorderColor":"#7A4DFF","lineColor":"#B9AEDB","secondaryColor":"#241D4A","tertiaryColor":"#1E1740","mainBkg":"#2A2150","nodeBorder":"#7A4DFF","clusterBkg":"#1A1438","clusterBorder":"#3A3170","titleColor":"#F6F2FF","edgeLabelBackground":"#1E1740","noteBkgColor":"#3A2A10","noteTextColor":"#FFE3B0","noteBorderColor":"#FFB020","actorBkg":"#2A2150","actorBorder":"#7A4DFF","actorTextColor":"#F6F2FF","actorLineColor":"#5A4F8C","signalColor":"#B9AEDB","signalTextColor":"#F6F2FF","labelBoxBkgColor":"#2A2150","labelBoxBorderColor":"#7A4DFF","labelTextColor":"#F6F2FF","loopTextColor":"#F6F2FF","activationBkgColor":"#3A2F6E","activationBorderColor":"#7A4DFF","sequenceNumberColor":"#14102A","stateBkg":"#2A2150","stateLabelColor":"#F6F2FF","compositeBackground":"#1A1438","transitionColor":"#B9AEDB","transitionLabelColor":"#F6F2FF","altBackground":"#1A1438","taskBkgColor":"#7A4DFF","taskTextColor":"#F6F2FF","taskBorderColor":"#9D7BFF","sectionBkgColor":"#1E1740","altSectionBkgColor":"#241D4A","gridColor":"#3A3170","todayLineColor":"#FF6B9A","fontFamily":"Noto Sans KR, sans-serif","fontSize":"14px"}}}%%';

interface TocItem { id: string; num: string; title: string }
const toc: TocItem[] = [];
let hCount = 0;

/** <pre> 밖에서만 fn 적용 */
function outsidePre(html: string, fn: (s: string) => string): string {
  return html.split(/(<pre[\s\S]*?<\/pre>)/g).map((seg) => (seg.startsWith('<pre') ? seg : fn(seg))).join('');
}
function enhance(html: string): string {
  html = html.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,
    (_m, body: string) => `<pre class="mermaid">${MERMAID_INIT}\n${body.trim()}</pre>`);
  html = html.replace(/<pre><code(?: class="language-([\w+-]+)")?>/g,
    (_m, lang?: string) => `<pre class="code"${lang ? ` data-lang="${lang}"` : ''}><code>`);
  return outsidePre(html, (s) => s
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<strong>\s*\[결정\]\s*<\/strong>|\[결정\]/g, '<span class="tag dec">결정</span>')
    .replace(/<strong>\s*\[미결\]\s*<\/strong>|\[미결\]/g, '<span class="tag open">미결</span>')
    .replace(/<h([2345])>([\s\S]*?)<\/h\1>/g, (_m, lvl: string, inner: string) => {
      const id = `h${++hCount}`;
      const plain = inner.replace(/<[^>]+>/g, '').trim();
      if (lvl === '2') {
        const mNum = plain.match(/^0*(\d+)\.\s*(.+)$/);
        const mApp = plain.match(/^부록\s+([A-Z])\.\s*(.+)$/);
        const num = mNum ? mNum[1] : mApp ? `부록 ${mApp[1]}` : '';
        const title = mNum ? mNum[2] : mApp ? mApp[2] : plain;
        toc.push({ id, num, title });
        return `<h2 id="${id}" data-toc>${num ? `<span class="num">${num}</span>` : ''}<span class="t">${title}</span></h2>`;
      }
      if (lvl === '3') {
        const m3 = inner.match(/^\s*(\d+(?:\.\d+)+)\.?\s+([\s\S]+)$/);
        if (m3) return `<h3 id="${id}"><span class="num3">${m3[1]}</span>${m3[2]}</h3>`;
      }
      return `<h${lvl} id="${id}">${inner}</h${lvl}>`;
    }));
}

const docMd = parts.join('\n\n') + '\n\n' + decisionsMd + '\n\n' + specMd;
const docHtml = enhance(marked.parse(docMd, { async: false, gfm: true }) as string);

// ------------------------------------------------------------------ 페이지 조각
const r3 = rounds.find((r) => r.map.round === 3)!;
const diffClass: Record<string, string> = { 쉬움: 'easy', 중간: 'mid', 어려움: 'hard' };
const roundCards = rounds.map((r) => `
      <article class="round">
        <header><span class="rn">R${r.map.round}</span><h3>${r.map.name}</h3><span class="diff ${diffClass[r.map.difficulty]}">${r.map.difficulty}</span></header>
        ${mapHtml(r.map)}
        <p class="intro"><span>새 요소</span>${r.map.intro}</p>
        <dl class="kv">
          <div><dt>상한</dt><dd>${r.map.cap}블록</dd></div>
          <div><dt>코딩</dt><dd>${Math.round(r.map.seconds / 60)}분</dd></div>
          <div><dt>대표 정답</dt><dd>${r.blocks}블록 · ${r.ticks}틱</dd></div>
          <div><dt>점수</dt><dd>${r.score}점${r.mice ? ` <small>쥐 ${r.mice}</small>` : ''}</dd></div>
        </dl>
        ${r.note ? `<p class="note">${r.note}</p>` : ''}
      </article>`).join('');

const legend = ['.', '#', 'O', 'M', 'K', 'D', 'S', 'G', 'c'].map((t) =>
  `<li><span class="lg">${cellHtml(t, { dir: 'E', cat: t === 'c' })}</span>${TILE_NAME[t]}${t === 'M' ? ' +20' : ''}</li>`).join('');

// 재생 미리보기: 기본 시나리오를 미리 그려 둔다 (스크립트 전에도 보이도록)
const PLAY_CELL: Record<string, [string, string]> = {
  '#': ['c wall', ''], O: ['c', '<i class="pit"></i>'], M: ['c', '<b class="e">🐭</b>'], K: ['c', '<b class="e">🔑</b>'],
  D: ['c door', '<b class="e">🚪</b>'], G: ['c goal', '<i class="ring"></i>'], c: ['c patrol', ''],
};
const defSc = scenarios.find((s) => s.key === DEFAULT_KEY)!;
const s0 = defSc.steps[0];
const playGrid = defSc.tiles.map((row, y) => row.split('').map((t, x) => {
  const [cls, inner] = PLAY_CELL[t] ?? ['c', ''];
  return `<span class="${cls}" data-k="${x},${y}">${inner}</span>`;
}).join('')).join('');
const playCode = defSc.lines.map((l, n) =>
  `<li data-n="${n}"${l.head ? ' class="head"' : ''}><span class="ln">${n + 1}</span><span class="tx">${escapeHtml(l.text)}</span></li>`).join('');
const playTabs = scenarios.map((s) =>
  `<button type="button" role="tab" data-key="${s.key}" aria-selected="${s.key === DEFAULT_KEY}"${s.key === 'r5x' ? ' class="alt"' : ''}>${s.tab}</button>`).join('');
const playData = JSON.stringify(scenarios).replace(/</g, '\\u003c');

const tocList = (cls: string) => `<ol class="${cls}">
  <li><a href="#play"><span class="n">·</span><span>보드 재생 미리보기</span></a></li>
  <li><a href="#rounds"><span class="n">·</span><span>라운드 한눈에</span></a></li>
  ${toc.map((t) => `<li><a href="#${t.id}"><span class="n">${t.num.replace('부록 ', '')}</span><span>${t.title}</span></a></li>`).join('\n  ')}
</ol>`;

const CSS = readFileSync(join(SCRIPTS, 'design-doc.css'), 'utf8');
const JS = readFileSync(join(SCRIPTS, 'design-doc.js'), 'utf8');

const headPart = `<title>OWL COMPILE 설계서</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&family=JetBrains+Mono:wght@500;600&display=swap">
<style>
${CSS}
</style>
`;
const bodyPart = `<div class="shell">
  <aside class="toc" aria-label="목차">
    <a class="brand" href="#top"><svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">${OWL_BODY}</svg>OWL COMPILE</a>
    ${tocList('toc-list')}
  </aside>
  <main id="top">
    <header class="hero">
      <div class="hero-text">
        <p class="eyebrow">S.OWL 오리엔테이션 · 팀 코딩 게임 · 시스템 설계서</p>
        <h1>OWL COMPILE 설계서</h1>
        <p class="lead">4명이 한 팀이 되어 각자 자기 색 블록만 놓는다. 조립한 코드는 진행자가 프로젝터에서 한 틱씩 실행하고, 버그는 전원 앞에서 터진다. 이 문서는 그 게임을 폰 편집기, 진행자 화면, 프로젝터 보드, 결정적 엔진으로 나눠 설계한다.</p>
        <ul class="facts">
          <li>4역할 · 10블록</li>
          <li>5라운드 · 8×8 맵</li>
          <li>틱당 600ms 재생</li>
          <li>엔진 검증 <b>${passed}/${checks.length}</b> 통과</li>
          <li>Next.js 15 + Supabase Realtime</li>
        </ul>
        ${draft ? `<p class="draft"><b>중간본</b> ${escapeHtml(draft)}</p>` : ''}
        <p class="docmeta"><span>기준 문서 plan/CLAUDE.md · plan/cards.html</span><span>엔진 engine/ · npx tsx engine/verify.ts</span><span>${docDate}</span></p>
      </div>
      <figure class="program">
        <figcaption>R3 ${r3.map.name} 대표 정답 · ${r3.blocks}블록 · ${r3.ticks}틱 · 쥐 ${r3.mice} · ${r3.score}점</figcaption>
        ${stack(r3.program)}
      </figure>
    </header>

    <nav class="toc-inline" aria-label="목차">${tocList('toc-list cols')}</nav>

    <section class="play" id="play" data-toc data-default="${DEFAULT_KEY}">
      <div class="sec-head">
        <h2>보드 재생 미리보기</h2>
        <p>진행자가 전체 실행을 누르면 프로젝터에 뜨는 화면을 줄였다. 엔진이 대표 정답을 실행한 trace를 틱당 600ms로 재생한다. 팀 화면에는 이 기능이 없다.</p>
      </div>
      <div class="tabs" role="tablist" aria-label="재생할 코드">${playTabs}</div>
      <div class="stage">
        <div class="board-wrap">
          <div class="board">
            <div class="grid">${playGrid}</div>
            <div class="actor owl" style="transform:translate(${s0.x * 100}%, ${s0.y * 100}%)"><svg viewBox="-4 -10 72 78" style="transform:rotate(${DEG[s0.d]}deg)" aria-hidden="true">${OWL_ARROW}${OWL_BODY}</svg></div>
            <div class="actor cat"${defSc.cat && s0.c ? ` style="transform:translate(${s0.c[0] * 100}%, ${s0.c[1] * 100}%)"` : ' hidden'}><b>🐱</b></div>
            <div class="toast" role="status" aria-live="polite"></div>
          </div>
          <p class="caption">${escapeHtml(defSc.title)}</p>
        </div>
        <div class="side">
          <div class="hud"><span class="tick">틱 0 / ${defSc.steps.length - 1}</span><span class="status" aria-live="polite">대기</span></div>
          <ol class="code" aria-label="팀 코드">${playCode}</ol>
          <div class="controls">
            <button type="button" data-act="play" class="primary">재생</button>
            <button type="button" data-act="step">한 틱</button>
            <button type="button" data-act="reset">처음으로</button>
          </div>
          <div class="result" hidden></div>
        </div>
      </div>
      <script type="application/json" id="play-data">${playData}</script>
    </section>

    <section class="rounds" id="rounds" data-toc>
      <div class="sec-head">
        <h2>라운드 한눈에</h2>
        <p>엔진이 대표 정답을 실제로 실행한 결과다. 최초 제출·패치 보정은 뺀 점수.</p>
      </div>
      <div class="rounds-grid">${roundCards}
      </div>
      <ul class="legend" aria-label="타일 범례">${legend}</ul>
    </section>

    <article class="doc">
${docHtml}
    </article>
  </main>
</div>
<script>
${JS}
</script>
`;

// ------------------------------------------------------------------ 출력
if (artifactOut) writeFileSync(artifactOut, headPart + bodyPart, 'utf8');
// 단독 파일: 아티팩트 호스트가 해 주는 mermaid 렌더링을 cdnjs 스크립트로 대신한다.
const standalone = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${headPart}<script src="https://cdnjs.cloudflare.com/ajax/libs/mermaid/${MERMAID_VERSION}/mermaid.min.js"></script>
</head>
<body>
${bodyPart}<script>
try {
  mermaid.initialize({ startOnLoad: false });
  mermaid.run({ querySelector: 'pre.mermaid', suppressErrors: true })
    .then(() => console.log('mermaid rendered', document.querySelectorAll('pre.mermaid svg').length));
} catch (e) { console.error(e); }
</script>
</body>
</html>
`;
writeFileSync(standaloneOut, standalone, 'utf8');

if (writeMd) {
  const header = `# OWL COMPILE 설계서

S.OWL 오리엔테이션 팀 코딩 게임의 시스템 설계서다.

- 기준 문서: \`plan/CLAUDE.md\`(빌드 브리프), \`plan/cards.html\`(블록 카드)
- 엔진: \`engine/\` · 검증 \`npx tsx engine/verify.ts\` (${passed}/${checks.length} 통과)
- 공통 결정: \`docs/DECISIONS.md\` · 엔진 스펙: \`docs/ENGINE_SPEC.md\`
- 작성일: ${docDate}

## 목차

${toc.filter((t) => !t.num.startsWith('부록 C') && !t.num.startsWith('부록 D')).map((t) => `- ${t.num ? `${t.num}. ` : ''}${t.title}`).join('\n')}
- 부록 C. 공통 설계 결정 → \`docs/DECISIONS.md\`
- 부록 D. 엔진 스펙 → \`docs/ENGINE_SPEC.md\`

## 라운드 한눈에

| R | 이름 | 난이도 | 상한 | 코딩 | 새 요소 | 대표 정답 | 점수 |
|---|---|---|---|---|---|---|---|
${rounds.map((r) => `| ${r.map.round} | ${r.map.name} | ${r.map.difficulty} | ${r.map.cap} | ${Math.round(r.map.seconds / 60)}분 | ${r.map.intro} | ${r.blocks}블록 · ${r.ticks}틱 · 쥐 ${r.mice} | ${r.score} |`).join('\n')}
`;
  writeFileSync(join(DOCS, 'DESIGN.md'), header + '\n' + parts.join('\n\n'), 'utf8');
}

console.log(`sections: ${mainFiles.length} main + ${[appA, appB].filter(Boolean).length} appendix · toc ${toc.length}`);
console.log(`mermaid ${(docHtml.match(/<pre class="mermaid">/g) || []).length} · tables ${(docHtml.match(/<table>/g) || []).length} · scenarios ${scenarios.map((s) => `${s.key}:${s.outcome}@${s.steps.length - 1}`).join(' ')}`);
console.log(`engine checks: ${passed}/${checks.length}`);
if (artifactOut) console.log(`artifact: ${artifactOut} (${Buffer.byteLength(headPart + bodyPart, 'utf8')} bytes)`);
console.log(`standalone: ${standaloneOut} (${Buffer.byteLength(standalone, 'utf8')} bytes)`);
