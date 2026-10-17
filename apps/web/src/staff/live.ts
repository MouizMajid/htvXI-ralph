/**
 * "Realtime" for the staff dashboard = TanStack Query polling (no WebSockets on Vercel).
 * Use with useQuery({ ..., refetchInterval: LIVE_POLL_MS }).
 */
export const LIVE_POLL_MS = 2500;
