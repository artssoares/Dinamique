import { NextResponse } from 'next/server';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * Para onde o painel manda as próprias falhas.
 *
 * Existe porque `error.tsx` do Next roda no navegador, onde a chave de serviço
 * não existe (e nunca pode existir). O corpo é tratado como texto de origem
 * desconhecida: recortado, nada dele reaproveitado como instrução, e sem
 * `user_id` – quem reporta aqui é o painel, não uma pessoa.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      title?: unknown;
      detail?: unknown;
      screen?: unknown;
    };

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 500) : '';
    if (title === '') return NextResponse.json({ ok: false }, { status: 400 });

    const supabase = getServiceClient();
    await supabase.rpc('report_app_error', {
      p_source: 'admin',
      p_title: title,
      p_detail: typeof body.detail === 'string' ? body.detail.slice(0, 8000) : null,
      p_screen: typeof body.screen === 'string' ? body.screen.slice(0, 200) : null,
      p_severity: 'error',
      p_app_version: null,
      p_platform: 'admin',
      p_context: {},
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Falhar ao registrar uma falha não vira uma segunda falha na tela.
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
