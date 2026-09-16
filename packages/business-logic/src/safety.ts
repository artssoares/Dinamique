/**
 * Botão de emergência: as regras que a tela e o banco têm de contar igual.
 *
 * Os números aqui são uma CÓPIA dos do banco
 * (`packages/database/migrations/…_sos_safety_network.sql`), e a divisão de
 * trabalho é deliberada: o banco decide, esta cópia explica. A tela precisa
 * saber que o limite é de três por dia para dizer "você já usou três alertas
 * hoje" em vez de "algo deu errado"; ela não precisa, e não pode, ser a
 * dona da regra.
 *
 * Nada neste arquivo faz efeito. É formatação, contagem e texto, testável sem
 * banco, sem rede e sem GPS.
 */

/** Quanto tempo o dedo fica no botão antes de disparar. */
export const SOS_HOLD_MS = 3000;

/** A janela de arrependimento depois do disparo, em segundos. */
export const SOS_COUNTDOWN_SECONDS = 5;

/** Raio da rede de alerta, em metros. */
export const SOS_RADIUS_M = 5000;

/** Quanto tempo um alerta fica ativo, e compartilhando localização. */
export const SOS_ALERT_TTL_MINUTES = 30;

/** Antiabuso, espelhado do banco. */
export const SOS_MIN_INTERVAL_MINUTES = 10;
export const SOS_DAILY_LIMIT = 3;

/** Contatos de emergência que cabem na lista. O banco garante o limite. */
export const MAX_EMERGENCY_CONTACTS = 3;

/** Polícia. Não é configurável: é o número que a tela promete discar. */
export const EMERGENCY_NUMBER = '190';

/**
 * A orientação que acompanha todo alerta recebido, palavra por palavra.
 *
 * É texto fixo de propósito. Um alerta que chega sem ela, ou com uma versão
 * "mais simpática", é um convite a dirigir até o lugar de onde alguém está
 * pedindo socorro, e é exatamente o que esta funcionalidade não pode fazer.
 */
export const SOS_GUIDANCE = 'Não se aproxime. Ligue 190 e informe a localização.';

/**
 * As três primeiras letras da placa, e nada mais.
 *
 * Aceita a placa como a pessoa digitou (com hífen, com espaço, em minúsculas)
 * e devolve só o prefixo. O resto não é guardado em lugar nenhum: quem recebe o
 * alerta precisa reconhecer o carro, não identificar o dono.
 */
export function platePrefix(input: string | null | undefined): string | null {
  if (!input) return null;
  const letters = input.toUpperCase().replace(/[^A-Z]/g, '');
  return letters.length >= 3 ? letters.slice(0, 3) : null;
}

/**
 * Telefone como o discador entende: dígitos, com o `+` do país se vier.
 *
 * Frouxo de propósito. Recusar o número de um familiar por formato, numa tela
 * que existe para ser usada com a mão tremendo, é pior do que aceitar um
 * número que o discador vai resolver.
 */
export function sanitisePhone(input: string): string {
  const trimmed = input.trim();
  const plus = trimmed.startsWith('+') ? '+' : '';
  return plus + trimmed.replace(/\D/g, '');
}

/** Um telefone que vale a pena discar. */
export function isDiallablePhone(input: string): boolean {
  const digits = sanitisePhone(input).replace('+', '');
  return digits.length >= 10 && digits.length <= 15;
}

/** O primeiro lugar livre da lista de contatos, ou null se ela está cheia. */
export function nextContactSlot(used: number[]): number | null {
  for (let slot = 1; slot <= MAX_EMERGENCY_CONTACTS; slot += 1) {
    if (!used.includes(slot)) return slot;
  }
  return null;
}

/**
 * A distância como quem vai ler prefere: aproximada.
 *
 * Arredondada para cima em passos grossos de propósito. "1,2 km" já é mais
 * precisão do que quem recebe o alerta precisa, e precisão fina sobre a
 * posição de alguém em perigo é justamente o que não deve circular.
 */
export function formatApproxDistance(metres: number): string {
  const safe = Math.max(0, Math.round(metres));
  if (safe < 500) return 'menos de 500 m';
  if (safe < 1000) return 'cerca de 1 km';
  const km = safe / 1000;
  return `cerca de ${km.toLocaleString('pt-BR', {
    minimumFractionDigits: km < 10 ? 1 : 0,
    maximumFractionDigits: km < 10 ? 1 : 0,
  })} km`;
}

/** Segundos que faltam para um alerta expirar. Nunca negativo. */
export function alertRemainingSeconds(expiresAt: string, now: number = Date.now()): number {
  const end = Date.parse(expiresAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.round((end - now) / 1000));
}

/** "faltam 28 min": o prazo do compartilhamento, dito na tela do alerta. */
export function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'encerrando';
  const minutes = Math.ceil(seconds / 60);
  if (minutes === 1) return 'falta 1 minuto';
  return `faltam ${minutes} minutos`;
}

/**
 * Os erros que o banco devolve, traduzidos para o que a pessoa precisa fazer.
 *
 * "Algo deu errado" numa tela de emergência é pior que inútil: ela esconde que
 * o 190 continua a um toque de distância. Cada mensagem abaixo termina no que
 * ainda funciona.
 */
export type SosFailure =
  | 'sos_consent_required'
  | 'sos_rate_limited'
  | 'sos_daily_limit'
  | 'sos_invalid_position'
  | 'sos_auth_required'
  | 'sos_unknown';

export function sosFailureCode(message: string | null | undefined): SosFailure {
  const known: SosFailure[] = [
    'sos_consent_required',
    'sos_rate_limited',
    'sos_daily_limit',
    'sos_invalid_position',
    'sos_auth_required',
  ];
  const found = known.find((code) => (message ?? '').includes(code));
  return found ?? 'sos_unknown';
}

export function describeSosFailure(code: SosFailure): string {
  switch (code) {
    case 'sos_consent_required':
      return 'Ative o botão de emergência em Mais › Botão de emergência antes de usar.';
    case 'sos_rate_limited':
      return `Você disparou um alerta nos últimos ${SOS_MIN_INTERVAL_MINUTES} minutos. Ligue 190 agora mesmo. O alerta anterior continua valendo.`;
    case 'sos_daily_limit':
      return `Você já usou os ${SOS_DAILY_LIMIT} alertas de hoje. Ligue 190: é a ação mais importante, e ela não depende do aplicativo.`;
    case 'sos_invalid_position':
      return 'Não conseguimos ler sua localização. Ligue 190 e informe onde você está.';
    case 'sos_auth_required':
      return 'Sua sessão expirou. Ligue 190 e entre no aplicativo de novo depois.';
    default:
      return 'Não conseguimos disparar o alerta. Ligue 190 e informe sua localização.';
  }
}

/**
 * O que ninguém foi avisado quer dizer.
 *
 * Zero motorista no raio é uma resposta, não uma falha, e a tela tem de dizer
 * isso com clareza em vez de mostrar uma lista vazia: o 190 e os contatos
 * continuam sendo a ação principal. Na verdade, passam a ser a única.
 */
export function describeReach(notified: number): string {
  if (notified <= 0) {
    return `Nenhum motorista do Dinamique está a menos de ${SOS_RADIUS_M / 1000} km de você agora. O 190 e seus contatos de emergência são o que vale neste momento.`;
  }
  if (notified === 1) return '1 motorista por perto foi avisado.';
  return `${notified} motoristas por perto foram avisados.`;
}

/** Link de mapa que qualquer celular abre, para mandar a um contato. */
export function mapLink(lat: number, lon: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
}

/**
 * A mensagem que vai para o contato de emergência.
 *
 * Nome primeiro, porque quem recebe precisa saber de quem é o pedido antes de
 * qualquer outra coisa, e o link no fim, porque é o que se toca.
 */
export function contactShareMessage(params: {
  driverName: string | null;
  lat: number;
  lon: number;
}): string {
  const who = params.driverName?.trim() ? params.driverName.trim() : 'Um motorista';
  return [
    `${who} acionou o alerta de emergência do Dinamique.`,
    `Localização: ${mapLink(params.lat, params.lon)}`,
    `Se não conseguir contato, ligue ${EMERGENCY_NUMBER}.`,
  ].join('\n');
}
