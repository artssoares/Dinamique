'use client';

import { useEffect } from 'react';
import { withBasePath } from '@/lib/base-path';

/**
 * Tela de falha do painel. Mostra o que houve, oferece uma saída, e manda a
 * falha para a central de erros — a mesma lista onde chegam as do aplicativo,
 * para não existirem dois lugares onde olhar.
 */
export default function PanelError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // `withBasePath` e não '/relatar-erro': o fetch sai literal, e a raiz do
    // domínio não é servida pelo painel.
    void fetch(withBasePath('/relatar-erro'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: error.message || 'Falha sem mensagem no painel',
        detail: error.stack ?? null,
        screen: typeof window === 'undefined' ? null : window.location.pathname,
      }),
    }).catch(() => undefined);
  }, [error]);

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: 24 }}>
      <div className="card" style={{ maxWidth: 520, display: 'grid', gap: 12 }}>
        <h1 style={{ fontSize: 20, margin: 0 }}>Esta tela do painel falhou</h1>
        <p className="small muted" style={{ margin: 0 }}>
          Já registramos o problema em <strong>Erros</strong>, com o detalhe técnico e o prompt
          pronto para investigar.
        </p>
        <p className="small mono muted" style={{ margin: 0, wordBreak: 'break-word' }}>
          {error.message}
        </p>
        <button type="button" className="button" onClick={reset}>
          Tentar de novo
        </button>
      </div>
    </main>
  );
}
