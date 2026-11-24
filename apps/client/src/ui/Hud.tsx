import { useSettingsStore } from '../state/settingsStore';

const CONTROLS: readonly [key: string, action: string][] = [
  ['Left click', 'Select unit / building'],
  ['Left drag', 'Box select (Shift adds)'],
  ['Right click', 'Move / build'],
  ['Right drag', 'Rotate camera'],
  ['W A S D / Middle drag / Edge', 'Pan camera'],
  ['Mouse wheel', 'Zoom'],
];

export function Hud() {
  const shadows = useSettingsStore((s) => s.shadows);
  const showStats = useSettingsStore((s) => s.showStats);
  const toggleShadows = useSettingsStore((s) => s.toggleShadows);
  const toggleStats = useSettingsStore((s) => s.toggleStats);
  const edgeScroll = useSettingsStore((s) => s.edgeScroll);
  const toggleEdgeScroll = useSettingsStore((s) => s.toggleEdgeScroll);

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
        <label>
          <input type="checkbox" checked={edgeScroll} onChange={toggleEdgeScroll} />
          Edge scrolling
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
