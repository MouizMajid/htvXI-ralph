import { useParams } from 'react-router-dom';

// TODO(slice 4): header, alerts (+ safeguarding), answers table, conversation (EN + original), check-ins, Call in.
export function PatientView() {
  const { id } = useParams();
  return (
    <main className="min-h-full bg-staff-bg p-6">
      <h1 className="text-2xl font-bold">Visit {id}</h1>
    </main>
  );
}
