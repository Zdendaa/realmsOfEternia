import { Component, Suspense, type ReactNode } from 'react';
import { BakedUnits } from './baked/BakedUnits';
import { PlaceholderUnits } from './PlaceholderUnits';

/** Shows `fallback` if the character models fail to load or bake. */
class ModelFallback extends Component<{ fallback: ReactNode; children: ReactNode }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.warn('Character models unavailable, using placeholder serfs:', error);
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/**
 * All units. Character models with baked animation once they have loaded; primitive
 * placeholder serfs while loading, or if loading fails. Both read the same per-frame
 * unit data from `UnitFrameDriver`.
 */
export function Units() {
  return (
    <ModelFallback fallback={<PlaceholderUnits />}>
      <Suspense fallback={<PlaceholderUnits />}>
        <BakedUnits />
      </Suspense>
    </ModelFallback>
  );
}
