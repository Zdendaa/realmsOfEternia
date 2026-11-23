/** Shared look-and-feel constants, so sky, fog and lights stay consistent. */
export const ATMOSPHERE = {
  skyZenith: '#5f8fc9',
  /** Horizon and fog use one color so distant terrain melts into the sky. */
  skyHorizon: '#cfdde6',
  fogNear: 90,
  fogFar: 340,
  hemisphereSky: '#d6e6ff',
  hemisphereGround: '#4f5a35',
  hemisphereIntensity: 1.15,
  sunColor: '#ffe2b8',
  sunIntensity: 2.5,
  /** Sun direction (offset from the focus point): ~48° elevation, from the side of the default view. */
  sunPosition: [-70, 95, 50] as [number, number, number],
  /** 0 = no shadow, 1 = fully dark. Lower keeps shaded areas readable. */
  shadowIntensity: 0.72,
  toneMappingExposure: 1.05,
} as const;
