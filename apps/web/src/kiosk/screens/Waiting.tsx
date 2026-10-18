import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Lang } from '@ralph/shared';
import { kioskApi } from '../../lib/api';
import { LIVE_POLL_MS } from '../../staff/live';
import { WaitingHub } from './WaitingHub';

/**
 * Waits to be called in (polls visit status) while giving the child access to
 * the WaitingHub (games, chat with Ralph) and Ralph's check-ins, which the server schedules
 * (`next_checkin_at`) and the hub shows at a natural break.
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
  const { data, refetch } = useQuery({
    queryKey: ['visit-status', visitId],
    queryFn: () => kioskApi.status(visitId),
    refetchInterval: LIVE_POLL_MS,
    enabled: Boolean(visitId && visitId !== 'demo'),
  });

  const onCheckinSaved = useCallback(() => void refetch(), [refetch]);

  useEffect(() => {
    if (data && data.status !== 'waiting') onCalledIn();
  }, [data, onCalledIn]);

  return (
    <WaitingHub
      visitId={visitId}
      initialName={childName || 'Maya'}
      initialAge={ageYears}
      language={lang}
      nextCheckinAt={data?.next_checkin_at ?? null}
      onCheckinSaved={onCheckinSaved}
    />
  );
}
