'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const db = /DATABASE_URL|ECONNREFUSED|ENOTFOUND|password authentication|getaddrinfo/i.test(error.message);
  return (
    <main className="main">
      <div className="card empty-state">
        <h2>{db ? 'Can’t reach the database' : 'Something went wrong'}</h2>
        <p className="small">{db ? 'Check DATABASE_URL in .env.local (use the Supabase “Session pooler” connection string) and restart the app.' : error.message}</p>
        <button className="btn" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
