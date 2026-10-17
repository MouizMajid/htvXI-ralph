// TODO(Tier 1 #6): sorted queue (alerts → level → score → wait), live via Socket.IO.
export function Queue() {
  return (
    <main className="min-h-full bg-staff-bg p-6">
      <h1 className="text-2xl font-bold">Waiting room</h1>
      <p className="text-sm text-ink-muted">Suggested levels — nurse to confirm.</p>
    </main>
  );
}
