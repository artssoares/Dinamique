// Um valor, dois usos: o basePath do Next e as urls que escrevemos à mão
// (src/lib/base-path.ts). Se divergirem, metade do painel procura o /admin e a
// outra metade procura a raiz.
const BASE_PATH = '/admin';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // O painel mora em /admin, não na raiz do domínio.
  //
  // Sem o basePath o navegador pediria `/_next/...` à raiz de
  // dinamique.com.br e receberia nada: o endereço da página mudaria e o dos
  // arquivos dela não. Com ele, TODA url do painel já nasce com /admin na
  // frente — páginas, arquivos estáticos, Server Actions e as rotas de api.
  basePath: BASE_PATH,

  // Para o nosso código do navegador montar url à mão sem repetir a string.
  env: { NEXT_PUBLIC_BASE_PATH: BASE_PATH },

  // Workspace packages ship as TypeScript source, so Next must compile them.
  transpilePackages: [
    '@dinamique/types',
    '@dinamique/utils',
    '@dinamique/business-logic',
    '@dinamique/exports',
    '@dinamique/billing',
  ],
  eslint: { ignoreDuringBuilds: false },

  async redirects() {
    return [
      // A raiz do domínio não é servida pelo basePath, então quem digita
      // dinamique.com.br sem o /admin cairia num 404 da Vercel. `basePath:
      // false` é o que faz esta regra valer FORA do /admin — sem ela, a regra
      // seria para /admin/ e criaria um laço com ela mesma.
      { source: '/', destination: BASE_PATH, basePath: false, permanent: false },
    ];
  },
};

export default nextConfig;
