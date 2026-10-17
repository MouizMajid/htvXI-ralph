import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { kioskApi } from '../../lib/api';
import { LIVE_POLL_MS } from '../../staff/live';
import { Shell } from '../components/Shell';

/** Waits to be called in (polls status). Games + check-ins arrive in slice 7. */
export function Waiting({ visitId, childName, onCalledIn }: { visitId: string; childName: string; onCalledIn: () => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['visit-status', visitId],
    queryFn: () => kioskApi.status(visitId),
    refetchInterval: LIVE_POLL_MS,
  });

  useEffect(() => {
    if (data && data.status !== 'waiting') onCalledIn();
  }, [data, onCalledIn]);

  return (
    <Shell pose="idle" big line={t('waiting.title', { name: childName })}>
      <p className="rounded-card bg-surface p-6 text-center text-xl font-semibold text-ink-muted shadow-soft">{t('waiting.games')}</p>
    </Shell>
  );
}
