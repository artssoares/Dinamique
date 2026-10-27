import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

/**
 * Um `setInterval` que só corre com o aplicativo na frente dos olhos.
 *
 * Existe por causa de bateria, e a conta é direta: um temporizador de vinte
 * segundos continua disparando com o aplicativo em segundo plano no Android —
 * e numa jornada em andamento o serviço em primeiro plano mantém o JavaScript
 * vivo a jornada inteira, então ele dispara mesmo com o telefone no bolso, dez
 * horas seguidas, para atualizar um número que ninguém está vendo. Cada
 * disparo é uma ida à camada nativa e uma leitura de disco.
 *
 * No iOS o JavaScript é suspenso em segundo plano, então lá isto só confirma o
 * que o sistema já fazia.
 *
 * Ao voltar para a frente, roda uma vez na hora, antes de reabrir o intervalo:
 * o que a pessoa vê ao destravar o telefone é o estado agora, não o de quando
 * ela guardou o aparelho.
 */
export function useForegroundInterval(
  work: (() => void) | null,
  intervalMs: number,
  /** Falso quando o trabalho não deve rodar nem com o aplicativo aberto. */
  enabled = true,
): void {
  // Pela ref para que uma função recriada a cada render não reinicie o
  // intervalo (e, no caso da presença, não force uma publicação a cada render).
  const latest = useRef(work);
  latest.current = work;

  // Um booleano, e não a própria função, para que o efeito só reinicie quando
  // o trabalho passa a existir ou deixa de existir.
  const running = enabled && work !== null;

  useEffect(() => {
    if (!running) return undefined;

    let timer: ReturnType<typeof setInterval> | null = null;

    const run = () => latest.current?.();

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(run, intervalMs);
    };

    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };

    // `currentState` pode vir nulo antes de o sistema responder a primeira
    // vez; nesse caso o certo é começar rodando, não ficar parado para sempre.
    if (AppState.currentState !== 'background') start();

    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        run();
        start();
      } else if (next === 'background') {
        stop();
      }
      // `inactive` é passageiro (a central de controle, uma ligação chegando):
      // desligar ali faria o intervalo reiniciar a cada toque na tela.
    });

    return () => {
      stop();
      subscription.remove();
    };
  }, [running, intervalMs]);
}
