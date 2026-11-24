import { GameCanvas } from './render/GameCanvas';
import { ConstructionMenu } from './ui/ConstructionMenu';
import { Hud } from './ui/Hud';
import { SelectionPanel } from './ui/SelectionPanel';

export function App() {
  return (
    <div className="app">
      <GameCanvas />
      <Hud />
      <ConstructionMenu />
      <SelectionPanel />
    </div>
  );
}
