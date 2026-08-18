'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AdminRole } from '@dinamique/types';

interface NavItem {
  href: string;
  label: string;
  roles?: AdminRole[];
  badge?: number;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

export function Sidebar({
  role,
  name,
  unansweredTickets,
}: {
  role: AdminRole;
  name: string;
  unansweredTickets: number;
}) {
  const pathname = usePathname();

  const groups: NavGroup[] = [
    {
      title: 'OPERAÇÃO',
      items: [
        { href: '/', label: 'Dashboard' },
        {
          href: '/suporte',
          label: 'Suporte',
          roles: ['superadmin', 'admin', 'support'],
          badge: unansweredTickets,
        },
        { href: '/usuarios', label: 'Usuários' },
        { href: '/notificacoes', label: 'Notificações', roles: ['superadmin', 'admin'] },
      ],
    },
    {
      title: 'CRESCIMENTO',
      items: [
        { href: '/influencers', label: 'Influencers', roles: ['superadmin', 'admin'] },
        { href: '/indicacoes', label: 'Indicações' },
        { href: '/codigos', label: 'Códigos e Campanhas', roles: ['superadmin', 'admin'] },
      ],
    },
    {
      title: 'INTELIGÊNCIA',
      items: [
        { href: '/analytics', label: 'Analytics', roles: ['superadmin', 'admin', 'analyst'] },
        { href: '/relatorios', label: 'Relatórios', roles: ['superadmin', 'admin', 'analyst'] },
      ],
    },
    {
      title: 'SISTEMA',
      items: [
        { href: '/catalogos', label: 'Catálogos', roles: ['superadmin', 'admin', 'content'] },
        { href: '/logs', label: 'Audit Log', roles: ['superadmin', 'admin'] },
      ],
    },
  ];

  return (
    <aside className="sidebar">
      <div>
        {/* The logo file is not in the repository yet — see assets/brand/README.md. */}
        <strong style={{ fontSize: 18, letterSpacing: '-0.02em' }}>dinamique.</strong>
        <div className="small muted">Admin</div>
      </div>

      <nav className="nav">
        {groups.map((group) => {
          const visible = group.items.filter((item) => !item.roles || item.roles.includes(role));
          if (visible.length === 0) return null;

          return (
            <div key={group.title}>
              <div className="nav-group-title">{group.title}</div>
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="nav-item"
                  aria-current={
                    item.href === '/' ? (pathname === '/' ? 'page' : undefined)
                      : pathname.startsWith(item.href) ? 'page' : undefined
                  }
                >
                  <span>{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="count-badge">{item.badge}</span>
                  ) : null}
                </Link>
              ))}
            </div>
          );
        })}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <div className="small">{name}</div>
        <div className="small muted">{role}</div>
      </div>
    </aside>
  );
}
