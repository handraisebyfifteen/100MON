// Lambda 用のバンドルを作る。/core を取り込み、AWS SDK は実行環境にあるものを使う。
import { build } from 'esbuild';
import { rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outRoot = join(here, 'dist');
const functions = ['api', 'aggregate', 'seed'];

await rm(outRoot, { recursive: true, force: true });
for (const name of functions) {
  const entry = name === 'seed' ? join(here, 'src/seed.ts') : join(here, `src/handlers/${name}.ts`);
  await build({
    entryPoints: [entry],
    outfile: join(outRoot, name, 'index.mjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'esm',
    sourcemap: 'inline',
    external: ['@aws-sdk/*'],
    banner: {
      // ESM のバンドルでも require を使う依存があれば動くようにする
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: 'info',
  });
}
