'use client';

import { useState } from 'react';

/**
 * Copia um texto longo para a área de transferência.
 *
 * O prompt de avaliação tem quarenta linhas: selecionar à mão num celular é
 * exatamente o atrito que faria ninguém usar. O `textarea` de reserva existe
 * porque `navigator.clipboard` não funciona fora de HTTPS nem em alguns
 * navegadores embutidos, e aí a mensagem tem de dizer o que fazer em vez de
 * só falhar.
 */
export function CopyButton({ text, label = 'Copiar prompt' }: { text: string; label?: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState('copied');
      setTimeout(() => setState('idle'), 2500);
    } catch {
      setState('failed');
    }
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <button type="button" className="button" onClick={copy}>
          {state === 'copied' ? 'Copiado ✓' : label}
        </button>
        {state === 'copied' ? (
          <span className="small muted">Agora cole numa conversa com o Claude.</span>
        ) : null}
        {state === 'failed' ? (
          <span className="small" style={{ color: 'var(--danger-text)' }}>
            Este navegador não deixou copiar. Selecione o texto abaixo e copie à mão.
          </span>
        ) : null}
      </div>

      {state === 'failed' ? (
        <textarea className="textarea" readOnly rows={12} value={text} />
      ) : null}
    </div>
  );
}
