// engine/ → lib/engine/ 복사. predev·prebuild·pretest에서 자동 실행된다.
// engine/*.ts 와 engine/rounds/*.ts 만 복사하고 _scratch/ 는 제외한다.
import { mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'engine');
const dest = join(root, 'lib', 'engine');
const HEADER = '// 생성된 파일: engine/에서 복사됨. 직접 수정 금지\n';

rmSync(dest, { recursive: true, force: true });

let count = 0;
for (const sub of ['', 'rounds']) {
  const from = join(src, sub);
  const to = join(dest, sub);
  mkdirSync(to, { recursive: true });
  for (const name of readdirSync(from)) {
    const file = join(from, name);
    if (!name.endsWith('.ts') || !statSync(file).isFile()) continue;
    const body = readFileSync(file, 'utf8').replace(/^﻿/, '');
    writeFileSync(join(to, name), HEADER + body, 'utf8');
    count += 1;
  }
}
console.log(`sync-engine: ${count}개 파일을 lib/engine/으로 복사했습니다.`);
