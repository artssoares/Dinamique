import * as Location from 'expo-location';
import { locationService } from '@/features/tracking/locationService';

/**
 * Uma leitura só de onde a pessoa está, para o botão de emergência.
 *
 * Não usa nada do `locationService`: aquele módulo abre um `watch` para contar
 * quilômetros de uma jornada, guarda os pontos em buffer e é opt-in próprio.
 * Aqui é o contrário em todos os sentidos: um ponto, agora, sem gravar nada, e
 * com um prazo curto, porque uma tela de socorro que fica pensando é uma tela
 * que falhou.
 *
 * ┌── O que precisa de aplicativo nativo ───────────────────────────────────┐
 * │ NADA nesta leitura. `getCurrentPositionAsync` funciona no navegador, e é│
 * │ justamente o que o link de teste usa.                                   │
 * │                                                                         │
 * │ O que o navegador NÃO faz é o resto: posição com a tela apagada ou com  │
 * │ o aplicativo da corrida por cima, e Push. Para o SOS isso importa menos │
 * │ do que parece (o dedo está na tela no momento do disparo), mas importa  │
 * │ para RECEBER: um alerta que chega enquanto a aba está em segundo plano  │
 * │ no navegador aparece só quando a pessoa volta ao Dinamique. No          │
 * │ aplicativo nativo é uma notificação do sistema.                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

export interface SafetyFix {
  lat: number;
  lon: number;
  accuracy: number | null;
  /** True quando o ponto é o de demonstração, não uma leitura real. */
  demo: boolean;
}

/**
 * Onde o modo demonstração diz que a pessoa está: a Praça da Sé, no centro de
 * São Paulo.
 *
 * Existe para o link de teste. Um navegador sem permissão de localização, ou
 * uma aba aberta num notebook sem GPS, deixaria o fluxo inteiro sem ter o que
 * mostrar, e "não consegui ler sua localização" é a resposta certa numa
 * emergência de verdade e a resposta inútil numa demonstração. Toda tela que
 * usa este ponto diz na cara que ele é de demonstração.
 */
export const DEMO_POSITION: SafetyFix = {
  lat: -23.5505,
  lon: -46.6333,
  accuracy: 30,
  demo: true,
};

/** Depois disto, o ponto de demonstração vale mais que continuar esperando. */
const FIX_TIMEOUT_MS = 6000;

export interface FixOptions {
  /**
   * Se pode abrir o pedido de permissão do sistema.
   *
   * Verdadeiro no disparo do SOS, onde a pessoa acabou de segurar um botão por
   * três segundos e a caixa do sistema é esperada. FALSO na publicação de
   * presença da rede, que roda sozinha a cada minuto e meio: uma caixa de
   * permissão que aparece do nada, sem ninguém ter tocado em nada, é o jeito
   * mais rápido de gastar a única chance de pedir: a caixa do sistema não
   * volta a aparecer depois de um "não permitir".
   */
  prompt?: boolean;
}

/**
 * Pede a posição, com prazo.
 *
 * `Promise.race` com um temporizador porque `getCurrentPositionAsync` pode
 * demorar bem mais que isso num primeiro fix, e aqui não existe "esperar mais
 * um pouco": ou sai um ponto, ou sai o de demonstração com o aviso na tela.
 */
export async function currentFix({ prompt = true }: FixOptions = {}): Promise<SafetyFix> {
  try {
    const permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted) {
      if (!prompt) return DEMO_POSITION;
      const asked = await Location.requestForegroundPermissionsAsync();
      if (!asked.granted) return DEMO_POSITION;
    }

    const reading = await Promise.race([
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), FIX_TIMEOUT_MS)),
    ]);

    if (!reading) return DEMO_POSITION;

    return {
      lat: reading.coords.latitude,
      lon: reading.coords.longitude,
      accuracy:
        reading.coords.accuracy === null || reading.coords.accuracy === undefined
          ? null
          : Math.round(reading.coords.accuracy),
      demo: false,
    };
  } catch {
    // O shim web do expo-location estoura em navegadores sem a Permissions API
    // (Safari), e um erro não tratado aqui deixaria o botão de emergência
    // parado sem dizer nada.
    return DEMO_POSITION;
  }
}

/**
 * Se dá para contar com uma notificação do sistema chegando a este aparelho.
 *
 * Mesma pergunta que o `locationService` já responde para a jornada, e a
 * resposta é a mesma: no navegador, não. A tela usa isto para avisar antes, em
 * vez de a pessoa descobrir que não recebeu nada.
 */
export const canReceiveWhileClosed = locationService.supportsBackground;
