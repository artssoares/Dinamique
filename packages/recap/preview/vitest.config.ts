import { defineConfig } from 'vitest/config';

/**
 * Só a prévia. O `test` do pacote continua apontando para `src/**`, então isto
 * nunca roda na CI, é uma ferramenta de olhar, não uma asserção.
 */
export default defineConfig({
  root: __dirname + '/..',
  test: { include: ['preview/**/*.test.ts'] },
});
