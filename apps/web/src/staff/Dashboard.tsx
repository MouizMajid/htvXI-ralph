import { useEffect, useMemo, useState } from 'react';
import {
  staffApi,
  type PersonalizedNurseQueue,
  type PersonalizedPatient,
} from '../lib/api';
import type { NurseStatus, NurseWorkload } from '@ralph/shared';

const STAFF_SESSION_KEY = 'ralph.staff.session.v1';

interface SavedStaffSession {
  nurseId: string;
  clockedIn: boolean;
}

function loadStaffSession(): SavedStaffSession | null {
  try {
    const raw = sessionStorage.getItem(STAFF_SESSION_KEY);
    return raw ? (JSON.parse(raw) as SavedStaffSession) : null;
  } catch {
    return null;
  }
}

function saveStaffSession(session: SavedStaffSession | null) {
  try {
    if (session) sessionStorage.setItem(STAFF_SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(STAFF_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

const DEFAULT_FALLBACK_NURSES: NurseWorkload[] = [
  {
    nurse: {
      id: 'nurse-sarah',
      name: 'Nurse Sarah',
      title: 'Pediatric Emergency RN',
      avatar: '👩‍⚕️',
      status: 'ready',
      specialty: 'Trauma & Critical Care',
    },
    inRoomCount: 1,
    waitingCount: 1,
    totalWorkloadMinutes: 36,
    activePatientComplexity: 'critical',
    breakdown: 'Treating Leo (~26m left, critical) + 1 waiting (~10m)',
  },
  {
    nurse: {
      id: 'nurse-marcus',
      name: 'Nurse Marcus',
      title: 'Pediatric Acute Care RN',
      avatar: '👨‍⚕️',
      status: 'ready',
      specialty: 'Respiratory & Fast-Track Triage',
    },
    inRoomCount: 0,
    waitingCount: 2,
    totalWorkloadMinutes: 20,
    activePatientComplexity: 'standard',
    breakdown: '2 waiting (~20m total)',
  },
  {
    nurse: {
      id: 'nurse-elena',
      name: 'Nurse Elena',
      title: 'Pediatric Nurse Practitioner',
      avatar: '👩‍⚕️',
      status: 'away',
      specialty: 'Urgent Care & Procedures',
    },
    inRoomCount: 0,
    waitingCount: 0,
    totalWorkloadMinutes: 9999,
    activePatientComplexity: 'none',
    breakdown: 'On Break / Away (Not accepting new patients)',
  },
];

const NURSE_CREDENTIALS: Record<
  string,
  { badgeId: string; pin: string; name: string }
> = {
  'nurse-sarah': { badgeId: 'SARAH-01', pin: '1111', name: 'Nurse Sarah' },
  'nurse-marcus': { badgeId: 'MARCUS-02', pin: '2222', name: 'Nurse Marcus' },
  'nurse-elena': { badgeId: 'ELENA-03', pin: '3333', name: 'Nurse Elena' },
};

export function Dashboard() {
  const initialSaved = loadStaffSession();
  // Who is currently signed in with their personal badge at the terminal
  const [loggedInNurseId, setLoggedInNurseId] = useState<string>(
    initialSaved?.nurseId || 'nurse-sarah',
  );
  // Which nurse's page they clicked on
  const [selectedNurseId, setSelectedNurseId] = useState<string>(
    initialSaved?.nurseId || 'nurse-sarah',
  );
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(
    Boolean(initialSaved?.clockedIn),
  );

  // Login & Clock-in Gate State
  const [pinInput, setPinInput] = useState<string>(
    NURSE_CREDENTIALS[initialSaved?.nurseId || 'nurse-sarah']?.pin || '1111',
  );
  const [clockInReadySwitch, setClockInReadySwitch] = useState<boolean>(true);
  const [loginError, setLoginError] = useState<string | null>(null);

  const [nurses, setNurses] = useState<NurseWorkload[]>(DEFAULT_FALLBACK_NURSES);
  const [personalQueue, setPersonalQueue] = useState<PersonalizedNurseQueue | null>(null);
  const [departmentVisits, setDepartmentVisits] = useState<PersonalizedPatient[]>([]);
  const [viewMode, setViewMode] = useState<'my_shift' | 'matchmaker' | 'all_patients'>('my_shift');
  const [actionBusy, setActionBusy] = useState(false);
  const [bannerNotice, setBannerNotice] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Selected nurse page object
  const currentNurseWorkload = useMemo(
    () => nurses.find((n) => n.nurse.id === selectedNurseId) || nurses[0],
    [nurses, selectedNurseId],
  );
  const currentNurse = currentNurseWorkload?.nurse;

  // Logged-in nurse identity object
  const loggedInNurse = useMemo(
    () => nurses.find((n) => n.nurse.id === loggedInNurseId)?.nurse || nurses[0]?.nurse,
    [nurses, loggedInNurseId],
  );

  // Strict Page Ownership Check: Can only clock in / open YOUR OWN page
  const isOwnPage = loggedInNurseId === selectedNurseId;

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
        if (nursesRes.nurses?.length) setNurses(nursesRes.nurses);
        if (personalRes) setPersonalQueue(personalRes);
        if (deptRes.visits) setDepartmentVisits(deptRes.visits);
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

  const isSelectedNurseAlreadyOnFloor = currentNurse?.status === 'ready';

  // Handle Login (+ Clock-In only if nurse is currently Away, and ONLY on your own page)
  const handleLoginAndClockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);

    const expectedCreds = NURSE_CREDENTIALS[selectedNurseId];
    const enteredPin = pinInput.trim();

    // 1. Block if logged-in nurse identity does not match the selected nurse page
    if (!isOwnPage) {
      setLoginError(
        `Access Denied: You are identified as ${loggedInNurse?.name || 'another nurse'}. ${
          loggedInNurse?.name || 'You'
        } cannot clock in to or open ${currentNurse?.name || 'another nurse'}'s page! You can only clock in to your own page.`,
      );
      return;
    }

    // 2. Check if the entered PIN belongs to a DIFFERENT nurse
    const pinOwnerEntry = Object.entries(NURSE_CREDENTIALS).find(
      ([, cred]) => cred.pin === enteredPin,
    );
    if (pinOwnerEntry && pinOwnerEntry[0] !== selectedNurseId) {
      const otherNurseName = pinOwnerEntry[1].name;
      setLoginError(
        `Access Denied: Badge PIN "${enteredPin}" belongs to ${otherNurseName}. ${otherNurseName} cannot clock in to ${currentNurse?.name}'s page! You can only clock in to your own page.`,
      );
      return;
    }

    // 3. Validate personal PIN for this nurse
    if (expectedCreds && enteredPin !== expectedCreds.pin) {
      setLoginError(
        `Invalid Personal PIN for ${currentNurse?.name}. Please enter ${currentNurse?.name}'s personal PIN (${expectedCreds.pin}).`,
      );
      return;
    }

    // 4. If nurse is Away, require flipping the Clock-In switch to READY
    if (!isSelectedNurseAlreadyOnFloor && !clockInReadySwitch) {
      setLoginError(
        `${currentNurse?.name || 'This nurse'} is currently Away. Please flip your Shift Clock-In switch to "READY" to clock in and enter your dashboard.`,
      );
      return;
    }

    setActionBusy(true);
    try {
      if (!isSelectedNurseAlreadyOnFloor) {
        const res = await staffApi.setNurseStatus(
          selectedNurseId,
          'ready',
          loggedInNurseId,
        );
        if (res.workloads) setNurses(res.workloads);
      }
      const updatedQueue = await staffApi.getPersonalizedPatients(selectedNurseId);
      setPersonalQueue(updatedQueue);
    } catch {
      if (!isSelectedNurseAlreadyOnFloor) {
        setNurses((prev) =>
          prev.map((nw) =>
            nw.nurse.id === selectedNurseId
              ? { ...nw, nurse: { ...nw.nurse, status: 'ready' } }
              : nw,
          ),
        );
      }
    } finally {
      setActionBusy(false);
    }

    saveStaffSession({ nurseId: selectedNurseId, clockedIn: true });
    setIsAuthenticated(true);
    setBannerNotice(
      isSelectedNurseAlreadyOnFloor
        ? `Welcome back, ${currentNurse?.name || 'Nurse'}! Verified personal badge (${expectedCreds?.badgeId}) — showing your private patient list.`
        : `Welcome, ${currentNurse?.name || 'Nurse'}! You are now clocked in to your own page and READY on the floor.`,
    );
  };

  // Sign out of current nurse session without clocking out (keeps current nurse On Floor)
  const handleSwitchNurseKeepStatus = () => {
    saveStaffSession(null);
    setIsAuthenticated(false);
    setLoginError(null);
    setBannerNotice(null);
  };

  // Clock Out (sets ONLY your own nurse status to Away) & Sign Out back to Login Gate
  const handleClockOutAndSignOut = async () => {
    if (currentNurse && isOwnPage) {
      setActionBusy(true);
      try {
        const res = await staffApi.setNurseStatus(
          currentNurse.id,
          'away',
          loggedInNurseId,
        );
        if (res.workloads) setNurses(res.workloads);
      } catch {
        setNurses((prev) =>
          prev.map((nw) =>
            nw.nurse.id === currentNurse.id
              ? { ...nw, nurse: { ...nw.nurse, status: 'away' } }
              : nw,
          ),
        );
      } finally {
        setActionBusy(false);
      }
    }
    saveStaffSession(null);
    setIsAuthenticated(false);
    setClockInReadySwitch(false);
    setLoginError(null);
    setBannerNotice(null);
  };

  // Toggle nurse shift status while inside the portal: Ready vs Away (strictly for your own page)
  const handleToggleStatus = async (newStatus: NurseStatus, targetId?: string) => {
    const targetNurseId = targetId || currentNurse?.id;
    if (!targetNurseId) return;

    if (targetNurseId !== loggedInNurseId) {
      const targetNurseObj = nurses.find((n) => n.nurse.id === targetNurseId)?.nurse;
      setBannerNotice(
        `🚫 Access Denied: ${loggedInNurse?.name} cannot clock in or change shift status on ${
          targetNurseObj?.name || 'another nurse'
        }'s page! You can only clock in to your own page.`,
      );
      return;
    }

    setActionBusy(true);
    try {
      const res = await staffApi.setNurseStatus(
        targetNurseId,
        newStatus,
        loggedInNurseId,
      );
      if (res.workloads) setNurses(res.workloads);
      if (newStatus === 'away') {
        setBannerNotice(
          `Switched your page to AWAY (Lunch / Break). The AI Matchmaker immediately stopped sending you new patients and reassigned waiting arrivals.`,
        );
      } else {
        setBannerNotice(
          `Switched your page to READY on the floor. The AI Matchmaker is now actively routing arrivals to you.`,
        );
      }
      const updatedQueue = await staffApi.getPersonalizedPatients(targetNurseId);
      setPersonalQueue(updatedQueue);
    } catch {
      setNurses((prev) =>
        prev.map((nw) =>
          nw.nurse.id === targetNurseId
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
        `Room cleared! Patient marked as Done. The AI Matchmaker now knows you have free time again and updated live wait times.`,
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

  const readyNursesCount = nurses.filter((n) => n.nurse.status === 'ready').length;

  // =========================================================================
  // GATE: NURSE SIGN-IN & SHIFT CLOCK-IN PORTAL (WITH STRICT PAGE OWNERSHIP)
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <main className="flex min-h-full flex-col items-center justify-center bg-slate-900 px-4 py-10 font-sans text-slate-100">
        <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-700 bg-slate-800/95 shadow-2xl">
          {/* Top Portal Header */}
          <div className="border-b border-slate-700 bg-gradient-to-r from-blue-700 via-indigo-700 to-slate-800 px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3.5">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-white/15 text-3xl shadow-inner ring-1 ring-white/25">
                  🩺
                </span>
                <div>
                  <span className="rounded-full bg-blue-400/20 px-2.5 py-0.5 text-[11px] font-black tracking-wider text-blue-200 uppercase">
                    Private Medical Staff Terminal
                  </span>
                  <h1 className="mt-0.5 text-2xl font-black tracking-tight text-white">
                    Nurse Sign-In &amp; Clock-In Portal
                  </h1>
                </div>
              </div>
              <div className="hidden text-right sm:block">
                <span className="text-xs font-bold text-blue-200">Active Badge Identity</span>
                <p className="text-sm font-black text-emerald-300">
                  {loggedInNurse?.name} ({NURSE_CREDENTIALS[loggedInNurseId]?.badgeId})
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={handleLoginAndClockIn} className="space-y-6 p-8">
            {/* STEP 1: WHO ARE YOU? (SCAN / SELECT YOUR PERSONAL STAFF BADGE) */}
            <div className="rounded-2xl border border-slate-700 bg-slate-900/70 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <label className="block text-xs font-black tracking-wider text-blue-300 uppercase">
                    1. Your Staff Badge Identity (Who Are You?)
                  </label>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Each nurse has a unique badge &amp; PIN and can{' '}
                    <strong className="text-white">only clock in to their own page</strong>.
                  </p>
                </div>
                <span className="rounded-lg bg-blue-500/20 px-2.5 py-1 text-[11px] font-black text-blue-200">
                  Signed In Badge: {loggedInNurse?.name}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                {nurses.map((nw) => {
                  const cred = NURSE_CREDENTIALS[nw.nurse.id];
                  const isMyBadge = nw.nurse.id === loggedInNurseId;
                  return (
                    <button
                      key={`badge-${nw.nurse.id}`}
                      type="button"
                      onClick={() => {
                        setLoggedInNurseId(nw.nurse.id);
                        setSelectedNurseId(nw.nurse.id);
                        setPinInput(cred?.pin || '1111');
                        setClockInReadySwitch(nw.nurse.status === 'ready');
                        setLoginError(null);
                      }}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all ${
                        isMyBadge
                          ? 'border-emerald-400 bg-emerald-500/20 text-white shadow-sm ring-1 ring-emerald-400/50'
                          : 'border-slate-700 bg-slate-800/80 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{nw.nurse.avatar}</span>
                        <div>
                          <div className="text-xs font-black text-white">
                            I am {nw.nurse.name}
                          </div>
                          <div className="font-mono text-[10px] font-bold text-slate-400">
                            Badge: {cred?.badgeId} · PIN: {cred?.pin}
                          </div>
                        </div>
                      </div>
                      {isMyBadge && (
                        <span className="rounded-full bg-emerald-400 px-1.5 py-0.5 text-[9px] font-black text-slate-950">
                          YOU
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 2: SELECT NURSE PAGE TO OPEN / CLOCK IN */}
            <div>
              <label className="block text-xs font-black tracking-wider text-slate-300 uppercase">
                2. Select Nurse Page ({loggedInNurse?.name} Can Only Clock In to{' '}
                {loggedInNurse?.name}&apos;s Page)
              </label>
              <p className="mt-0.5 text-xs text-slate-400">
                Try clicking another nurse&apos;s page below — the system blocks{' '}
                <strong className="text-slate-200">{loggedInNurse?.name}</strong> from clocking in
                to anyone else&apos;s page.
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {nurses.map((nw) => {
                  const isSelected = nw.nurse.id === selectedNurseId;
                  const isThisMyOwnPage = nw.nurse.id === loggedInNurseId;
                  const isCurrentlyReady = nw.nurse.status === 'ready';
                  return (
                    <button
                      key={nw.nurse.id}
                      type="button"
                      onClick={() => {
                        setSelectedNurseId(nw.nurse.id);
                        setClockInReadySwitch(nw.nurse.status === 'ready');
                        if (nw.nurse.id !== loggedInNurseId) {
                          setLoginError(
                            `Access Restricted: You are signed in as ${loggedInNurse?.name}. ${loggedInNurse?.name} cannot clock in to ${nw.nurse.name}'s page! You can only clock in to your own page.`,
                          );
                        } else {
                          setLoginError(null);
                        }
                      }}
                      className={`flex flex-col items-start justify-between rounded-2xl border-2 p-4 text-left transition-all ${
                        isSelected
                          ? isThisMyOwnPage
                            ? 'border-blue-400 bg-blue-600/25 shadow-lg ring-2 ring-blue-400/40'
                            : 'border-red-400 bg-red-900/25 shadow-lg ring-2 ring-red-400/40'
                          : isThisMyOwnPage
                            ? 'border-slate-600 bg-slate-900/80 hover:border-blue-400/60'
                            : 'border-slate-800 bg-slate-900/40 opacity-75 hover:border-red-500/50'
                      }`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-3xl">{nw.nurse.avatar}</span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                            isCurrentlyReady
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {isCurrentlyReady ? 'On Floor' : 'Away'}
                        </span>
                      </div>
                      <div className="mt-3 w-full">
                        <div className="flex items-center justify-between">
                          <span className="font-black text-white">
                            {nw.nurse.name}&apos;s Page
                          </span>
                        </div>
                        <div className="text-[11px] font-semibold text-slate-400">
                          {nw.nurse.title}
                        </div>
                        <div
                          className={`mt-2 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-black ${
                            isThisMyOwnPage
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-red-500/20 text-red-300'
                          }`}
                        >
                          {isThisMyOwnPage
                            ? '✅ YOUR PAGE (Authorized)'
                            : `🔒 NOT YOUR PAGE`}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* STEP 3: PERSONAL BADGE PIN + SHIFT CLOCK-IN SWITCH */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="staff-pin"
                  className="block text-xs font-black tracking-wider text-slate-300 uppercase"
                >
                  3. Personal Badge PIN for {currentNurse?.name}
                </label>
                <p className="mt-0.5 text-xs text-slate-400">
                  {currentNurse?.name}&apos;s PIN is{' '}
                  <code className="text-blue-300">
                    {NURSE_CREDENTIALS[selectedNurseId]?.pin}
                  </code>
                </p>
                <input
                  id="staff-pin"
                  type="password"
                  value={pinInput}
                  onChange={(e) => {
                    setPinInput(e.target.value);
                    setLoginError(null);
                  }}
                  maxLength={8}
                  placeholder="Enter 4-digit personal PIN"
                  className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900 px-4 py-3 font-mono text-lg font-black tracking-widest text-white outline-none focus:border-blue-400"
                />
              </div>

              {/* Step 4: If Not Own Page -> Locked! Else If On Floor -> Active Badge; Else If Away -> Clock-In Switch */}
              {!isOwnPage ? (
                <div>
                  <span className="block text-xs font-black tracking-wider text-red-300 uppercase">
                    4. Clock-In Locked (Wrong Nurse)
                  </span>
                  <p className="mt-0.5 text-xs text-red-200/80">
                    {loggedInNurse?.name} cannot clock in to {currentNurse?.name}&apos;s page
                  </p>
                  <div className="mt-2 flex items-center justify-between rounded-xl border-2 border-red-500/50 bg-red-500/15 px-4 py-3 text-red-200">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🔒</span>
                      <span className="text-xs font-black">
                        Locked — Only {currentNurse?.name} can clock in here
                      </span>
                    </div>
                  </div>
                </div>
              ) : isSelectedNurseAlreadyOnFloor ? (
                <div>
                  <span className="block text-xs font-black tracking-wider text-emerald-300 uppercase">
                    4. Shift Status ({currentNurse?.name}&apos;s Page)
                  </span>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Already clocked in on the floor
                  </p>
                  <div className="mt-2 flex items-center justify-between rounded-xl border-2 border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-emerald-200">
                    <div className="flex items-center gap-2.5">
                      <span className="size-3 rounded-full bg-emerald-400" />
                      <span className="text-sm font-black">
                        ✅ ON FLOOR (No Clock-In Needed)
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <span className="block text-xs font-black tracking-wider text-amber-300 uppercase">
                    4. Currently Away — Clock In to Your Page
                  </span>
                  <p className="mt-0.5 text-xs text-slate-400">
                    Flip your switch to &ldquo;Ready&rdquo; to start your shift
                  </p>

                  <button
                    type="button"
                    onClick={() => {
                      setClockInReadySwitch((v) => !v);
                      setLoginError(null);
                    }}
                    className={`mt-2 flex w-full items-center justify-between rounded-xl border-2 px-4 py-3 transition-all ${
                      clockInReadySwitch
                        ? 'border-emerald-400 bg-emerald-600/25 text-emerald-200'
                        : 'border-amber-500/70 bg-amber-500/20 text-amber-200 animate-pulse'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`size-3 rounded-full ${
                          clockInReadySwitch ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      <span className="text-sm font-black uppercase">
                        {clockInReadySwitch
                          ? 'Switch: READY (Clocking In)'
                          : 'Switch: AWAY (Tap to Clock In)'}
                      </span>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                        clockInReadySwitch
                          ? 'bg-emerald-400 text-slate-950'
                          : 'bg-amber-400 text-slate-950'
                      }`}
                    >
                      {clockInReadySwitch ? 'READY' : 'AWAY'}
                    </span>
                  </button>
                </div>
              )}
            </div>

            {loginError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/60 bg-red-500/20 px-4 py-3 text-xs font-bold text-red-200">
                <span>🚫 {loginError}</span>
                {!isOwnPage && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedNurseId(loggedInNurseId);
                      const myNurse = nurses.find((n) => n.nurse.id === loggedInNurseId)?.nurse;
                      setClockInReadySwitch(myNurse?.status === 'ready');
                      setPinInput(NURSE_CREDENTIALS[loggedInNurseId]?.pin || '1111');
                      setLoginError(null);
                    }}
                    className="rounded-lg bg-white/15 px-3 py-1.5 text-[11px] font-black text-white hover:bg-white/25"
                  >
                    ↩️ Back to {loggedInNurse?.name}&apos;s Own Page
                  </button>
                )}
              </div>
            )}

            {/* Submit Sign-In / Clock-In Button */}
            <button
              type="submit"
              disabled={actionBusy || !isOwnPage}
              className={`flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-lg font-black shadow-xl transition-all ${
                !isOwnPage
                  ? 'cursor-not-allowed border border-red-500/40 bg-red-950/60 text-red-300'
                  : isSelectedNurseAlreadyOnFloor
                    ? 'bg-blue-500 text-white hover:bg-blue-400 active:scale-99'
                    : clockInReadySwitch
                      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400 active:scale-99'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              <span>
                {!isOwnPage
                  ? `🔒 Blocked: ${loggedInNurse?.name} Cannot Clock In to ${currentNurse?.name}'s Page`
                  : isSelectedNurseAlreadyOnFloor
                    ? `🔓 Open My Page (${currentNurse?.name}'s Dashboard)`
                    : clockInReadySwitch
                      ? `🟢 Clock In to My Page (${currentNurse?.name}'s Dashboard)`
                      : `⏸️ ${currentNurse?.name} is Away — Flip Your Switch to "READY" Above to Clock In`}
              </span>
            </button>
          </form>
        </div>
      </main>
    );
  }

  // =========================================================================
  // AUTHENTICATED & CLOCKED-IN NURSE DASHBOARD
  // =========================================================================
  return (
    <main className="min-h-full bg-slate-50 font-sans text-slate-800">
      {/* 1. TOP DEDICATED NURSE SHIFT BAR */}
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex size-11 items-center justify-center rounded-xl bg-blue-600 text-2xl text-white shadow-md">
              {currentNurse?.avatar || '👩‍⚕️'}
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-slate-900">
                  {currentNurse?.name}&apos;s Personal Page
                </h1>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-extrabold text-blue-700">
                  {currentNurse?.title}
                </span>
                <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-black text-emerald-700">
                  🔒 Badge Verified ({NURSE_CREDENTIALS[selectedNurseId]?.badgeId})
                </span>
              </div>
              <p className="text-xs font-semibold text-slate-500">
                Only {currentNurse?.name} can clock in/out of this page · Showing patients assigned to you
              </p>
            </div>
          </div>

          {/* Shift Status Switch ("Ready" vs "Away") + Switch Nurse / Clock Out Buttons */}
          <div className="flex flex-wrap items-center gap-2.5">
            {currentNurse && (
              <div className="flex items-center gap-2 rounded-2xl border-2 border-slate-200 bg-white p-1.5 shadow-sm">
                <span className="pl-2 text-xs font-black tracking-wider text-slate-500 uppercase">
                  My Shift Switch:
                </span>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => handleToggleStatus('ready', currentNurse.id)}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                    currentNurse.status === 'ready'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="size-2 rounded-full bg-emerald-300" />
                  Ready (On Floor)
                </button>
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => handleToggleStatus('away', currentNurse.id)}
                  className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-black transition-all ${
                    currentNurse.status === 'away'
                      ? 'bg-amber-500 text-white shadow-md'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <span className="size-2 rounded-full bg-amber-200" />
                  Away (Lunch / Break)
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={actionBusy}
              onClick={handleSwitchNurseKeepStatus}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-extrabold text-slate-700 transition-all hover:bg-slate-100"
            >
              🔐 Sign Out (Keep On Floor)
            </button>

            <button
              type="button"
              disabled={actionBusy}
              onClick={handleClockOutAndSignOut}
              className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-extrabold text-red-700 transition-all hover:bg-red-100"
            >
              🚪 Clock Out (Go Away)
            </button>
          </div>
        </div>

        {/* Dynamic Status / Shift Banner */}
        {bannerNotice && (
          <div className="mx-auto mt-3 flex max-w-7xl items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-900">
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
              👩‍⚕️ My Assigned Patients ({personalQueue?.totalAssigned || 0})
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
            Current Floor:{' '}
            <span className="font-bold text-emerald-600">{readyNursesCount} Nurses Ready</span> ·{' '}
            {departmentVisits.filter((v) => v.status === 'waiting').length} Total Waiting
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
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⏸️</span>
                  <div>
                    <h3 className="text-sm font-extrabold">
                      You are currently Away / On Break
                    </h3>
                    <p className="text-xs font-semibold text-amber-800">
                      The system has stopped giving you new patients. Flip your switch back to
                      &ldquo;Ready&rdquo; when you return to the floor.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggleStatus('ready')}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-emerald-700"
                >
                  🟢 Flip to Ready Now
                </button>
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
                        Currently Treating (In Room)
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
                        <span className="font-extrabold text-slate-500 uppercase">
                          Symptom Summary:
                        </span>
                        <p className="mt-1 font-semibold text-slate-800 italic">
                          &ldquo;
                          {personalQueue.inRoom.complaint_words_en ||
                            'Triage notes recorded at kiosk.'}
                          &rdquo;
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
                        Your Room is Currently Open
                      </p>
                      <p className="text-xs text-slate-400">
                        Call in your &ldquo;Up Next&rdquo; patient when ready.
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
                      <span>✅ Done — Clear Room &amp; Free My Time</span>
                    </button>
                    <p className="mt-1.5 text-center text-[11px] font-semibold text-slate-400">
                      Instantly tells the AI you have free time again and drops wait times for your line.
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
                        Up Next (Assigned to You)
                      </h2>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-extrabold text-blue-800">
                      Before Opening the Door
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

                      {/* Quick Symptom Summary before opening the door */}
                      <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs">
                        <span className="font-extrabold tracking-wider text-blue-900 uppercase">
                          Quick Symptom Summary (What to Expect):
                        </span>
                        <p className="font-semibold text-slate-800">
                          {personalQueue.upNext.complaint_words_en
                            ? `Child reported: "${personalQueue.upNext.complaint_words_en}"`
                            : `Chief complaint: ${personalQueue.upNext.chief_complaint || 'Assessment needed'}`}
                        </p>
                        {personalQueue.upNext.alerts.length > 0 && (
                          <div className="mt-1 font-bold text-red-700">
                            ⚠️ Clinical Heads-Up:{' '}
                            {personalQueue.upNext.alerts.map((a) => a.reason).join('; ')}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-slate-400">
                      <span className="text-4xl">☕</span>
                      <p className="mt-2 text-sm font-bold text-slate-600">
                        No Patients Waiting in Your Line
                      </p>
                      <p className="text-xs text-slate-400">
                        The AI Matchmaker will assign the next arrival to you when appropriate.
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
                      Notifies {personalQueue.upNext.first_name}&apos;s tablet screen that you are ready for them.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* CARD C: REMAINING ASSIGNED QUEUE */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-base font-black tracking-wide text-slate-900 uppercase">
                Your Personalized Patient List ({personalQueue?.waiting.length || 0} Waiting for{' '}
                {currentNurse?.name})
              </h2>
              <p className="text-xs font-semibold text-slate-500">
                Only patients assigned specifically to you by the Smart AI Matchmaker appear here.
              </p>

              {personalQueue && personalQueue.waiting.length > 0 ? (
                <div className="mt-4 divide-y divide-slate-100">
                  {personalQueue.waiting.map((p, idx) => (
                    <div
                      key={p.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-2 py-3 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex size-7 items-center justify-center rounded-full bg-blue-50 text-xs font-black text-blue-700">
                          #{idx + 1}
                        </span>
                        <div>
                          <span className="font-extrabold text-slate-900">
                            {p.first_name}, {p.age_years} yrs
                          </span>
                          <span className="ml-2 rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                            {p.chief_complaint || 'General'}
                          </span>
                          <p className="mt-0.5 text-xs text-slate-600 italic">
                            &ldquo;{p.complaint_words_en || 'Waiting for room'}&rdquo;
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-extrabold text-slate-600">
                          ~{p.estimated_wait_minutes ?? 10} min est. wait
                        </span>
                        {p.alerts.length > 0 && (
                          <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-bold text-red-700">
                            {p.alerts.length} Alert{p.alerts.length > 1 ? 's' : ''}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleCallIn(p.id)}
                          className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-700 hover:bg-blue-100"
                        >
                          Call In
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-xs font-semibold text-slate-400">
                  No other patients currently waiting in your personal queue.
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
                    intelligent manager. It measures{' '}
                    <strong className="text-indigo-900">
                      case complexity and true remaining treatment minutes
                    </strong>{' '}
                    so no nurse gets overwhelmed.
                  </p>
                </div>
              </div>
            </div>

            {/* Nurse Workload Comparison Cards */}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {nurses.map((nw) => {
                const isReady = nw.nurse.status === 'ready';
                const isMyCard = nw.nurse.id === loggedInNurseId;
                return (
                  <div
                    key={nw.nurse.id}
                    className={`rounded-2xl border-2 p-5 shadow-sm transition-all ${
                      isMyCard
                        ? 'border-blue-300 bg-white ring-2 ring-blue-100'
                        : isReady
                          ? 'border-slate-200 bg-white'
                          : 'border-slate-200 bg-slate-50 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{nw.nurse.avatar}</span>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h3 className="font-black text-slate-900">{nw.nurse.name}</h3>
                            {isMyCard && (
                              <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-black text-blue-800">
                                YOU
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">{nw.nurse.title}</p>
                        </div>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-black ${
                          isReady
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {isReady ? 'Ready' : 'Away'}
                      </span>
                    </div>

                    <div className="mt-5 space-y-2 border-t border-slate-100 pt-4">
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-500">True Workload:</span>
                        <span className="font-black text-indigo-700">
                          {isReady ? `~${nw.totalWorkloadMinutes} min total` : 'Unavailable (Away)'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-500">In Room Encounter:</span>
                        <span className="font-bold text-slate-800">
                          {nw.inRoomCount > 0
                            ? `1 Active (${nw.activePatientComplexity})`
                            : 'Vacant'}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="font-semibold text-slate-500">Waiting in Line:</span>
                        <span className="font-bold text-slate-800">
                          {nw.waitingCount} patient(s)
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl bg-slate-50 p-2.5 text-[11px] font-semibold text-slate-600">
                      {nw.breakdown}
                    </div>

                    <div className="mt-3 border-t border-slate-100 pt-3">
                      {isMyCard ? (
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() =>
                            handleToggleStatus(isReady ? 'away' : 'ready', nw.nurse.id)
                          }
                          className="w-full rounded-xl bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-100"
                        >
                          ✅ Your Page — {isReady ? 'Switch Myself to Away' : 'Clock Myself In'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleStatus(isReady ? 'away' : 'ready', nw.nurse.id)
                          }
                          className="w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-500 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                        >
                          🔒 {nw.nurse.name}&apos;s Page (Only {nw.nurse.name} Can Clock In)
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
                <p className="text-xs text-slate-500">
                  All registered pediatric patients across the floor.
                </p>
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
                  <tr className="border-b border-slate-200 font-extrabold text-slate-400 uppercase">
                    <th className="px-3 py-2.5">Patient</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5">Chief Complaint &amp; Summary</th>
                    <th className="px-3 py-2.5">Est. Wait</th>
                    <th className="px-3 py-2.5">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {filteredDeptVisits.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 font-extrabold text-slate-900">
                        {v.first_name}, {v.age_years} yrs
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            v.status === 'in_room'
                              ? 'bg-emerald-100 text-emerald-800'
                              : v.status === 'waiting'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {v.status === 'in_room'
                            ? 'In Room'
                            : v.status === 'waiting'
                              ? 'Waiting'
                              : 'Done'}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-bold text-slate-800">
                          {v.chief_complaint || 'General'}:
                        </span>{' '}
                        <span className="italic text-slate-600">
                          {v.complaint_words_en || 'Triage underway'}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-bold">
                        ~{v.estimated_wait_minutes ?? 10} min
                      </td>
                      <td className="px-3 py-3">
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
