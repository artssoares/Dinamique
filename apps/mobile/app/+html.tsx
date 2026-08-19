import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';

/**
 * Casca HTML do aplicativo na web (§16).
 *
 * Sem este arquivo, `<html>` e `<body>` ficam sem cor de fundo nenhuma. O
 * resultado é o navegador pintando o que sobra com o padrão dele: a faixa
 * acima e abaixo ao arrastar a página, a barra de rolagem e — o mais visível —
 * a tela inteira no instante entre abrir o endereço e o aplicativo montar.
 * Num celular no modo escuro isso aparecia como um pisca claro a cada troca de
 * tela, o que dá a impressão de o aplicativo misturar tema claro e escuro.
 *
 * O fundo aqui é só o ponto de partida, decidido pelo sistema operacional
 * antes de qualquer JavaScript rodar. Assim que o aplicativo sabe a preferência
 * salva do motorista, `_layout.tsx` repinta com o token correspondente.
 *
 * `color-scheme` faz o navegador acompanhar: barra de rolagem, campos de texto
 * e menus nativos deixam de destoar do resto da tela.
 */

const BACKGROUND_BOOTSTRAP = `
:root { color-scheme: light dark; }
html, body { background-color: #F7F8FA; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: #0D1016; }
}
body { overscroll-behavior-y: none; }
`;

export default function Root({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* Sem isto, um ScrollView de altura total não rola na web. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: BACKGROUND_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
