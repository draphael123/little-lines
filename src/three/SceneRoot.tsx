import { useMemo } from 'react'
import { surveyCountry } from '../game/economy'
import { keyOf } from '../game/grid'
import { tilesInclude } from '../game/track'
import type { Coord, RailLine } from '../game/types'
import { useGame, worldForLevel } from '../store/useGame'
import { CameraRig } from './CameraRig'
import { Environment } from './Environment'
import { hoverToneFor, resolveLevel } from './hover'
import { Markers } from './Markers'
import { moodFor } from './palette'
import { Scenery } from './Scenery'
import { Settlements } from './Settlements'
import { Terrain } from './Terrain'
import { TownLife } from './TownLife'
import { DeliveryTrain, FreeTrains } from './Trains'
import { TrackLines } from './TrackLines'

/** Everything inside the WebGL canvas. */
export function SceneRoot() {
  const mode = useGame((s) => s.mode)
  const night = useGame((s) => s.night)
  const hovered = useGame((s) => s.hovered)
  const hint = useGame((s) => s.hint)
  const camera = useGame((s) => s.camera)
  const cameraNonce = useGame((s) => s.cameraNonce)
  const route = useGame((s) => s.route)
  const puzzleRunning = useGame((s) => s.puzzleRunning)
  const levelId = useGame((s) => s.levelId)
  const free = useGame((s) => s.free)

  const level = useMemo(() => resolveLevel(levelId), [levelId])
  const world = mode === 'puzzle' ? worldForLevel(level) : free.world
  const mood = moodFor(night)

  // Lighting and shadows grow with the map, or a grand layout ends up with the
  // sun inside it and half the survey outside the shadow frustum.
  const span = Math.hypot(world.w, world.h)
  const lightScale = Math.max(1, span / 10)
  const shadowHalf = span * 0.8
  const fogDensity = mood.fogDensity * (14 / Math.max(14, span))

  const lines = useMemo<RailLine[]>(
    () => (mode === 'puzzle' ? (route.length >= 1 ? [{ id: 'campaign', tiles: route }] : []) : free.lines),
    [mode, route, free.lines],
  )

  const tone = useMemo(() => hoverToneFor(useGame.getState(), world, hovered), [world, hovered])

  const stopsServed = useMemo(
    () => level.stops.filter((s) => tilesInclude(route, s)).map(keyOf),
    [level.stops, route],
  )

  const country = useMemo(
    () => (mode === 'free' ? surveyCountry(free.world, free.lines, free.settlements, free.trains) : []),
    [mode, free.world, free.lines, free.settlements, free.trains],
  )

  const handlePick = (c: Coord) => {
    const state = useGame.getState()
    if (state.mode === 'puzzle') state.tapPuzzleTile(c)
    else state.tapFreeTile(c)
  }
  const handleHover = (c: Coord | null) => useGame.getState().setHovered(c)

  return (
    <>
      <color attach="background" args={[mood.horizon]} />
      <fogExp2 attach="fog" args={[mood.fog, fogDensity]} />

      <hemisphereLight args={[mood.hemi.sky, mood.hemi.ground, mood.hemi.intensity]} />
      <directionalLight
        position={[
          mood.sun.position[0] * lightScale,
          mood.sun.position[1] * lightScale,
          mood.sun.position[2] * lightScale,
        ]}
        intensity={mood.sun.intensity}
        color={mood.sun.colour}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
        shadow-camera-left={-shadowHalf}
        shadow-camera-right={shadowHalf}
        shadow-camera-top={shadowHalf}
        shadow-camera-bottom={-shadowHalf}
        shadow-camera-near={0.5}
        shadow-camera-far={shadowHalf * 6}
      />
      <directionalLight
        position={[-6 * lightScale, 5 * lightScale, -7 * lightScale]}
        intensity={mood.fill.intensity}
        color={mood.fill.colour}
      />

      <Environment world={world} mood={mood} />
      <Terrain world={world} onPick={handlePick} onHover={handleHover} />
      <TrackLines world={world} lines={lines} />
      <Scenery world={world} night={night} />

      {mode === 'puzzle' ? (
        <>
          <Markers
            world={world}
            depot={level.depot}
            destination={level.destination}
            stops={level.stops}
            stopsServed={stopsServed}
            hovered={hovered}
            hoverTone={tone}
            hint={hint}
          />
          <DeliveryTrain
            world={world}
            tiles={route}
            running={puzzleRunning}
            night={night}
            onArrive={() => useGame.getState().completeDelivery()}
          />
        </>
      ) : (
        <>
          <Markers
            world={world}
            hovered={hovered}
            hoverTone={tone}
            settlements={country.map((r) => ({
              at: { x: r.settlement.x, z: r.settlement.z },
              growing: r.state === 'growing' || r.state === 'full',
            }))}
          />
          <Settlements world={world} lines={free.lines} settlements={free.settlements} night={night} />
          <TownLife
            world={world}
            lines={free.lines}
            settlements={free.settlements}
            running={free.running}
            night={night}
          />
          <FreeTrains
            world={world}
            lines={free.lines}
            count={free.trains}
            speed={free.speed}
            running={free.running}
            night={night}
          />
        </>
      )}

      <CameraRig world={world} preset={camera} nonce={cameraNonce} />
    </>
  )
}
