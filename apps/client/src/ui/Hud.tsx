import { useSettingsStore } from '../state/settingsStore';

const CONTROLS: readonly [key: string, action: string][] = [
  ['W A S D / Arrows', 'Pan camera'],
  ['Left drag', 'Pan camera'],
  ['Right drag', 'Rotate camera'],
  ['Mouse wheel', 'Zoom'],
];

export function Hud() {
  const shadows = useSettingsStore((s) => s.shadows);
  const showStats = useSettingsStore((s) => s.showStats);
  const toggleShadows = useSettingsStore((s) => s.toggleShadows);
  const toggleStats = useSettingsStore((s) => s.toggleStats);

  return (
    <div className="hud">
      <header className="hud-panel hud-title">
        <h1>Realms of Eternia</h1>
        <p>Rendering prototype</p>
      </header>

      <section className="hud-panel hud-settings" aria-label="Settings">
        <label>
          <input type="checkbox" checked={shadows} onChange={toggleShadows} />
          Shadows
        </label>
        <label>
          <input type="checkbox" checked={showStats} onChange={toggleStats} />
          FPS stats
        </label>
      </section>

      <section className="hud-panel hud-controls" aria-label="Controls">
        <dl>
          {CONTROLS.map(([key, action]) => (
            <div key={key} style={{ display: 'contents' }}>
              <dt>{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
