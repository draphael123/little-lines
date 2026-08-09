/**
 * The look of the sky, the light and the sea. Ground colour lives with the
 * terrain surface, which is the only thing that needs it.
 */
/* ------------------------------------------------------------------- mood */

export interface SceneMood {
  sky: string
  horizon: string
  fog: string
  fogDensity: number
  sun: { colour: string; intensity: number; position: [number, number, number] }
  fill: { colour: string; intensity: number }
  hemi: { sky: string; ground: string; intensity: number }
  sea: string
  seaRoughness: number
  windows: string
  windowGlow: number
}

export const DAY: SceneMood = {
  sky: '#9fc4dd',
  horizon: '#cfe0e8',
  fog: '#c3d6e0',
  fogDensity: 0.012,
  // Kept deliberately low. ACES tone mapping desaturates anything much over
  // 1.0, and at 2.9 the whole landscape washed out to cream whatever colour
  // the ground actually was.
  sun: { colour: '#fff3dd', intensity: 1.15, position: [8, 12, 5] },
  fill: { colour: '#9db9d4', intensity: 0.3 },
  // Skylight has to carry the shaded side of every wall on its own. Too low
  // and north-facing elevations render as black cut-outs.
  hemi: { sky: '#b4d2e6', ground: '#6a6050', intensity: 0.72 },
  sea: '#2f7093',
  seaRoughness: 0.16,
  windows: '#000000',
  windowGlow: 0,
}

export const NIGHT: SceneMood = {
  sky: '#101720',
  horizon: '#1b2733',
  fog: '#15202b',
  fogDensity: 0.022,
  sun: { colour: '#9fb8dc', intensity: 0.4, position: [-7, 10, -6] },
  fill: { colour: '#3d5876', intensity: 0.2 },
  hemi: { sky: '#3d5a78', ground: '#1d1a16', intensity: 0.5 },
  sea: '#152f45',
  seaRoughness: 0.1,
  windows: '#ffbf63',
  windowGlow: 1,
}

export const moodFor = (night: boolean): SceneMood => (night ? NIGHT : DAY)
