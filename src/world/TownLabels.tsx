/**
 * Place names over the country.
 *
 * As much a usability fix as a flourish: the side panel lists eleven names and
 * the map showed eleven anonymous clusters, so there was no way to tell which
 * was which without hovering for coordinates.
 *
 * Drawn as canvas textures on sprites rather than DOM overlays — they always
 * face the camera, cost one draw call each, and never fall out of step with
 * the scene the way absolutely-positioned HTML does. Labels fade out when the
 * camera is far enough away that they would be a wall of text, and the state
 * of the place is carried in the colour of its dot.
 */
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CanvasTexture, SRGBColorSpace, type PerspectiveCamera, type Sprite } from 'three'
import { heightAt, type Heightfield } from './heightfield'
import type { TownReport } from './towns'
import { townRadius } from './townLayout'

const STATE_COLOUR: Record<TownReport['state'], string> = {
  growing: '#7ec98f',
  full: '#f0b357',
  isolated: '#6fa8d6',
  declining: '#e2604c',
  unserved: '#9aa6b2',
}

/** Kept so a name is only ever rasterised once. */
const cache = new Map<string, CanvasTexture>()

function labelTexture(name: string, population: number, colour: string): CanvasTexture {
  const text = `${name}  ${Math.round(population).toLocaleString()}`
  const key = `${text}|${colour}`
  const hit = cache.get(key)
  if (hit) return hit

  const scale = 2 // drawn at twice the size, so it stays crisp close up
  const font = `600 ${17 * scale}px "Inter var", Inter, "Segoe UI", system-ui, sans-serif`
  const measure = document.createElement('canvas').getContext('2d')!
  measure.font = font
  const dot = 9 * scale
  const padX = 12 * scale
  const width = Math.ceil(measure.measureText(text).width + padX * 2 + dot + 7 * scale)
  const height = 30 * scale

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!

  const radius = height / 2
  ctx.fillStyle = 'rgba(14, 19, 25, 0.74)'
  ctx.beginPath()
  ctx.roundRect(0, 0, width, height, radius)
  ctx.fill()
  ctx.strokeStyle = 'rgba(226, 236, 245, 0.16)'
  ctx.lineWidth = 1 * scale
  ctx.stroke()

  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.arc(padX + dot / 2, height / 2, dot / 2, 0, Math.PI * 2)
  ctx.fill()

  ctx.font = font
  ctx.fillStyle = '#e9eff5'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, padX + dot + 7 * scale, height / 2 + 1 * scale)

  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 4
  cache.set(key, texture)
  return texture
}

/** Metres of camera distance beyond which labels are more clutter than help. */
const FADE_FROM = 1500
const FADE_TO = 2600

export function TownLabels({ field, reports }: { field: Heightfield; reports: TownReport[] }) {
  const camera = useThree((s) => s.camera)
  const sprites = useRef<Array<Sprite | null>>([])

  const labels = useMemo(
    () =>
      reports.map((r) => ({
        key: r.settlement.id,
        // clear of the rooftops, and rising as the place grows
        y: heightAt(field, r.settlement.x, r.settlement.z),
        x: r.settlement.x,
        z: r.settlement.z,
        lift: 34 + townRadius(r.settlement.population) * 0.06,
        texture: labelTexture(
          r.settlement.name,
          r.settlement.population,
          STATE_COLOUR[r.state],
        ),
      })),
    [field, reports],
  )

  useEffect(() => {
    sprites.current = sprites.current.slice(0, labels.length)
  }, [labels])

  /** How tall a label should be on screen, in pixels. */
  const PIXELS = 27

  useFrame(({ size }) => {
    const height = Math.max(1, camera.position.y)
    const fade =
      1 - Math.max(0, Math.min(1, (height - FADE_FROM) / (FADE_TO - FADE_FROM)))

    // Metres per screen pixel at one metre of depth, for this camera and this
    // viewport. Multiplying by the distance to a label gives the world height
    // that renders as a constant number of pixels, so a name reads the same
    // whether the place is under the camera or across the region.
    const perPixel =
      (2 * Math.tan(((camera as PerspectiveCamera).fov * Math.PI) / 360)) / Math.max(1, size.height)

    for (const sprite of sprites.current) {
      if (!sprite) continue
      sprite.visible = fade > 0.02
      const material = sprite.material as { opacity: number }
      material.opacity = fade

      const world = camera.position.distanceTo(sprite.position) * perPixel * PIXELS
      const image = sprite.material.map?.image as HTMLCanvasElement | undefined
      const aspect = image ? image.width / image.height : 6
      sprite.scale.set(world * aspect, world, 1)
    }
  })

  return (
    <group name="labels" raycast={() => null}>
      {labels.map((label, i) => (
        <sprite
          key={label.key}
          position={[label.x, label.y + label.lift, label.z]}
          ref={(el) => {
            sprites.current[i] = el
          }}
        >
          <spriteMaterial
            map={label.texture}
            transparent
            depthTest={false}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  )
}
