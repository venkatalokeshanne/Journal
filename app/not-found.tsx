import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="main">
      <div className="card empty-state"><h2>Not found</h2><p>That page or trade doesn’t exist.</p><Link className="btn" href="/">Home</Link></div>
    </main>
  );
}
