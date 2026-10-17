import { useEffect, useMemo, useState } from 'react';
import {
  staffApi,
  type PersonalizedNurseQueue,
  type PersonalizedPatient,
} from '../lib/api';
import type { NurseStatus, NurseWorkload } from '@ralph/shared';

export function Dashboard() {
  const [selectedNurseId, setSelectedNurseId] = useState<string>('nurse-sarah');
  const [nurses, setNurses] = useState<NurseWorkload[]>([]);
  const [personalQueue, setPersonalQueue] = useState<PersonalizedNurseQueue | null>(null);
  const [departmentVisits, setDepartmentVisits] = useState<PersonalizedPatient[]>([]);
  const [viewMode, setViewMode] = useState<'my_shift' | 'matchmaker' | 'all_patients'>('my_shift');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now());

  // Active nurse object
  const currentNurseWorkload = useMemo(
    () => nurses.find((n) => n.nurse.id === selectedNurseId) || nurses[0],
    [nurses, selectedNurseId],
  );
  const currentNurse = currentNurseWorkload?.nurse;

  // Poll nurses, personalized queue, and department queue every 3.5 seconds
  useEffect(() => {
    let active = true;
    const fetchStaffData = async () => {
      try {
        const [nursesRes, personalRes, deptRes] = await Promise.all([
          staffApi.getNurses(),
          staffApi.getPersonalizedPatients(selectedNurseId),
          staffApi.getQueue(),
        ]);
        if (!active) return;
        if (nursesRes.nurses) setNurses(nursesRes.nurses);
        if (personalRes) setPersonalQueue(personalRes);
        if (deptRes.visits) setDepartmentVisits(deptRes.visits);
        setLastUpdated(Date.now());
      } catch {
        /* fail soft for offline demo */
      }
    };

    void fetchStaffData();
    const interval = setInterval(() => void fetchStaffData(), 3500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedNurseId]);

  // Toggle nurse shift status: Ready vs Away
  const handleToggleStatus = async (newStatus: NurseStatus) => {
    if (!currentNurse) return;
    setActionBusy(true);
    try {
      const res = await staffApi.setNurseStatus(currentNurse.id, newStatus);
      if (res.workloads) setNurses(res.workloads);
      if (newStatus === 'away') {
        setBannerNotice(
          `Switched to AWAY (Lunch / Break). You will not receive any new patient arrivals until you flip back to Ready.`,
        );
      } else {
        setBannerNotice(
          `Switched to READY on the floor. The AI Matchmaker will now route arrivals to you based on your workload.`,
        );
      }
      // Refresh personalized queue
      const updatedQueue = await staffApi.getPersonalizedPatients(currentNurse.id);
      setPersonalQueue(updatedQueue);
    } catch {
      // Local fallback
      setNurses((prev) =>
        prev.map((nw) =>
          nw.nurse.id === currentNurse.id
            ? { ...nw, nurse: { ...nw.nurse, status: newStatus } }
            : nw,
        ),
      );
    } finally {
      setActionBusy(false);
    }
  };

  // Call In patient to room
  const handleCallIn = async (visitId: string) => {
    setActionBusy(true);
    try {
      await staffApi.callIn(visitId);
      setBannerNotice(`Patient called in! The child's kiosk screen has been notified to enter.`);
      const updatedQueue = await staffApi.getPersonalizedPatients(selectedNurseId);
      setPersonalQueue(updatedQueue);
      const deptRes = await staffApi.getQueue();
      if (deptRes.visits) setDepartmentVisits(deptRes.visits);
    } catch {
      /* ignore */
    } finally {
      setActionBusy(false);
    }
  };

  // Mark patient as done (Clear room)
  const handleClearRoom = async (visitId: string) => {
    setActionBusy(true);
    try {
      await staffApi.clearRoomDone(visitId);
      setBannerNotice(
        `Room cleared! The patient has been marked Done. Your capacity has been restored and the AI Matchmaker will update wait times.`,
      );
      const updatedQueue = await staffApi.getPersonalizedPatients(selectedNurseId);
      setPersonalQueue(updatedQueue);
      const deptRes = await staffApi.getQueue();
      if (deptRes.visits) setDepartmentVisits(deptRes.visits);
      const nursesRes = await staffApi.getNurses();
      if (nursesRes.nurses) setNurses(nursesRes.nurses);
    } catch {
      /* ignore */
    } finally {
      setActionBusy(false);
    }
  };

  // Filter department visits for the All Patients tab
  const filteredDeptVisits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departmentVisits;
    return departmentVisits.filter(
      (v) =>
        v.first_name.toLowerCase().includes(q) ||
        (v.chief_complaint && v.chief_complaint.toLowerCase().includes(q)) ||
        (v.complaint_words_en && v.complaint_words_en.toLowerCase().includes(q)),
    );
  }, [departmentVisits, search]);

  const selectedPatient = useMemo(() => {
    if (!selectedPatientId) {
      return personalQueue?.inRoom || personalQueue?.upNext || departmentVisits[0] || null;
    }
    return (
      departmentVisits.find((v) => v.id === selectedPatientId) ||
      (personalQueue?.inRoom?.id === selectedPatientId ? personalQueue.inRoom : null) ||
      personalQueue?.waiting.find((v) => v.id === selectedPatientId) ||
      null
    );
  }, [selectedPatientId, personalQueue, departmentVisits]);

  const readyNursesCount = nurses.filter((n) => n.nurse.status === 'ready').length;

  return (
    <main className="min-h-full bg-slate-50 font-sans text-slate-800">
      {/* 1. TOP DEDICATED NURSE SHIFT BAR */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-2xl text-white shadow-md">
              🩺
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-900">
                  Pediatric Care Team Portal
                </h1>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600">
                  Private Staff View
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                Department Triage & AI Workload Balancing · Live sync active
              </p>
            </div>
          </div>

          {/* Nurse Profile Selector & Clock In Toggle */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Shift Nurse Selector */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-bold shadow-inner">
              <span className="text-xs text-slate-500">Shift Account:</span>
              <select
                value={selectedNurseId}
                onChange={(e) => setSelectedNurseId(e.target.value)}
                className="bg-transparent font-extrabold text-slate-800 outline-none"
              >
                {nurses.map((nw) => (
                  <option key={nw.nurse.id} value={nw.nurse.id}>
                    {nw.nurse.avatar} {nw.nurse.name} ({nw.nurse.title})
                  </option>
                ))}
              </select>
            </div>

            {/* PILLAR 1: CLOCKING IN "READY" vs "AWAY" SWITCH */}
            {currentNurse && (
              <div className="flex items-center gap-3 rounded-2xl border-2 border-slate-200 bg-white p-1.5 shadow-sm">
                <span className="pl-2 text-xs font-black tracking-wider text-slate-500 uppercase">
                  Shift Status:
                </span>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => handleToggleStatus('ready')}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                    currentNurse.status === 'ready'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="size-2 rounded-full bg-emerald-300" />
                  Ready on Floor
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => handleToggleStatus('away')}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                    currentNurse.status === 'away'
                      ? 'bg-amber-500 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="size-2 rounded-full bg-amber-200" />
                  Away / Lunch
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Status / Shift Banner */}
        {bannerNotice && (
          <div className="mx-auto mt-3 flex max-w-7xl items-center justify-between rounded-xl bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-900 border border-blue-200">
            <span>{bannerNotice}</span>
            <button
              type="button"
              onClick={() => setBannerNotice(null)}
              className="text-xs text-blue-700 underline hover:text-blue-900"
            >
              Dismiss
            </button>
          </div>
        )}
      </header>

      {/* 2. SUB-NAVIGATION & VIEW TABS */}
      <div className="mx-auto max-w-7xl px-6 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setViewMode('my_shift')}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition-all ${
                viewMode === 'my_shift'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              👩‍⚕️ My Shift & Patients ({personalQueue?.totalAssigned || 0})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('matchmaker')}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition-all ${
                viewMode === 'matchmaker'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              🤖 Smart AI Matchmaker ({readyNursesCount} Ready)
            </button>
            <button
              type="button"
              onClick={() => setViewMode('all_patients')}
              className={`rounded-xl px-4 py-2 text-sm font-extrabold transition-all ${
                viewMode === 'all_patients'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-700 hover:bg-slate-100'
              }`}
            >
              🏥 All ER Arrivals ({departmentVisits.length})
            </button>
          </div>

          <div className="text-xs font-semibold text-slate-500">
            Current Floor: <span className="font-bold text-emerald-600">{readyNursesCount} Nurses Available</span> ·{' '}
            {departmentVisits.filter((v) => v.status === 'waiting').length} Waiting
          </div>
        </div>
      </div>

      {/* 3. MAIN DASHBOARD CONTENT */}
      <div className="mx-auto max-w-7xl p-6">
        {/* ======================================================== */}
        {/* VIEW 1: PERSONALIZED PATIENT LIST (PILLAR 1)             */}
        {/* ======================================================== */}
        {viewMode === 'my_shift' && (
          <div className="space-y-6">
            {/* Status Warning if nurse is Away */}
            {currentNurse?.status === 'away' && (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⏸️</span>
                  <div>
                    <h3 className="font-extrabold text-sm">You are currently Away / On Lunch</h3>
                    <p className="text-xs font-semibold text-amber-800">
                      The AI Matchmaker will NOT route any incoming patients to you. Switch your status to
                      &ldquo;Ready on Floor&rdquo; when you return.
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* CARD A: CURRENTLY IN ROOM (CLEARING THE ROOM) */}
              <div className="flex flex-col justify-between rounded-2xl border-2 border-emerald-200 bg-white p-6 shadow-sm">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="relative flex size-3">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex size-3 rounded-full bg-emerald-500" />
                      </span>
                      <h2 className="text-base font-black tracking-wide text-slate-900 uppercase">
                        Currently In Examination Room
                      </h2>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-extrabold text-emerald-800">
                      Active Encounter
                    </span>
                  </div>

                  {personalQueue?.inRoom ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-2xl font-black text-slate-900">
                            {personalQueue.inRoom.first_name}
                          </h3>
                          <p className="text-sm font-semibold text-slate-500">
                            Age {personalQueue.inRoom.age_years} · Arrived{' '}
                            {new Date(personalQueue.inRoom.arrived_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <span className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                          Chief Complaint: {personalQueue.inRoom.chief_complaint || 'General'}
                        </span>
                      </div>

                      {/* Clinical briefing */}
                      <div className="rounded-xl bg-slate-50 p-3.5 text-xs">
                        <span className="font-extrabold text-slate-500 uppercase">Child/Parent Words:</span>
                        <p className="mt-1 font-semibold text-slate-800 italic">
                          &ldquo;{personalQueue.inRoom.complaint_words_en || 'Triage notes recorded at kiosk.'}&rdquo;
                        </p>
                      </div>

                      {/* Alerts */}
                      {personalQueue.inRoom.alerts.length > 0 && (
                        <div className="space-y-1 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-900">
                          <span className="font-black">Active Alerts for this Patient:</span>
                          <ul className="list-disc pl-4 font-semibold">
                            {personalQueue.inRoom.alerts.map((a) => (
                              <li key={a.id}>{a.reason}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                      <span className="text-4xl">🚪</span>
                      <p className="mt-2 text-sm font-bold text-slate-600">
                        Examination Room is Currently Vacant
                      </p>
                      <p className="text-xs text-slate-400">
                        Call in the next patient below when you are ready.
                      </p>
                    </div>
                  )}
                </div>

                {/* PILLAR 1: CLEARING THE ROOM BUTTON */}
                {personalQueue?.inRoom && (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleClearRoom(personalQueue.inRoom!.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-base font-extrabold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-98"
                    >
                      <span>✅ Mark as Done (Clear Room & Free Time)</span>
                    </button>
                    <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-400">
                      Instantly frees your capacity and tells the AI Matchmaker to update patient wait times.
                    </p>
                  </div>
                )}
              </div>

              {/* CARD B: UP NEXT (BEFORE OPENING THE DOOR) */}
              <div className="flex flex-col justify-between rounded-2xl border-2 border-blue-200 bg-white p-6 shadow-sm">
                <div>
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⭐</span>
                      <h2 className="text-base font-black tracking-wide text-slate-900 uppercase">
                        Up Next in Line (Waiting Outside)
                      </h2>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">
                      Next to Call In
                    </span>
                  </div>

                  {personalQueue?.upNext ? (
                    <div className="mt-4 space-y-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <h3 className="text-2xl font-black text-slate-900">
                            {personalQueue.upNext.first_name}
                          </h3>
                          <p className="text-sm font-semibold text-slate-500">
                            Age {personalQueue.upNext.age_years} · Est. Wait: ~
                            {personalQueue.upNext.estimated_wait_minutes ?? 5} min
                          </p>
                        </div>
                        <span
                          className={`rounded-xl px-3 py-1 text-xs font-black ${
                            personalQueue.upNext.complexity === 'critical'
                              ? 'bg-red-100 text-red-800'
                              : personalQueue.upNext.complexity === 'urgent'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          Complexity: {personalQueue.upNext.complexity || 'Standard'}
                        </span>
                      </div>

                      {/* Clinical Summary so nurse knows what to expect before opening door */}
                      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs space-y-2">
                        <span className="font-extrabold tracking-wider text-blue-900 uppercase">
                          Pre-Encounter Briefing:
                        </span>
                        <p className="font-semibold text-slate-800">
                          {personalQueue.upNext.complaint_words_en
                            ? `Child reported: "${personalQueue.upNext.complaint_words_en}"`
                            : `Chief complaint: ${personalQueue.upNext.chief_complaint || 'Assessment needed'}`}
                        </p>
                        {personalQueue.upNext.alerts.length > 0 && (
                          <div className="mt-1 font-bold text-red-700">
                            ⚠️ Heads-Up: {personalQueue.upNext.alerts.map((a) => a.reason).join('; ')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                      <span className="text-4xl">☕</span>
                      <p className="mt-2 text-sm font-bold text-slate-600">No Patients Waiting in Your Line</p>
                      <p className="text-xs text-slate-400">
                        Your queue is caught up. New arrivals will be automatically matched.
                      </p>
                    </div>
                  )}
                </div>

                {personalQueue?.upNext && (
                  <div className="mt-6 border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => handleCallIn(personalQueue.upNext!.id)}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3.5 text-base font-extrabold text-white shadow-md transition-all hover:bg-blue-700 active:scale-98"
                    >
                      <span>🚪 Call In {personalQueue.upNext.first_name} to Room</span>
                    </button>
                    <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-400">
                      Pushes live alert to the patient&apos;s tablet screen to proceed to care room.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* CARD C: REMAINING ASSIGNED QUEUE */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-black tracking-wide text-slate-900 uppercase">
                Your Complete Waiting Line ({personalQueue?.waiting.length || 0} Patients Waiting)
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                Sorted by AI urgency and arrival order. Wait times update dynamically as encounters complete.
              </p>

              {personalQueue && personalQueue.waiting.length > 0 ? (
                <div className="mt-4 divide-y divide-slate-100">
                  {personalQueue.waiting.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3 hover:bg-slate-50 px-2 rounded-xl"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-7 items-center justify-center rounded-full bg-slate-100 text-xs font-black text-slate-600">
                          #{idx + 1}
                        </span>
                        <div>
                          <span className="font-extrabold text-slate-900">
                            {p.first_name}, {p.age_years} yrs
                          </span>
                          <span className="ml-2 text-xs text-slate-500">
                            ({p.chief_complaint || 'Triage in progress'})
                          </span>
                          <p className="text-xs text-slate-600 italic">
                            {p.complaint_words_en || 'Waiting for room'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-extrabold text-slate-600">
                          ~{p.estimated_wait_minutes ?? 10} min wait
                        </span>
                        {p.alerts.length > 0 && (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                            {p.alerts.length} Alert{p.alerts.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCallIn(p.id)}
                          className="rounded-lg bg-slate-100 px-3 py-1 text-xs font-bold text-blue-600 hover:bg-blue-50"
                        >
                          Call In Now
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-xs font-semibold text-slate-400">
                  No other patients currently waiting in your line.
                </p>
              )}
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 2: SMART AI MATCHMAKER WORKLOAD TRANSPARENCY        */}
        {/* ======================================================== */}
        {viewMode === 'matchmaker' && (
          <div className="space-y-6">
            <div className="rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50/60 via-white to-indigo-50/40 p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <span className="text-3xl">🤖</span>
                <div>
                  <h2 className="text-xl font-black text-slate-900">
                    The Smart AI Workload Matchmaker
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-600">
                    Instead of just counting patient heads or taking simple turns, the AI acts as an
                    intelligent department coordinator. It measures the{' '}
                    <strong className="text-indigo-900">true case difficulty and remaining treatment duration</strong>{' '}
                    to balance real nurse capacity.
                  </p>
                </div>
              </div>
            </div>

            {/* Nurse Workload Comparison Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {nurses.map((nw) => {
                const isReady = nw.nurse.status === 'ready';
                return (
                  <div
                    key={nw.nurse.id}
                    className={`rounded-2xl border-2 p-5 shadow-sm transition-all ${
                      isReady ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{nw.nurse.avatar}</span>
                        <div>
                          <h3 className="font-black text-slate-900">{nw.nurse.name}</h3>
                          <p className="text-xs text-slate-500">{nw.nurse.title}</p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                          isReady ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isReady ? 'Ready' : 'Away'}
                      </span>
                    </div>

                    <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-500">True Workload:</span>
                        <span className="font-black text-indigo-700">
                          {isReady ? `~${nw.totalWorkloadMinutes} min total` : 'Unavailable'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-500">In Room Encounter:</span>
                        <span className="font-bold text-slate-800">
                          {nw.inRoomCount > 0 ? `1 Active (${nw.activePatientComplexity})` : 'Vacant'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-500">Waiting in Line:</span>
                        <span className="font-bold text-slate-800">{nw.waitingCount} patient(s)</span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-2.5 text-[11px] font-semibold text-slate-600">
                      {nw.breakdown}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Explanatory Scenario Walkthrough */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-sm font-black text-slate-900 uppercase">
                Clinical Example of Smart Workload Matching:
              </h3>
              <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-600">
                If <strong>Nurse Sarah</strong> has only 1 patient, but it is a complex, time-consuming
                emergency (high fever + respiratory distress, ~28 minutes remaining), and{' '}
                <strong>Nurse Marcus</strong> has 2 patients with minor, quick issues (~7 minutes each = 14
                minutes total), the AI recognizes that <strong>Nurse Marcus will actually be free sooner</strong>.
                When a new child completes their intake and clicks &ldquo;Send to Nurse,&rdquo; the AI
                automatically assigns them to Nurse Marcus, preventing Nurse Sarah from being overwhelmed.
              </p>
            </div>
          </div>
        )}

        {/* ======================================================== */}
        {/* VIEW 3: ALL DEPARTMENT ARRIVALS                          */}
        {/* ======================================================== */}
        {viewMode === 'all_patients' && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-lg font-black text-slate-900">Emergency Department Queue</h2>
                <p className="text-xs text-slate-500">All registered pediatric patients currently in the department.</p>
              </div>

              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search patient name, symptom..."
                className="w-64 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold outline-none focus:border-blue-500"
              />
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase">
                    <th className="py-2.5 px-3">Patient</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Assigned Nurse</th>
                    <th className="py-2.5 px-3">Chief Complaint</th>
                    <th className="py-2.5 px-3">Est. Wait</th>
                    <th className="py-2.5 px-3">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredDeptVisits.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="py-3 px-3 font-extrabold text-slate-900">
                        {v.first_name}, {v.age_years} yrs
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            v.status === 'in_room'
                              ? 'bg-emerald-100 text-emerald-800'
                              : v.status === 'waiting'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {v.status === 'in_room' ? 'In Room' : v.status === 'waiting' ? 'Waiting' : 'Done'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-800">
                        {v.alerts.length > 0 ? (
                          <span className="text-blue-600">👩‍⚕️ Nurse Sarah</span>
                        ) : (
                          <span className="text-blue-600">👨‍⚕️ Nurse Marcus</span>
                        )}
                      </td>
                      <td className="py-3 px-3">{v.chief_complaint || 'Triage underway'}</td>
                      <td className="py-3 px-3 font-bold">~{v.estimated_wait_minutes ?? 10} min</td>
                      <td className="py-3 px-3">
                        {v.alerts.length > 0 ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                            {v.alerts.length} Flag{v.alerts.length > 1 ? 's' : ''}
                          </span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default Dashboard;
