/**
 * Disparo das notificações de um alerta de emergência.
 *
 * Roda como Edge Function porque precisa da service role para duas coisas que
 * o aplicativo nunca pode fazer: ler o token de Push de outros motoristas e ler
 * os contatos de emergência de quem pediu socorro (a tabela é fechada até para
 * o administrador, ver a migration do SOS).
 *
 * O que ela NÃO faz, de propósito: decidir quem recebe. Isso já aconteceu
 * dentro de `sos_trigger`, com o `ST_DWithin`, o consentimento e o limite
 * verificados no banco. Aqui só se entrega o que já foi decidido. Uma função
 * de entrega que pudesse escolher destinatário seria uma segunda porta para a
 * mesma decisão, e as duas divergiriam.
 *
 * ┌── O que aqui é verificado e o que não é ────────────────────────────────┐
 * │ VERIFICADO no banco (packages/database/test/rls_test.sql): quem entra   │
 * │ no raio, quem consegue ler o alerta, e os dois limites.                 │
 * │                                                                         │
 * │ NÃO VERIFICADO: as duas chamadas HTTP abaixo. O Push da Expo exige um   │
 * │ projeto Expo com credenciais, e o SMS exige um provedor contratado:     │
 * │ nenhum dos dois existe neste repositório. A entrega por Push é um canal │
 * │ ADICIONAL: o aviso dentro do aplicativo é criado pelo banco e funciona  │
 * │ sem esta função.                                                        │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * SMS: enquanto `SOS_SMS_ENDPOINT` não estiver configurado, a função responde
 * `contacts: { channel: 'manual' }` e o aplicativo mostra os contatos com um
 * toque para mandar a localização pelo próprio celular. É a diferença entre
 * "não mandamos" dito na cara do motorista e um silêncio que ele descobriria
 * no pior momento possível.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** A Expo aceita no máximo 100 mensagens por requisição. */
const BATCH_SIZE = 100;

/** Texto fixo. A mesma frase da tela, e ela nunca convida a ir ao local. */
const GUIDANCE = 'Não se aproxime. Ligue 190 e informe a localização.';

interface DispatchRequest {
  alertId: string;
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
  /** Um pedido de socorro não espera pelo agrupamento de notificações. */
  priority: 'high';
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { alertId } = (await request.json()) as DispatchRequest;
  if (typeof alertId !== 'string' || alertId.length === 0) {
    return Response.json({ error: 'alertId obrigatório' }, { status: 400 });
  }

  const { data: alert, error: alertError } = await supabase
    .from('sos_alerts')
    .select(
      'id, user_id, status, expires_at, is_demo, lat, lon, ' +
        'vehicle_label, vehicle_colour, plate_prefix',
    )
    .eq('id', alertId)
    .maybeSingle();

  if (alertError) return Response.json({ error: alertError.message }, { status: 500 });
  if (!alert) return Response.json({ error: 'alerta não encontrado' }, { status: 404 });

  // Um alerta já encerrado não acorda mais ninguém. Sem esta guarda, uma
  // chamada repetida (uma tela recarregada, uma tentativa de reenvio) mandaria
  // gente para a rua por causa de algo que acabou.
  if (alert.status !== 'active' || Date.parse(alert.expires_at) <= Date.now()) {
    return Response.json({ skipped: 'alerta não está ativo', push: 0 });
  }

  // O modo demonstração existe para alguém ver as telas funcionando no link de
  // teste. Ele não acorda ninguém, em nenhum canal.
  if (alert.is_demo) {
    return Response.json({ skipped: 'alerta de demonstração', push: 0 });
  }

  const { data: recipients, error: recipientsError } = await supabase
    .from('sos_alert_recipients')
    .select('user_id, distance_m, user_preferences!inner(push_token, push_enabled)')
    .eq('alert_id', alertId);

  if (recipientsError) {
    return Response.json({ error: recipientsError.message }, { status: 500 });
  }

  const messages: ExpoMessage[] = [];

  for (const row of (recipients ?? []) as Record<string, any>[]) {
    const prefs = row.user_preferences;
    if (!prefs?.push_enabled || !prefs.push_token) continue;

    // A preferência por categoria NÃO é consultada aqui, e isso é deliberado:
    // quem entrou na rede de alerta já disse que quer receber isto, e um pedido
    // de socorro não pode cair numa caixa silenciada meses atrás. Sair da rede
    // é a maneira de não receber, e ela já foi respeitada no banco.
    messages.push({
      to: prefs.push_token,
      title: 'Motorista pedindo socorro perto de você',
      body: GUIDANCE,
      data: { alertId, deepLink: '/sos/received' },
      sound: 'default',
      priority: 'high',
    });
  }

  let sent = 0;
  const failures: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(batch),
      });

      if (!response.ok) {
        failures.push(`lote ${i / BATCH_SIZE}: HTTP ${response.status}`);
        continue;
      }

      const result = (await response.json()) as { data?: { status: string }[] };
      sent += (result.data ?? []).filter((item) => item.status === 'ok').length;
    } catch (error) {
      // Um lote que falhou não pode derrubar os outros, e muito menos o aviso
      // aos contatos de emergência mais abaixo.
      failures.push(`lote ${i / BATCH_SIZE}: ${(error as Error).message}`);
    }
  }

  const contacts = await notifyEmergencyContacts(supabase, alert);

  return Response.json({
    push: sent,
    pushRequested: messages.length,
    recipients: (recipients ?? []).length,
    contacts,
    failures,
  });
});

/**
 * Os contatos de emergência.
 *
 * A posição sai do alerta pelas colunas geradas `lat`/`lon`, porque um link de
 * mapa é o que um familiar consegue abrir, e porque a service role é a única
 * credencial que pode ler esta tabela, fechada até para o administrador.
 */
async function notifyEmergencyContacts(
  supabase: ReturnType<typeof createClient>,
  alert: Record<string, any>,
): Promise<{ channel: 'sms' | 'manual'; sent: number; total: number }> {
  const { data: contacts } = await supabase
    .from('emergency_contacts')
    .select('name, phone')
    .eq('user_id', alert.user_id)
    .order('slot');

  const list = (contacts ?? []) as { name: string; phone: string }[];
  const endpoint = Deno.env.get('SOS_SMS_ENDPOINT');
  const token = Deno.env.get('SOS_SMS_TOKEN');

  // Sem provedor contratado, o aplicativo assume: ele mostra os contatos com um
  // toque para mandar a localização pelo SMS ou WhatsApp do próprio celular.
  if (!endpoint || !token || list.length === 0) {
    return { channel: 'manual', sent: 0, total: list.length };
  }

  if (typeof alert.lat !== 'number' || typeof alert.lon !== 'number') {
    return { channel: 'manual', sent: 0, total: list.length };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('first_name, preferred_name')
    .eq('id', alert.user_id)
    .maybeSingle();

  const who = (profile?.preferred_name as string | null) ??
    (profile?.first_name as string | null) ??
    'Um motorista';

  const body = [
    `${who} acionou o alerta de emergência do Dinamique.`,
    `Localização: https://www.google.com/maps/search/?api=1&query=${alert.lat},${alert.lon}`,
    'Se não conseguir contato, ligue 190.',
  ].join('\n');

  let sent = 0;
  for (const contact of list) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ to: contact.phone, message: body }),
      });
      if (response.ok) sent += 1;
    } catch {
      // Um contato que falhou não impede os outros dois.
    }
  }

  return { channel: 'sms', sent, total: list.length };
}
