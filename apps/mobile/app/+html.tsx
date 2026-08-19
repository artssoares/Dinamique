import { ScrollViewStyleReset } from 'expo-router/html';
import type { ReactNode } from 'react';
import { darkTokens, fontFamily, lightTokens } from '@dinamique/ui';

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

// As cores vêm dos tokens, nunca escritas à mão aqui: um hex solto nesta folha
// deixaria de acompanhar o tema no dia em que a paleta mudasse.
const BACKGROUND_BOOTSTRAP = `
:root { color-scheme: light dark; }
html, body { background-color: ${lightTokens.backgroundPrimary}; }
@media (prefers-color-scheme: dark) {
  html, body { background-color: ${darkTokens.backgroundPrimary}; }
}
body {
  overscroll-behavior-y: none;
  font-family: ${fontFamily};
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
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

        {/*
          Inter é a tipografia de interface que o manual de marca define (§04).
          O `preconnect` existe porque a fonte entra no primeiro texto que a
          tela desenha — sem ele, o título pisca na fonte do sistema antes de
          assentar. `display=swap` mantém o texto legível durante a troca.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />

        {/* Sem isto, um ScrollView de altura total não rola na web. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: BACKGROUND_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
