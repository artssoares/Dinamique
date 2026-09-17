import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BASE_PATH } from './base-path';

/**
 * Três arquivos precisam concordar sobre onde o painel mora. Se um mudar
 * sozinho, o painel publicado carrega sem CSS e sem JavaScript, um erro que
 * só aparece em produção. Este teste transforma isso numa falha de build.
 */
describe('base path', () => {
  const root = resolve(__dirname, '../../../..');

  it('é o mesmo em next.config.mjs', () => {
    const config = readFileSync(resolve(root, 'apps/admin/next.config.mjs'), 'utf8');
    expect(config).toContain(`basePath: '${BASE_PATH}'`);
  });

  it('é o mesmo no rewrite que o aplicativo publica', () => {
    const vercel = JSON.parse(readFileSync(resolve(root, 'apps/mobile/vercel.json'), 'utf8')) as {
      rewrites?: { source: string; destination: string }[];
    };

    const rewrites = vercel.rewrites ?? [];
    expect(rewrites.length).toBeGreaterThan(0);

    for (const rewrite of rewrites) {
      expect(rewrite.source.startsWith(BASE_PATH)).toBe(true);
      expect(rewrite.destination).toContain(BASE_PATH);
    }
  });
});
