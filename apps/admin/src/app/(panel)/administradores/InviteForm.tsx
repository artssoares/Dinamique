'use client';

import { useActionState } from 'react';
import { ADMIN_ROLES } from '@dinamique/types';
import { inviteAdmin, type AdminActionResult } from './actions';

const ROLE_LABELS: Record<string, string> = {
  superadmin: 'Superadmin — pode tudo, inclusive criar outro superadmin',
  admin: 'Admin — operação, usuários, planos e crescimento',
  support: 'Suporte — apenas a caixa de suporte',
  content: 'Conteúdo — catálogos, tour e textos',
  analyst: 'Analista — apenas relatórios e analytics',
};

/**
 * Formulário de convite. Cliente porque a resposta do servidor é a parte
 * útil: "essa pessoa ainda não tem conta" precisa aparecer no lugar onde o
 * email foi digitado, e não como uma página nova sem contexto.
 */
export function InviteForm({ canCreateSuperadmin }: { canCreateSuperadmin: boolean }) {
  const [state, action, pending] = useActionState<AdminActionResult | null, FormData>(
    inviteAdmin,
    null,
  );

  const roles = ADMIN_ROLES.filter((role) => role !== 'superadmin' || canCreateSuperadmin);

  return (
    <form action={action} className="card" style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
      <div>
        <strong>Dar acesso ao painel</strong>
        <div className="small muted">
          A pessoa precisa já ter conta no Dinamique. Ela entra com o email e a senha dela — você
          nunca precisa saber a senha de ninguém.
        </div>
      </div>

      <label htmlFor="invite-email" className="stat-label">EMAIL DA PESSOA</label>
      <input
        id="invite-email"
        className="input"
        type="email"
        name="email"
        placeholder="nome@email.com"
        required
      />

      <label htmlFor="invite-role" className="stat-label">NÍVEL DE ACESSO</label>
      <select id="invite-role" className="input" name="role" defaultValue="admin" required>
        {roles.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>

      {state ? (
        <div
          className="small"
          role="status"
          style={{ color: state.ok ? 'var(--success-text)' : 'var(--danger-text)' }}
        >
          {state.message}
        </div>
      ) : null}

      <button type="submit" className="button" disabled={pending}>
        {pending ? 'Salvando…' : 'Dar acesso'}
      </button>
    </form>
  );
}
