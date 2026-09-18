/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  /**
   * O painel mora em /admin.
   *
   * O aplicativo é o dono de `app.dinamique.com.br`; o painel é outro projeto
   * na Vercel, publicado por baixo desse mesmo domínio através de um rewrite
   * declarado em `apps/mobile/vercel.json`. Para o rewrite funcionar, o Next
   * precisa gerar TODAS as suas URLs (páginas, `_next/…`, Server Actions)
   * já com o prefixo; senão o navegador pede `/_next/…` ao aplicativo, que
   * não tem esses arquivos.
   *
   * `redirect()`, `<Link>` e `useRouter()` acrescentam o prefixo sozinhos:
   * o código continua escrevendo `/login`, nunca `/admin/login`.
   *
   * Se mudar aqui, mude junto em `src/lib/base-path.ts` e no rewrite:
   * `base-path.test.ts` falha se os três deixarem de combinar.
   */
  basePath: '/admin',

  experimental: {
    /**
     * Uma Server Action recusa requisições cujo `Origin` não bate com o host.
     * Atrás do rewrite o navegador diz `app.dinamique.com.br` enquanto o
     * servidor se vê no endereço da Vercel, e os dois precisam ser aceitos, ou
     * todo formulário do painel falha com "Invalid Server Actions request".
     */
    serverActions: {
      allowedOrigins: [
        'app.dinamique.com.br',
        'dinamique-admin-git-main-dinamique1.vercel.app',
      ],
    },
  },

  // Workspace packages ship as TypeScript source, so Next must compile them.
  transpilePackages: [
    '@dinamique/types',
    '@dinamique/utils',
    '@dinamique/business-logic',
    '@dinamique/exports',
    '@dinamique/billing',
  ],
  eslint: { ignoreDuringBuilds: false },
};

export default nextConfig;
