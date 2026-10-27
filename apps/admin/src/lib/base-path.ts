/**
 * O /admin da frente de toda url do painel.
 *
 * O `basePath` do Next já cuida das páginas, dos arquivos estáticos, das
 * Server Actions e das rotas de api — mas só das urls que ele mesmo escreve.
 * Um `fetch('/relatar-erro')` ou um `href` montado à mão no nosso código sai
 * exatamente como está escrito, e bate na raiz do domínio, onde não há painel.
 *
 * Então todo endereço que nós escrevemos à mão passa por aqui, e o valor vem
 * de um lugar só: `next.config.mjs`.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path}`;
}
