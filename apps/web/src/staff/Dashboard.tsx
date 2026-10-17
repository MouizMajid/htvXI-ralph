import { useEffect, useMemo, useState } from "react";

type Status = 1 | 2 | 3;

interface Patient {
  id: string;
  name: string;
  age: number;
  status: Status;
  score: number; // higher = sicker
  waitMin: number;
  flags: string[];
  summary: string;
  symptoms: string[];
  allergies: string[];
  medications: string[];
}

const LEVELS: Record<
  Status,
  { label: string; sidebar: string; badge: string }
> = {
  1: {
    label: "Critical",
    sidebar: "bg-red-500",
    badge: "bg-red-50 text-red-700",
  },
  2: {
    label: "Urgent",
    sidebar: "bg-amber-500",
    badge: "bg-amber-50 text-amber-700",
  },
  3: {
    label: "Standard",
    sidebar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700",
  },
};

// TODO sorting of the queue
export function sortQueue(queue: Patient[]): Patient[] {
  return queue;
}

interface ApiQueueRow {
  id: string;
  first_name: string;
  age_years: number;
  arrived_at: string;
  status: 'waiting' | 'in_room' | 'done';
  chief_complaint: string | null;
  complaint_words_en: string | null;
  open_alerts: number;
  alerts: { id: number; kind: string; reason: string; acknowledged: boolean }[];
}

function mapApiVisitToPatient(v: ApiQueueRow): Patient {
  const waitMin = Math.max(0, Math.round((Date.now() - new Date(v.arrived_at).getTime()) / 60_000));
  const unacked = v.alerts.filter((a) => !a.acknowledged);
  const hasRedOrSafeguarding = unacked.some((a) => a.kind === 'red_flag' || a.kind === 'safeguarding');
  const status: Status = hasRedOrSafeguarding ? 1 : unacked.length > 0 ? 2 : 3;
  const symptoms = [
    v.chief_complaint ? `Chief complaint: ${v.chief_complaint}` : null,
    v.complaint_words_en ? `"${v.complaint_words_en}"` : null,
  ].filter((x): x is string => Boolean(x));

  return {
    id: v.id,
    name: v.first_name,
    age: v.age_years,
    status,
    score: hasRedOrSafeguarding ? 90 : unacked.length > 0 ? 70 : 35,
    waitMin,
    flags: unacked.map((a) => a.reason),
    summary: v.complaint_words_en
      ? `Child reported: "${v.complaint_words_en}". Status: ${v.status}.`
      : `Checked in at kiosk (${v.chief_complaint ?? 'triage in progress'}).`,
    symptoms: symptoms.length ? symptoms : ['Triage in progress'],
    allergies: ['See parent confirmation'],
    medications: ['See parent confirmation'],
  };
}

function useQueue() {
  const [patients, setPatients] = useState<Patient[]>(MOCK);
  const [updatedAt, setUpdatedAt] = useState(Date.now());

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch('/api/staff/queue');
        if (!res.ok) return;
        const data = (await res.json()) as { visits?: ApiQueueRow[] };
        if (!active || !Array.isArray(data.visits)) return;
        const live = data.visits.map(mapApiVisitToPatient);
        const liveIds = new Set(live.map((p) => p.id));
        setPatients([...live, ...MOCK.filter((m) => !liveIds.has(m.id))]);
        setUpdatedAt(Date.now());
      } catch {
        /* offline / mock fallback */
      }
    };
    void poll();
    const t = setInterval(() => void poll(), 4_000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, []);

  return { patients, updatedAt };
}

function useSecondsSince(ts: number) {
  const [s, setS] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setS(Math.round((Date.now() - ts) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [ts]);
  return s;
}

export function Dashboard() {
  const { patients, updatedAt } = useQueue();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [search, setSearch] = useState("");
  const secs = useSecondsSince(updatedAt);

  const sorted = useMemo(() => sortQueue(patients), [patients]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sorted.filter(
      (p) =>
        (filter === "all" || p.status === filter) &&
        (!q || `${p.name} ${p.symptoms.join(" ")}`.toLowerCase().includes(q)),
    );
  }, [sorted, filter, search]);

  const selected = sorted.find((p) => p.id === selectedId) ?? sorted[0] ?? null;

  const avgWait = patients.length
    ? Math.round(patients.reduce((s, p) => s + p.waitMin, 0) / patients.length)
    : 0;

  return (
    <main className="min-h-full bg-white p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Waiting Room</h1>
        </div>
        <p className="flex items-center gap-2 text-xs text-gray-500">
          {secs < 5 ? "Updated just now" : `Updated ${secs}s ago`}
        </p>
      </header>

      <div className="mt-5 grid grid-cols-1 items-start gap-4 lg:grid-cols-[380px_1fr]">
        <div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-gray-200 px-4 py-3">
              <p className={"text-xl font-semibold"}>{patients.length}</p>
              <p className="text-xs text-gray-500">Waiting</p>
            </div>
            <div className="rounded-xl border border-gray-200 px-4 py-3">
              <p className={"text-xl font-semibold"}>{avgWait} min</p>
              <p className="text-xs text-gray-500">Average Wait</p>
            </div>
          </div>

          <section className="rounded-xl border border-gray-200">
            <div className="space-y-2 border-b border-gray-200 p-3">
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or symptom"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5">
                {(["all", 1, 2, 3] as const).map((f) => {
                  const count =
                    f === "all"
                      ? patients.length
                      : patients.filter((p) => p.status === f).length;
                  const active = filter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`rounded-lg border px-3 py-1 text-xs focus:outline-none ${
                        active
                          ? "border-gray-400 bg-blue-50"
                          : "border-gray-200 text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      {f === "all" ? "All" : LEVELS[f].label} {count}
                    </button>
                  );
                })}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="p-8 text-center text-sm text-gray-500">
                {patients.length === 0
                  ? "The waiting room is clear."
                  : "No patients match. Clear the search or filter."}
              </p>
            ) : (
              <ul className="p-1.5">
                {visible.map((p) => {
                  const lv = LEVELS[p.status];
                  const isSel = selected?.id === p.id;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.id)}
                        className={`grid w-full grid-cols-[4px_1fr_auto] gap-3 rounded-lg p-3 text-left focus:outline-none ${
                          isSel ? "bg-blue-50" : "hover:bg-gray-50"
                        }`}
                      >
                        <span className={`rounded ${lv.sidebar}`} />
                        <span className="min-w-0">
                          <span className="block font-semibold">
                            {p.name}, {p.age}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {p.symptoms.join(", ")}
                          </span>
                        </span>
                        <span className="text-right">
                          <span
                            className={`mb-0.5 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${lv.badge}`}
                          >
                            {lv.label}
                          </span>
                          <span
                            className={`block text-sm font-semibold tabular-nums`}
                          >
                            {p.waitMin} min
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <section className="min-h-[420px] rounded-xl border border-gray-200 p-6">
          {selected ? (
            <Detail patient={selected} />
          ) : (
            <p className="py-24 text-center text-sm text-gray-500">
              Select a patient to see details.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}

function Detail({ patient: p }: { patient: Patient }) {
  const lv = LEVELS[p.status];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold leading-tight">{p.name}</h2>
          <p className="text-sm text-gray-500">Age {p.age}</p>
        </div>

        <div className="flex flex-col items-end gap-1">
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${lv.badge}`}
          >
            {lv.label}
          </span>
          <p className="text-sm text-gray-500">Waiting {p.waitMin} min</p>
        </div>
      </div>

      {p.flags.length > 0 && (
        <div
          className="mt-4 flex flex-wrap items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          role="alert"
        >
          <span className="font-semibold">Red Flags:</span>
          <span>{p.flags.join(", ")}</span>
        </div>
        // add reasoning for why flagged?
      )}

      <h3 className="mt-6 text-sm font-semibold text-gray-500">Summary</h3>
      <p className="mt-2 text-sm">{p.summary}</p>

      <h3 className="mt-6 text-sm font-semibold text-gray-500">Symptoms</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {p.symptoms.map((s) => (
          <span
            key={s}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1 text-sm"
          >
            {s}
          </span>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-semibold text-gray-500">Allergies</h3>
      <p className="mt-2 text-sm">{p.allergies}</p>

      <h3 className="mt-6 text-sm font-semibold text-gray-500">Medications</h3>
      <p className="mt-2 text-sm">{p.medications}</p>

      {/* Feature to allow manual reordering of queue? */}
    </div>
  );
}

// Mock data for current testing
const MOCK: Patient[] = [
  {
    id: "1",
    name: "John Smith",
    age: 6,
    status: 2,
    score: 82,
    waitMin: 15,
    flags: [],
    summary: "",
    symptoms: ["Sore throat", "Coughing", "Mild fever"],
    allergies: ["Peanuts"],
    medications: ["None"],
  },
  {
    id: "2",
    name: "Jill Smith",
    age: 9,
    status: 2,
    score: 61,
    waitMin: 25,
    flags: [],
    summary: "",
    symptoms: ["Sore throat", "Coughing", "Mild fever"],
    allergies: ["None"],
    medications: ["None"],
  },
  {
    id: "3",
    name: "Ava Patel",
    age: 6,
    status: 1,
    score: 55,
    waitMin: 10,
    flags: ["Fever over 102°F"],
    summary: "",
    symptoms: ["Ear pain", "Fever"],
    allergies: ["None"],
    medications: ["Acetaminophen"],
  },
  {
    id: "4",
    name: "Noah Tremblay",
    age: 11,
    status: 3,
    score: 30,
    waitMin: 41,
    flags: [],
    summary: "",
    symptoms: ["Wrist pain", "Swelling"],
    allergies: ["None"],
    medications: ["Ibuprofen"],
  },
];
