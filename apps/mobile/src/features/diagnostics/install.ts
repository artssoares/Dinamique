import { reportCaught } from '@/lib/report';

/**
 * Liga os dois lugares por onde uma falha escapa sem ninguém ver.
 *
 * O `ErrorBoundary` do React pega o que quebra durante a renderização. Não
 * pega o que quebra depois: um `setTimeout`, um `await` sem catch, um evento
 * do sistema. Esses dois ganchos pegam. Sem eles, a central de erros só
 * mostraria telas brancas e nenhum dos travamentos que o motorista sente.
 *
 * Roda no escopo do módulo, uma vez. Instalar de dentro de um componente
 * significaria instalar de novo a cada montagem e empilhar handlers.
 */

interface ErrorUtilsLike {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
}

let installed = false;

export function installDiagnostics(): void {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;

  if (errorUtils) {
    // O handler anterior é o que mostra a tela vermelha em desenvolvimento e o
    // que encerra o app em produção. Reportamos e devolvemos a bola: engolir
    // aqui esconderia o travamento de quem está depurando.
    const previous = errorUtils.getGlobalHandler?.();

    errorUtils.setGlobalHandler((error, isFatal) => {
      reportCaught(error, { severity: isFatal ? 'fatal' : 'error', context: { handler: 'global' } });
      previous?.(error, isFatal);
    });
  }

  const scope = globalThis as {
    addEventListener?: (type: string, listener: (event: unknown) => void) => void;
  };

  scope.addEventListener?.('unhandledrejection', (event: unknown) => {
    const reason = (event as { reason?: unknown })?.reason ?? event;
    reportCaught(reason, { context: { handler: 'unhandledrejection' } });
  });
}
