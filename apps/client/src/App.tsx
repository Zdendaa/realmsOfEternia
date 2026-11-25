import { GameCanvas } from './render/GameCanvas';
import { ConstructionMenu } from './ui/ConstructionMenu';
import { DevSpawnPanel } from './ui/dev/DevSpawnPanel';
import { Hud } from './ui/Hud';
import { ResourceBar } from './ui/ResourceBar';
import { SelectionBox } from './ui/SelectionBox';
import { SelectionPanel } from './ui/SelectionPanel';

export function App() {
  return (
    <div className="app">
      <GameCanvas />
      <Hud />
      <ResourceBar />
      <ConstructionMenu />
      <SelectionPanel />
      <SelectionBox />
      {import.meta.env.DEV && <DevSpawnPanel />}
    </div>
  );
}
