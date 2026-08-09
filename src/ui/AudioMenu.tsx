import { audioAvailable, playSfx } from '../audio/engine'
import { useGame } from '../store/useGame'

/** Separate switches for music, effects and master volume. Opt-in by default. */
export function AudioMenu() {
  const audio = useGame((s) => s.audio)
  const setAudio = useGame((s) => s.setAudio)
  const available = audioAvailable()

  return (
    <div className="field" style={{ gap: 12 }}>
      {!available && (
        <p className="dialog__sub" role="status">
          This browser will not give the page an audio context, so Little Lines runs silently. Everything
          else works exactly as it should.
        </p>
      )}
      <div className="chips">
        <button
          type="button"
          className="chip"
          aria-pressed={audio.music}
          disabled={!available}
          onClick={() => setAudio({ music: !audio.music })}
        >
          Background music
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={audio.sfx}
          disabled={!available}
          onClick={() => {
            const next = !audio.sfx
            setAudio({ sfx: next })
            if (next) playSfx('whistle')
          }}
        >
          Railway sounds
        </button>
      </div>
      <label htmlFor="volume" className="field">
        <span>Volume — {Math.round(audio.volume * 100)}%</span>
        <input
          id="volume"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={audio.volume}
          disabled={!available}
          onChange={(e) => setAudio({ volume: Number(e.target.value) })}
        />
      </label>
      <p className="dialog__sub" style={{ margin: 0 }}>
        Every sound is synthesised in the browser from oscillators — nothing is downloaded. See
        AUDIO_CREDITS.md in the repository.
      </p>
    </div>
  )
}
