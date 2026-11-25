import { footprintOf } from '@roe/sim';
import { useEffect, useMemo } from 'react';
import { DoubleSide, MeshBasicMaterial, Path, Shape, ShapeGeometry } from 'three';
import { useHoverCursor } from '../../input/useHoverCursor';
import { useSelectionInput } from '../../input/useSelectionInput';
import { useGameStore } from '../../state/gameStore';
import { useSelectionStore } from '../../state/selectionStore';

const SELECTION_COLOR = '#ffe08a';
/** Gap between the footprint and the marker frame, and the frame's width. */
const FRAME_GAP = 0.3;
const FRAME_WIDTH = 0.25;

/** A flat rectangular frame (w × d inner size), lying in the XZ plane. */
function frameGeometry(w: number, d: number): ShapeGeometry {
  const ow = w / 2 + FRAME_WIDTH;
  const od = d / 2 + FRAME_WIDTH;
  const outer = new Shape();
  outer.moveTo(-ow, -od).lineTo(ow, -od).lineTo(ow, od).lineTo(-ow, od).closePath();
  const hole = new Path();
  hole
    .moveTo(-w / 2, -d / 2)
    .lineTo(-w / 2, d / 2)
    .lineTo(w / 2, d / 2)
    .lineTo(w / 2, -d / 2)
    .closePath();
  outer.holes.push(hole);
  const geometry = new ShapeGeometry(outer);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** Ground frame around the selected building. */
function BuildingMarker({ buildingId }: { buildingId: number }) {
  const building = useGameStore((s) => s.state.buildings.find((b) => b.id === buildingId));
  const heights = useGameStore((s) => s.heights);
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color: SELECTION_COLOR,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: DoubleSide,
      }),
    [],
  );
  const type = building?.type;
  const rotation = building?.rotation ?? 0;
  const geometry = useMemo(() => {
    if (!type) return null;
    const { w, d } = footprintOf(type, rotation);
    return frameGeometry(w + FRAME_GAP * 2, d + FRAME_GAP * 2);
  }, [type, rotation]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!building || !geometry) return null;
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={[building.x, heights.getHeightAt(building.x, building.z) + 0.06, building.z]}
      rotation={[0, building.rotation, 0]}
      renderOrder={2}
    />
  );
}

/** Selection input, the hover cursor, and markers for whatever is selected. */
export function SelectionMarkers() {
  useSelectionInput();
  useHoverCursor();
  const buildingId = useSelectionStore((s) => s.building);
  return buildingId === null ? null : <BuildingMarker buildingId={buildingId} />;
}
