'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Entrada no painel. Quem decide o acesso é o servidor, depois — aqui só
 * autenticamos.
 *
 * Sem as variáveis configuradas, mostramos o que falta em vez de deixar o
 * clique em "Entrar" estourar no navegador. Um painel recém-publicado é
 * exatamente onde isso acontece.
 */
export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) return;

    setLoading(true);
    setError(null);

    const supabase = createBrowserClient(SUPABASE_URL!, SUPABASE_ANON_KEY!);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (signInError) {
      setError('Email ou senha incorretos.');
      return;
    }
    router.replace('/');
    router.refresh();
  }

  if (!configured) {
    return (
      <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
        <div className="card" style={{ maxWidth: 460, display: 'grid', gap: 12 }}>
          <div>
            <strong style={{ fontSize: 20, letterSpacing: '-0.02em' }}>dinamique.</strong>
            <div className="small muted">Painel administrativo</div>
          </div>

          <h1 style={{ fontSize: 18, margin: '8px 0 0' }}>Falta conectar o banco de dados</h1>
          <p className="small muted" style={{ margin: 0 }}>
            O painel está publicado, mas ainda não sabe onde ficam os dados. Nas configurações
            deste projeto na Vercel, adicione:
          </p>

          <ul className="small mono" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.9 }}>
            <li>NEXT_PUBLIC_SUPABASE_URL</li>
            <li>NEXT_PUBLIC_SUPABASE_ANON_KEY</li>
            <li>SUPABASE_SERVICE_ROLE_KEY</li>
          </ul>

          <p className="small muted" style={{ margin: 0 }}>
            Depois refaça o deploy. O passo a passo completo está em SETUP.md, no repositório.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <form onSubmit={submit} className="card" style={{ width: 360, display: 'grid', gap: 14 }}>
        <div>
          <strong style={{ fontSize: 20, letterSpacing: '-0.02em' }}>dinamique.</strong>
          <div className="small muted">Painel administrativo</div>
        </div>

        <label htmlFor="email" className="stat-label">EMAIL</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label htmlFor="password" className="stat-label">SENHA</label>
        <input
          id="password"
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        {error ? <div className="small" style={{ color: 'var(--danger-text)' }}>{error}</div> : null}

        <button type="submit" className="button" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </main>
  );
}
