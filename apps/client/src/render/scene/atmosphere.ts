/** Shared look-and-feel constants, so sky, fog and lights stay consistent. */
export const ATMOSPHERE = {
  skyZenith: '#5f8fc9',
  /** Horizon and fog use one color so distant terrain melts into the sky. */
  skyHorizon: '#cfdde6',
  fogNear: 90,
  fogFar: 340,
  hemisphereSky: '#d6e6ff',
  hemisphereGround: '#4f5a35',
  hemisphereIntensity: 0.9,
  sunColor: '#ffe2b8',
  sunIntensity: 2.8,
  /** Low afternoon sun from the side of the default view, for readable shadows. */
  sunPosition: [-70, 55, 50] as [number, number, number],
  toneMappingExposure: 1.05,
} as const;
