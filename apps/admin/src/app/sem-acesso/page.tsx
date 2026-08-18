export default function NoAccess() {
  return (
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh', padding: 24 }}>
      <div className="card" style={{ maxWidth: 420, textAlign: 'center' }}>
        <h1 className="page-title">Sem acesso</h1>
        <p className="muted">
          Sua conta não tem permissão para este painel. Se isso parecer errado, fale com um
          superadmin do Dinamique.
        </p>
      </div>
    </main>
  );
}
