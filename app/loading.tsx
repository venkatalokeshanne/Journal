export default function Loading() {
  return (
    <main className="main stack" aria-busy="true">
      <div className="kpis">{Array.from({ length: 6 }, (_, i) => <div key={i} className="kpi" style={{ height: 74, opacity: 0.5 }} />)}</div>
      <div className="card" style={{ height: 240, opacity: 0.5 }} />
    </main>
  );
}
