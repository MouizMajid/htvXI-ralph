import { Welcome } from './screens/Welcome';

// TODO(Tier 1 #2): session useReducer driving Welcome → Language → WhoIsHere →
// Complaint → Conversation → ParentConfirm → Games/Waiting.
export function KioskApp() {
  return (
    <main className="min-h-full bg-bg">
      <Welcome onStart={() => {}} />
    </main>
  );
}
