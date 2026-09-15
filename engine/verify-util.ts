// verify 공용 헬퍼. 외부 테스트 러너 없음.
export type Check = { name: string; ok: boolean; detail?: string };

export function check(name: string, ok: boolean, detail?: string): Check {
  return ok ? { name, ok } : { name, ok, detail };
}

/** 값 비교용: 기대/실제를 JSON으로 붙여 detail을 만든다. */
export function eq<T>(name: string, actual: T, expected: T): Check {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  return check(name, a === e, `expected ${e}, got ${a}`);
}
