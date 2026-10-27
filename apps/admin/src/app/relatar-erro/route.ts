import { NextResponse } from 'next/server';
import { getSessionClient } from '@/lib/supabase-server';

/**
 * Para onde o painel manda as próprias falhas.
 *
 * Existe porque `error.tsx` do Next roda no navegador, onde não há como chamar
 * o banco com a sessão do servidor. O corpo é tratado como texto de origem
 * desconhecida: recortado, e nada dele reaproveitado como instrução.
 *
 * Usa a sessão de quem está logado, NÃO a chave de serviço. Esta rota não tem
 * senha própria, então com a chave de serviço ela seria exatamente a porta de
 * escrita sem login que a migração fecha ao revogar `report_app_error` de
 * `anon` — qualquer um na internet encheria a tabela por aqui. Com a sessão, a
 * rota não pode nada que o próprio usuário logado já não possa.
 *
 * O custo: uma falha na tela de login do painel não é registrada. É o mesmo
 * custo já aceito no aplicativo, e é mais barato do que a porta aberta.
 */
export async function POST(request: Request) {
  try {
    const supabase = await getSessionClient();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return NextResponse.json({ ok: false }, { status: 401 });

    const body = (await request.json()) as {
      title?: unknown;
      detail?: unknown;
      screen?: unknown;
    };

    const title = typeof body.title === 'string' ? body.title.trim().slice(0, 500) : '';
    if (title === '') return NextResponse.json({ ok: false }, { status: 400 });

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
