import { LoginForm } from '@/components/forms';

export default async function Login({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  return (
    <main className="main" style={{ maxWidth: 380, paddingTop: '16vh' }}>
      <div className="card stack">
        <div className="brand"><span className="brand-dot" />Trade Journal</div>
        {denied && <div className="toast err">This account isn’t allowed to use this journal.</div>}
        <LoginForm />
      </div>
    </main>
  );
}
