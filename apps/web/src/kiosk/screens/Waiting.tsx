import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Lang } from '@ralph/shared';
import { kioskApi } from '../../lib/api';
import { LIVE_POLL_MS } from '../../staff/live';
import { WaitingHub } from './WaitingHub';

/**
 * Waits to be called in (polls visit status) while giving the child access to
 * the WaitingHub (Firefly Tap, Cyber Circuit: Firewall Hacker, Companion chat,
 * 12-minute automatic check-in with Mute button, and live Nurse / Wait Time card).
 */
export function Waiting({
  visitId,
  childName,
  ageYears = 7,
  lang = 'en',
  onCalledIn,
}: {
  visitId: string;
  childName: string;
  ageYears?: number;
  lang?: Lang;
  onCalledIn: () => void;
}) {
  const { data } = useQuery({
    queryKey: ['visit-status', visitId],
    queryFn: () => kioskApi.status(visitId),
    refetchInterval: LIVE_POLL_MS,
    enabled: Boolean(visitId && visitId !== 'demo'),
  });

  useEffect(() => {
    if (data && data.status !== 'waiting') onCalledIn();
  }, [data, onCalledIn]);

  return (
    <WaitingHub
      visitId={visitId}
      initialName={childName || 'Maya'}
      initialAge={ageYears}
      language={lang}
      initialAssignedNurse={data?.assigned_nurse}
      initialWaitMinutes={data?.estimated_wait_minutes}
      initialQueuePosition={data?.queue_position}
    />
  );
}
