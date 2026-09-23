/**
 * O prefixo onde o painel é servido.
 *
 * O Next acrescenta este prefixo sozinho em `<Link>`, `useRouter()` e
 * `redirect()`, então quase nenhum arquivo precisa dele. Ele existe aqui para
 * os poucos lugares que montam uma URL absoluta para fora do painel, e para
 * `base-path.test.ts` conferir que `next.config.mjs` e o rewrite do aplicativo
 * continuam falando do mesmo caminho.
 */
export const BASE_PATH = '/admin';
