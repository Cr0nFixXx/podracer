import { useCallback, useEffect, useState } from 'react';
import { loadProfile, saveProfile, type Profile } from './game/settings';
import { Garage, MainMenu, RaceSetup, SettingsScreen } from './ui/screens';
import RaceView from './ui/RaceView';
import { PadLegend, usePadNav } from './ui/usePadNav';

type Screen = 'menu' | 'setup' | 'garage' | 'settings' | 'race';

export default function App() {
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [screen, setScreen] = useState<Screen>('menu');
  useEffect(() => { saveProfile(profile); }, [profile]);
  const update = useCallback((fn: (p: Profile) => Profile) => setProfile(fn), []);
  const go = (s: string) => setScreen(s as Screen);
  usePadNav(); // the gamepad also works in the menus: D-pad / stick move the focus, A presses, B goes back (ui/usePadNav.tsx)

  return (
    <div className="w-screen h-screen overflow-hidden bg-black text-white">
      {screen === 'menu' && <MainMenu profile={profile} go={go} />}
      {screen === 'setup' && <RaceSetup profile={profile} update={update} go={go} start={() => setScreen('race')} />}
      {screen === 'garage' && <Garage profile={profile} update={update} go={go} />}
      {screen === 'settings' && <SettingsScreen profile={profile} update={update} go={go} />}
      {screen !== 'race' && <PadLegend />}
      {screen === 'race' && (
        <RaceView
          profile={profile}
          update={update}
          onExit={() => setScreen('setup')}
          onBest={(id, t) => setProfile(p => (!p.best[id] || t < p.best[id] ? { ...p, best: { ...p.best, [id]: t } } : p))}
        />
      )}
    </div>
  );
}
