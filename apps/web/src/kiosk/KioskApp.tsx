import { useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import { Welcome } from './screens/Welcome';
import { WaitingHub } from './screens/WaitingHub';
import { FireflyTap } from './games/GameOne';
import { CyberCircuit } from './games/GameTwo';
import { Companion } from './screens/Companion';

// Session flow: Welcome → WaitingHub (Games + Timed Companion Check-ins).
// Direct sub-routes (/kiosk/waiting, /kiosk/games/firefly, /kiosk/games/cyber,
// /kiosk/companion) are also mounted for easy testing and integration.
export function KioskApp() {
  const [started, setStarted] = useState(false);

  return (
    <main className="min-h-full bg-bg">
      <Routes>
        <Route path="waiting" element={<WaitingHub />} />
        <Route path="games/firefly" element={<FireflyTap onFinish={() => {}} />} />
        <Route path="games/cyber" element={<CyberCircuit onFinish={() => {}} />} />
        <Route path="companion" element={<Companion />} />
        <Route
          index
          element={
            started ? <WaitingHub /> : <Welcome onStart={() => setStarted(true)} />
          }
        />
      </Routes>
    </main>
  );
}
