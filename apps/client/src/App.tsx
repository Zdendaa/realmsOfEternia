import { GameCanvas } from './render/GameCanvas';
import { AimHint } from './ui/AimHint';
import { ConstructionMenu } from './ui/ConstructionMenu';
import { AiInspector } from './ui/dev/AiInspector';
import { DevSpawnPanel } from './ui/dev/DevSpawnPanel';
import { HeroStrip } from './ui/heroes/HeroStrip';
import { Hud } from './ui/Hud';
import { Minimap } from './ui/minimap/Minimap';
import { ResourceBar } from './ui/ResourceBar';
import { SelectionBox } from './ui/SelectionBox';
import { SelectionPanel } from './ui/SelectionPanel';
import { OutcomeOverlay } from './ui/OutcomeOverlay';
import { WaveAlert } from './ui/WaveAlert';

export function App() {
  return (
    <div className="app">
      <GameCanvas />
      <Hud />
      <ResourceBar />
      <Minimap />
      <HeroStrip />
      <ConstructionMenu />
      <SelectionPanel />
      <SelectionBox />
      <AimHint />
      <WaveAlert />
      <OutcomeOverlay />
      {import.meta.env.DEV && <DevSpawnPanel />}
      {import.meta.env.DEV && <AiInspector />}
    </div>
  );
}
