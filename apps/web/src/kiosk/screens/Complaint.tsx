import { useTranslation } from 'react-i18next';
import { COMPLAINTS, type Complaint as ComplaintId } from '@ralph/shared';
import { Shell } from '../components/Shell';
import { BigButton } from '../components/BigButton';
import { Icon } from '../components/Icon';

const ICON_FALLBACK: Record<ComplaintId, string> = { tummy: '🤢', fever: '🤒', breathing: '😮‍💨', other: '🤕' };

export function Complaint({
  onPick,
  busy,
  error,
  subline,
}: {
  onPick: (c: ComplaintId) => void;
  busy: boolean;
  error: boolean;
  subline?: string;
}) {
  const { t } = useTranslation();
  return (
    <Shell pose={busy ? 'think' : 'listen'} line={t('complaint.ask')} subline={subline} error={error}>
      <div className="grid grid-cols-2 gap-3">
        {COMPLAINTS.map((c) => (
          <BigButton
            key={c}
            disabled={busy}
            onClick={() => onPick(c)}
            className="aspect-square flex-col text-xl"
            icon={<Icon name={`complaint-${c}`} fallback={ICON_FALLBACK[c]} className="size-20 text-6xl" />}
          >
            {t(`complaint.${c}`)}
          </BigButton>
        ))}
      </div>
    </Shell>
  );
}
