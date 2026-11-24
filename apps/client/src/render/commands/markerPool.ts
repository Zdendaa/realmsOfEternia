import { BUILDINGS } from '@roe/game-data';
import {
  CanvasTexture,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  PlaneGeometry,
  Quaternion,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  type IUniform,
} from 'three';
import { LOCAL_PLAYER, useGameStore } from '../../state/gameStore';
import hammerIconUrl from '../../ui/cursors/build.svg';
import { ownerColor } from '../units/unitColors';
import { commandFeedback, type CommandFeedback } from './commandFeedback';
import { createMarkerMaterial, MARKER_DURATION, MARKER_KIND } from './markerMaterial';

/** Ground markers alive at once; the oldest is reused when the pool is full. */
const GROUND_POOL = 16;
/** Hammer icons alive at once. */
const ICON_POOL = 4;
/** Side of the move marker's quad (world units). */
const MOVE_SIZE = 3.2;
/** The site marker's quad extends this far beyond the footprint on each side. */
const SITE_MARGIN = 1.2;
/** Hammer icon size and height above the site's ground (above the capped scaffold). */
const ICON_SIZE = 2.6;
const ICON_HEIGHT = 5.6;

const matrix = new Matrix4();
const position = new Vector3();
const quaternion = new Quaternion();
const scale = new Vector3();
const up = new Vector3(0, 1, 0);
const normal = new Vector3();

/** Rasterizes the hammer cursor SVG at icon resolution (an <img> SVG would be 64 px). */
function loadIconTexture(url: string) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const image = new Image();
  image.onload = () => {
    canvas.getContext('2d')?.drawImage(image, 0, 0, 256, 256);
    texture.needsUpdate = true;
  };
  image.src = url;
  return texture;
}

interface Icon {
  sprite: Sprite;
  material: SpriteMaterial;
  start: number;
}

/** Terrain normal at (x, z) from the height field, by central differences. */
function terrainNormal(x: number, z: number, target: Vector3) {
  const { heights } = useGameStore.getState();
  const e = 0.5;
  return target
    .set(
      heights.getHeightAt(x - e, z) - heights.getHeightAt(x + e, z),
      2 * e,
      heights.getHeightAt(x, z - e) - heights.getHeightAt(x, z + e),
    )
    .normalize();
}

export interface MarkerPool {
  /** One instanced quad for all ground markers. */
  ground: InstancedMesh;
  /** Hammer icon sprites, hidden while unused. */
  sprites: readonly Sprite[];
  /** Spawns queued markers and animates the live ones. */
  update(now: number): void;
  dispose(): void;
}

/**
 * Fixed pools for command markers: a 16-slot instanced ground quad (move and site
 * markers, animated in the shader) and four hammer sprites (animated here). Spawning
 * overwrites the oldest slot; nothing is allocated per marker.
 */
export function createMarkerPool(): MarkerPool {
  const geometry = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const markerAttr = new InstancedBufferAttribute(new Float32Array(GROUND_POOL * 4), 4);
  const colorAttr = new InstancedBufferAttribute(new Float32Array(GROUND_POOL * 3), 3);
  // Unused slots start far in the past, so the shader discards them.
  for (let i = 0; i < GROUND_POOL; i++) markerAttr.setX(i, -1e6);
  geometry.setAttribute('aMarker', markerAttr);
  geometry.setAttribute('aColor', colorAttr);
  const material = createMarkerMaterial();
  const uTime = material.uniforms.uTime as IUniform<number>;
  const ground = new InstancedMesh(geometry, material, GROUND_POOL);
  ground.frustumCulled = false;
  ground.renderOrder = 3;
  ground.visible = false;

  const iconTexture = loadIconTexture(hammerIconUrl);
  const icons: Icon[] = Array.from({ length: ICON_POOL }, () => {
    const iconMaterial = new SpriteMaterial({
      map: iconTexture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    const sprite = new Sprite(iconMaterial);
    sprite.visible = false;
    sprite.renderOrder = 10;
    return { sprite, material: iconMaterial, start: -1e6 };
  });

  let nextGround = 0;
  let nextIcon = 0;
  let activeUntil = -1;

  function spawnGround(now: number, kind: number, sizeX: number, sizeZ: number) {
    const slot = nextGround;
    nextGround = (slot + 1) % GROUND_POOL;
    ground.setMatrixAt(slot, matrix.compose(position, quaternion, scale.set(sizeX, 1, sizeZ)));
    const color = ownerColor(LOCAL_PLAYER);
    markerAttr.setXYZW(slot, now, kind, sizeX, sizeZ);
    colorAttr.setXYZ(slot, color.r, color.g, color.b);
    ground.instanceMatrix.needsUpdate = true;
    markerAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
    const duration = kind === MARKER_KIND.move ? MARKER_DURATION.move : MARKER_DURATION.site;
    activeUntil = Math.max(activeUntil, now + duration);
  }

  function spawn(now: number, event: CommandFeedback) {
    if (event.kind === 'move') {
      // Lie on the slope: tilt the quad to the terrain normal.
      quaternion.setFromUnitVectors(up, terrainNormal(event.x, event.z, normal));
      position.set(event.x, event.y + 0.08, event.z);
      spawnGround(now, MARKER_KIND.move, MOVE_SIZE, MOVE_SIZE);
      return;
    }
    const { site, groundY } = event;
    const { w, d } = BUILDINGS[site.type].footprint;
    quaternion.setFromAxisAngle(up, site.rotation);
    position.set(site.x, groundY + 0.1, site.z);
    spawnGround(now, MARKER_KIND.site, w + 2 * SITE_MARGIN, d + 2 * SITE_MARGIN);

    const icon = icons[nextIcon] as Icon;
    nextIcon = (nextIcon + 1) % ICON_POOL;
    icon.start = now;
    icon.sprite.position.set(site.x, groundY + ICON_HEIGHT, site.z);
    icon.sprite.visible = true;
  }

  return {
    ground,
    sprites: icons.map((icon) => icon.sprite),
    update(now) {
      commandFeedback.drain((event) => spawn(now, event));
      uTime.value = now;
      ground.visible = now < activeUntil;

      for (const icon of icons) {
        if (!icon.sprite.visible) continue;
        const t = (now - icon.start) / MARKER_DURATION.site;
        if (t >= 1) {
          icon.sprite.visible = false;
          continue;
        }
        // Pop in with a slight overshoot, swing like a hammer strike, then fade.
        const pop = t < 0.2 ? Math.sin((t / 0.2) * Math.PI * 0.6) / Math.sin(Math.PI * 0.6) : 1;
        const overshoot = t < 0.2 ? 1 + 0.25 * Math.sin((t / 0.2) * Math.PI) : 1;
        icon.sprite.scale.setScalar(ICON_SIZE * pop * overshoot);
        icon.material.rotation = 0.45 * Math.sin(t * Math.PI * 4) * (1 - t);
        icon.material.opacity = 1 - Math.max(0, (t - 0.6) / 0.4);
      }
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      iconTexture.dispose();
      for (const icon of icons) icon.material.dispose();
    },
  };
}
