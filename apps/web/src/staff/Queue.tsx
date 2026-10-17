// TODO(slice 4): queue (unacknowledged alerts first, then arrival), polled every LIVE_POLL_MS (./live.ts).
export function Queue() {
  return (
    <main className="min-h-full bg-staff-bg p-6">
      <h1 className="text-2xl font-bold">Waiting room</h1>
      <p className="text-sm text-ink-muted">Children waiting — alerts first, then by arrival.</p>
    </main>
  );
}
