/**
 * Envio de Push Notifications via Expo (§59).
 *
 * Roda como Edge Function porque precisa da service role para ler tokens de
 * vários usuários – algo que o aplicativo nunca pode fazer.
 *
 * ATENÇÃO: esta função ainda NÃO foi testada contra a API real da Expo, porque
 * isso exige um projeto Expo com credenciais. A lógica de seleção de
 * destinatários e o respeito às preferências estão cobertos pelos testes de
 * banco; a chamada HTTP em si é o trecho não verificado.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** A Expo aceita no máximo 100 mensagens por requisição. */
const BATCH_SIZE = 100;

interface PushRequest {
  /** Notificações já criadas em user_notifications que devem virar push. */
  notificationIds: string[];
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  sound: 'default';
}

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { notificationIds } = (await request.json()) as PushRequest;
  if (!Array.isArray(notificationIds) || notificationIds.length === 0) {
    return Response.json({ sent: 0 });
  }

  // Só vira push quem tem token E não desativou push para aquela categoria.
  const { data, error } = await supabase
    .from('user_notifications')
    .select(
      'id, user_id, category, title, body, deep_link, ' +
        'user_preferences!inner(push_token, push_enabled), ' +
        'notification_preferences(push, category)',
    )
    .in('id', notificationIds);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const messages: ExpoMessage[] = [];

  for (const row of (data ?? []) as Record<string, any>[]) {
    const prefs = row.user_preferences;
    if (!prefs?.push_enabled || !prefs.push_token) continue;

    const perCategory = (row.notification_preferences ?? []).find(
      (p: { category: string }) => p.category === row.category,
    );
    // Sem linha de preferência, o padrão é receber.
    if (perCategory && perCategory.push === false) continue;

    messages.push({
      to: prefs.push_token,
      title: row.title,
      body: row.body,
      data: { notificationId: row.id, deepLink: row.deep_link },
      sound: 'default',
    });
  }

  let sent = 0;
  const failures: string[] = [];

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
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
  }

  return Response.json({ sent, requested: messages.length, failures });
});
