import { useParams } from 'react-router-dom';

// TODO(Tier 1 #6): summary card, why flagged, trends, transcript, opener, briefing, actions.
export function PatientView() {
  const { id } = useParams();
  return (
    <main className="min-h-full bg-staff-bg p-6">
      <h1 className="text-2xl font-bold">Visit {id}</h1>
    </main>
  );
}
