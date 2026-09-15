// Next.js 서버 시작 훅: 자동 봉인 틱커와 온라인 리스너를 등록한다 (docs/WEBSITE_SPEC.md §7).
// nodejs 런타임에서만 불러온다 (edge 번들에 SQLite가 섞이지 않게 문서 권장 형태 그대로).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { ensureRuntime } = await import('./lib/server/game/runtime');
    ensureRuntime();
  }
}
