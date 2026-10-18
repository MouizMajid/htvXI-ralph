// Nurse dashboard (Joyce's layout) on real Tiger data. No AI here and no levels or scores:
// the nurse sees what the child said, what the parent added, check-ins, and plain-language
// alerts. Queue order comes from the API: open alerts first, then who arrived first.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StaffQueueItem } from '@ralph/shared';
import i18n from '../i18n';
import { ApiError, staffApi, type StaffAction } from '../lib/api';
import { LIVE_POLL_MS } from './live';
import {
  ALERT_KIND,
  COMPLAINT_LABEL,
  FEELING_LABEL,
  LANGUAGE_LABEL,
  answersAtAGlance,
  conversation,
  minutesSince,
  newAlertIds,
  parentDetails,
  rowStripe,
  timeOf,
} from './dashboard-data';

/** Staff text is always English, whatever language the child used. */
const tEn = i18n.getFixedT('en');

type Filter = 'all' | 'alerts' | 'waiting' | 'in_room';
const FILTERS: { id: Filter; label: string; match: (v: StaffQueueItem) => boolean }[] = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'alerts', label: 'Alerts', match: (v) => v.open_alerts > 0 },
  { id: 'waiting', label: 'Waiting', match: (v) => v.status === 'waiting' },
  { id: 'in_room', label: 'In room', match: (v) => v.status === 'in_room' },
];

/** Alerts raised since the last poll get a highlight for this long. */
const NEW_ALERT_HIGHLIGHT_MS = 15_000;

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Remembers which alert ids we've seen; returns the ones raised in the last few seconds. */
function useNewAlerts(queue: StaffQueueItem[] | undefined) {
  const seen = useRef<Set<number> | null>(null);
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!queue) return;
    if (seen.current === null) {
      // First load: everything already on screen is "seen", nothing flashes.
      seen.current = new Set(queue.flatMap((v) => v.alerts.map((a) => a.id)));
      return;
    }
    const added = newAlertIds(queue, seen.current);
    if (!added.length) return;
    added.forEach((id) => seen.current!.add(id));
    setFresh((prev) => new Set([...prev, ...added]));
    const timer = setTimeout(
      () => setFresh((prev) => new Set([...prev].filter((id) => !added.includes(id)))),
      NEW_ALERT_HIGHLIGHT_MS,
    );
    return () => clearTimeout(timer);
  }, [queue]);
  return fresh;
}

export function Dashboard() {
  const params = useParams();
  const navigate = useNavigate();
  const now = useNow(1000);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  const queryClient = useQueryClient();
  const me = useQuery({ queryKey: ['staff-me'], queryFn: staffApi.me, retry: false, staleTime: 60_000 });
  const queueQuery = useQuery({
    queryKey: ['staff-queue'],
    queryFn: staffApi.queue,
    refetchInterval: LIVE_POLL_MS,
  });

  // Session ran out mid-shift → re-check who's signed in (RequireStaff then sends them to sign in).
  useEffect(() => {
    if (queueQuery.error instanceof ApiError && queueQuery.error.status === 401) {
      void queryClient.invalidateQueries({ queryKey: ['staff-me'] });
    }
  }, [queueQuery.error, queryClient]);

  const logOut = async () => {
    try {
      await staffApi.logout();
    } finally {
      queryClient.clear();
      navigate('/staff/login', { replace: true });
    }
  };
  const queue = queueQuery.data?.visits;
  const freshAlerts = useNewAlerts(queue);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = FILTERS.find((f) => f.id === filter)!.match;
    return (queue ?? []).filter(
      (v) =>
        match(v) &&
        (!q ||
          `${v.first_name} ${v.complaint_words_en ?? ''} ${COMPLAINT_LABEL[v.chief_complaint ?? ''] ?? ''} ${v.alerts
            .map((a) => a.reason)
            .join(' ')}`
            .toLowerCase()
            .includes(q)),
    );
  }, [queue, filter, search]);

  const selectedId = params.id ?? visible[0]?.id ?? null;
  const select = (id: string) => navigate(`/staff/visit/${id}`);

  const waiting = (queue ?? []).filter((v) => v.status === 'waiting');
  const withAlerts = (queue ?? []).filter((v) => v.open_alerts > 0).length;
  const avgWait = waiting.length
    ? Math.round(waiting.reduce((s, v) => s + minutesSince(v.arrived_at, now), 0) / waiting.length)
    : 0;
  const secs = queueQuery.dataUpdatedAt ? Math.round((now - queueQuery.dataUpdatedAt) / 1000) : null;

  return (
    <main className="staff-portal staff-dashboard min-h-full bg-transparent px-4 py-6 text-ink sm:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Waiting Room</h1>
          <p className="text-sm text-ink-muted">Children with open alerts first, then by arrival. The nurse triages.</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {me.data && (
            <p className="flex items-center gap-2 text-sm">
              <span>
                Signed in as <strong>{me.data.staff.name}</strong>
              </span>
              <button
                type="button"
                onClick={() => void logOut()}
                className="rounded-md border border-staff-line px-2 py-0.5 text-xs font-semibold hover:bg-surface"
              >
                Log out
              </button>
            </p>
          )}
          <p className="text-xs text-ink-muted" aria-live="polite">
            {queueQuery.isError
            ? 'Can’t reach the server — showing the last update'
            : secs === null
              ? 'Loading…'
              : secs < 5
                ? 'Updated just now'
                : `Updated ${secs}s ago`}
          </p>
        </div>
      </header>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-2 grid grid-cols-3 gap-2">
            <Stat value={waiting.length} label="Waiting" />
            <Stat value={withAlerts} label="With alerts" tone={withAlerts ? 'text-danger' : undefined} />
            <Stat value={`${avgWait} min`} label="Average wait" />
          </div>

          <section className="rounded-xl border border-staff-line bg-surface">
            <div className="space-y-2 border-b border-staff-line p-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, words, or alert"
                className="w-full rounded-lg border border-staff-line bg-surface px-3 py-2 text-sm focus:border-secondary focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {FILTERS.map((f) => {
                  const count = (queue ?? []).filter(f.match).length;
                  const active = filter === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setFilter(f.id)}
                      className={`rounded-lg border px-3 py-1 text-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                        active ? 'border-secondary bg-staff-select' : 'border-staff-line text-ink-muted hover:bg-staff-bg'
                      }`}
                    >
                      {f.label} {count}
                    </button>
                  );
                })}
              </div>
            </div>

            {queue === undefined ? (
              <p className="p-8 text-center text-sm text-ink-muted">Loading the waiting room…</p>
            ) : visible.length === 0 ? (
              <p className="p-8 text-center text-sm text-ink-muted">
                {queue.length === 0 ? 'The waiting room is clear.' : 'No children match. Clear the search or filter.'}
              </p>
            ) : (
              <ul className="p-1.5">
                {visible.map((v) => {
                  const isSel = selectedId === v.id;
                  const isNew = v.alerts.some((a) => freshAlerts.has(a.id));
                  const openAlerts = v.alerts.filter((a) => !a.acknowledged);
                  return (
                    <li key={v.id}>
                      <button
                        type="button"
                        onClick={() => select(v.id)}
                        aria-current={isSel}
                        className={`grid w-full grid-cols-[4px_minmax(0,1fr)_auto] gap-3 rounded-lg p-3 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary ${
                          isSel ? 'bg-staff-select' : 'hover:bg-staff-bg'
                        } ${isNew ? 'animate-pulse ring-2 ring-danger' : ''}`}
                      >
                        <span className={`rounded ${rowStripe(v)}`} />
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            {v.first_name}, {v.age_years}
                            {v.language !== 'en' && (
                              <span className="ml-1.5 text-xs font-normal text-ink-muted">· {LANGUAGE_LABEL[v.language]}</span>
                            )}
                          </span>
                          <span className="block truncate text-xs text-ink-muted">
                            {v.complaint_words_en
                              ? `“${v.complaint_words_en}”`
                              : (COMPLAINT_LABEL[v.chief_complaint ?? ''] ?? 'Checking in…')}
                          </span>
                          {openAlerts.length > 0 && (
                            <span className="mt-1 flex flex-wrap gap-1">
                              {openAlerts.slice(0, 2).map((a) => (
                                <span key={a.id} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ALERT_KIND[a.kind].chip}`}>
                                  {a.kind === 'safeguarding' ? 'Safeguarding' : a.reason}
                                </span>
                              ))}
                              {openAlerts.length > 2 && (
                                <span className="text-[11px] text-ink-muted">+{openAlerts.length - 2} more</span>
                              )}
                            </span>
                          )}
                        </span>
                        <span className="text-right">
                          {v.status === 'in_room' && (
                            <span className="mb-0.5 inline-block rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">
                              In room
                            </span>
                          )}
                          <span className="block text-sm font-semibold tabular-nums">{minutesSince(v.arrived_at, now)} min</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="min-h-[420px] min-w-0 rounded-xl border border-staff-line bg-surface p-4 sm:p-6">
          {selectedId ? (
            <Detail visitId={selectedId} now={now} />
          ) : (
            <p className="py-24 text-center text-sm text-ink-muted">Select a child to see their details.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ value, label, tone }: { value: string | number; label: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-staff-line bg-surface px-4 py-3">
      <p className={`text-xl font-semibold tabular-nums ${tone ?? ''}`}>{value}</p>
      <p className="text-xs text-ink-muted">{label}</p>
    </div>
  );
}

function Detail({ visitId, now }: { visitId: string; now: number }) {
  const queryClient = useQueryClient();
  const { data, isError } = useQuery({
    queryKey: ['staff-visit', visitId],
    queryFn: () => staffApi.visit(visitId),
    refetchInterval: LIVE_POLL_MS,
  });
  const act = useMutation({
    mutationFn: (body: StaffAction) => staffApi.action(visitId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['staff-visit', visitId] });
      void queryClient.invalidateQueries({ queryKey: ['staff-queue'] });
    },
  });

  if (isError && !data) return <p className="py-24 text-center text-sm text-danger">Couldn’t load this child. Try again in a moment.</p>;
  if (!data) return <p className="py-24 text-center text-sm text-ink-muted">Loading…</p>;

  const { visit, checkins, alerts } = data;
  const glance = answersAtAGlance(tEn, data);
  const parent = parentDetails(visit.parent_answers);
  const convo = conversation(tEn, data);
  const sortedAlerts = [...alerts].sort((a, b) => Number(Boolean(a.acknowledged_at)) - Number(Boolean(b.acknowledged_at)));

  return (
    <div className="flex flex-col gap-6">
      {/* Who, and what to do next */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl leading-tight font-bold">{visit.first_name}</h2>
          <p className="text-sm text-ink-muted">
            Age {visit.age_years} · {LANGUAGE_LABEL[visit.language]} · {COMPLAINT_LABEL[visit.chief_complaint ?? ''] ?? 'Complaint not chosen yet'}
          </p>
          {visit.parent_mode && (
            <p className="mt-1 inline-block rounded-full bg-staff-bg px-2 py-0.5 text-xs text-ink-muted">
              Parent mode — a parent answered for this child
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-sm text-ink-muted">
            {visit.status === 'waiting'
              ? `Waiting ${minutesSince(visit.arrived_at, now)} min`
              : visit.status === 'in_room'
                ? `In room since ${visit.called_in_at ? timeOf(visit.called_in_at) : '—'}`
                : 'Done'}
          </p>
          {visit.status === 'waiting' && (
            <button
              type="button"
              disabled={act.isPending}
              onClick={() => act.mutate({ action: 'call_in' })}
              className="rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-on-secondary disabled:opacity-50"
            >
              Call in
            </button>
          )}
          {visit.status === 'in_room' && (
            <button
              type="button"
              disabled={act.isPending}
              onClick={() => act.mutate({ action: 'done' })}
              className="rounded-lg border border-staff-line px-4 py-2 text-sm font-semibold disabled:opacity-50"
            >
              Mark done
            </button>
          )}
          {act.isError && <p className="text-xs text-danger">That didn’t go through — try again.</p>}
        </div>
      </div>

      {/* Alerts: plain-language reasons, never a level */}
      {sortedAlerts.length > 0 && (
        <section aria-labelledby="alerts-h" className="flex flex-col gap-2">
          <h3 id="alerts-h" className="text-sm font-semibold text-ink-muted">
            Alerts
          </h3>
          {sortedAlerts.map((a) => {
            const k = ALERT_KIND[a.kind];
            const acked = Boolean(a.acknowledged_at);
            return (
              <div
                key={a.id}
                role={acked ? undefined : 'alert'}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm ${acked ? 'bg-staff-bg text-ink-muted' : k.chip}`}
              >
                <span className="min-w-0">
                  <span className="font-semibold">{k.label}:</span> {a.reason}
                  <span className="ml-2 text-xs opacity-80">{timeOf(a.at)}</span>
                </span>
                {acked ? (
                  <span className="text-xs">Acknowledged</span>
                ) : (
                  <button
                    type="button"
                    disabled={act.isPending}
                    onClick={() => act.mutate({ action: 'acknowledge_flag', flag_id: a.id })}
                    className="rounded-md border border-current px-2 py-0.5 text-xs font-semibold disabled:opacity-50"
                  >
                    Acknowledge
                  </button>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* Answers at a glance */}
      <section aria-labelledby="glance-h">
        <h3 id="glance-h" className="text-sm font-semibold text-ink-muted">
          What {visit.first_name} told Ralph
        </h3>
        {glance.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No answers yet.</p>
        ) : (
          <dl className="mt-2 divide-y divide-staff-line rounded-lg border border-staff-line">
            {glance.map((row) => (
              <div key={row.question} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-4">
                <dt className="text-ink-muted">{row.question}</dt>
                <dd className="font-semibold">
                  {row.answer}
                  {row.editedByParent && <span className="ml-2 text-xs font-normal text-secondary">corrected by parent</span>}
                  {row.original && <span className="block text-xs font-normal text-ink-muted">Original: {row.original}</span>}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Parent's details */}
      <section aria-labelledby="parent-h">
        <h3 id="parent-h" className="text-sm font-semibold text-ink-muted">
          From the parent
        </h3>
        {visit.parent_confirmed_at === null ? (
          <p className="mt-2 text-sm text-ink-muted">The parent hasn’t confirmed yet.</p>
        ) : parent.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Confirmed the answers; nothing extra added.</p>
        ) : (
          <dl className="mt-2 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_minmax(0,1fr)]">
            {parent.map((p) => (
              <div key={p.label} className="contents">
                <dt className="text-ink-muted">{p.label}</dt>
                <dd>{p.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {/* Check-ins while waiting */}
      <section aria-labelledby="checkins-h">
        <h3 id="checkins-h" className="text-sm font-semibold text-ink-muted">
          Check-ins while waiting
        </h3>
        {checkins.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">No check-ins yet.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-1.5">
            {checkins.map((c, i) => {
              const f = FEELING_LABEL[c.feeling] ?? FEELING_LABEL.same!;
              return (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-16 shrink-0 text-ink-muted tabular-nums">{timeOf(c.at)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${f.chip}`}>{f.label}</span>
                  {c.pain_face !== null && c.pain_face !== undefined && (
                    <span className="text-ink-muted">Face {c.pain_face}/5</span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {/* Everything that was said, in order */}
      <section aria-labelledby="convo-h">
        <h3 id="convo-h" className="text-sm font-semibold text-ink-muted">
          Conversation
        </h3>
        {convo.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">Nothing yet.</p>
        ) : (
          <ol className="mt-2 flex flex-col gap-2 text-sm">
            {convo.map((item, i) => (
              <li key={i} className="grid grid-cols-[4rem_minmax(0,1fr)] gap-2">
                <span className="text-ink-muted tabular-nums">{timeOf(item.at)}</span>
                {item.kind === 'answer' ? (
                  <span className="min-w-0">
                    <span className="text-ink-muted">Ralph: {item.question}</span>
                    <span className="block font-semibold">
                      {item.by === 'parent' ? 'Parent' : visit.first_name}: {item.answer}
                    </span>
                    {item.original && <span className="block text-xs text-ink-muted">Original: {item.original}</span>}
                  </span>
                ) : (
                  <span className="min-w-0">
                    <span className="mr-1 rounded bg-staff-bg px-1.5 text-[11px] text-ink-muted">Chat while waiting</span>
                    <span className={item.by === 'ralph' ? 'text-ink-muted' : 'font-semibold'}>
                      {item.by === 'ralph' ? 'Ralph' : visit.first_name}: {item.text}
                    </span>
                    {item.original && <span className="block text-xs text-ink-muted">Original: {item.original}</span>}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
