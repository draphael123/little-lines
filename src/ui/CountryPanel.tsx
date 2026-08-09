import {
  MILESTONES,
  SIZE_UNLOCKS,
  TIER_LABEL,
  nextMilestone,
  type SettlementReport,
} from '../game/economy'
import { useGame } from '../store/useGame'

const STATE_LABEL: Record<SettlementReport['state'], string> = {
  unserved: 'No station',
  isolated: 'No link',
  growing: 'Growing',
  full: 'At capacity',
}

const STATE_COLOUR: Record<SettlementReport['state'], string> = {
  unserved: 'var(--signal)',
  isolated: 'var(--brass)',
  growing: 'var(--good)',
  full: 'var(--slate)',
}

/** The scoreboard of the Free Build loop: who is growing, and why not. */
export function CountryPanel({ country }: { country: SettlementReport[] }) {
  const free = useGame((s) => s.free)
  const best = useGame((s) => s.career.bestPopulation)
  const population = Math.round(country.reduce((n, r) => n + r.settlement.population, 0))
  const growing = country.filter((r) => r.state === 'growing' || r.state === 'full').length
  const { next, progress } = nextMilestone(best)

  return (
    <section className="card" aria-labelledby="country-title">
      <p className="card__eyebrow" id="country-title">
        The country
      </p>
      <dl className="readout">
        <div>
          <dt>Population</dt>
          <dd>{population.toLocaleString()}</dd>
        </div>
        <div>
          <dt>Served</dt>
          <dd>
            {growing} <small>/ {country.length} places</small>
          </dd>
        </div>
        <div>
          <dt>Account</dt>
          <dd className={free.balance < 60 ? 'over' : undefined}>
            £{Math.floor(free.balance).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt>Passengers</dt>
          <dd>{Math.floor(free.passengers).toLocaleString()}</dd>
        </div>
      </dl>

      {next && (
        <div style={{ marginTop: 12 }}>
          <p className="card__sub" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>Next: {next.title}</span>
            <span>
              {best} / {next.population}
            </span>
          </p>
          <div
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={next.population}
            aria-valuenow={Math.min(best, next.population)}
            aria-label={`Progress to ${next.title}`}
            style={{
              height: 5,
              background: 'var(--line)',
              marginTop: 6,
              border: '1px solid var(--line)',
            }}
          >
            <div
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                background: 'var(--brass)',
              }}
            />
          </div>
          <p className="card__sub" style={{ marginTop: 6 }}>
            {next.detail}
          </p>
        </div>
      )}
      {!next && (
        <p className="card__sub" style={{ marginTop: 12 }}>
          Every milestone in the register has been passed. {MILESTONES.length} of{' '}
          {MILESTONES.length}.
        </p>
      )}

      {country.length > 0 && (
        <ul
          style={{ listStyle: 'none', margin: '14px 0 0', padding: 0, display: 'grid', gap: 1, background: 'var(--line)', border: '1px solid var(--line)' }}
        >
          {[...country]
            .sort((a, b) => b.settlement.population - a.settlement.population)
            .map((report) => (
              <li
                key={report.settlement.id}
                style={{
                  background: 'var(--card)',
                  padding: '8px 10px',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '2px 10px',
                  alignItems: 'baseline',
                }}
              >
                <b style={{ fontFamily: 'var(--display)', fontWeight: 400, fontSize: 15 }}>
                  {report.settlement.name}
                </b>
                <span style={{ fontFamily: 'var(--display)', fontSize: 15 }}>
                  {Math.round(report.settlement.population)}
                </span>
                <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
                  {TIER_LABEL[report.tier]} · site {Math.round(report.quality * 100)}%
                </span>
                <span
                  style={{
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: STATE_COLOUR[report.state],
                    textAlign: 'right',
                  }}
                >
                  {STATE_LABEL[report.state]}
                </span>
              </li>
            ))}
        </ul>
      )}
      {country.length === 0 && (
        <p className="card__body">
          No settlements on this table. Grow a landscape and a few hamlets will find likely
          ground — flat, sheltered, and within sight of water.
        </p>
      )}

      <p className="card__sub" style={{ marginTop: 12 }}>
        Wide table at {SIZE_UNLOCKS.wide} people, grand table at {SIZE_UNLOCKS.grand}. Your best
        country is remembered across worlds.
      </p>
    </section>
  )
}

/** A quiet congratulation when a milestone falls. */
export function MilestoneToast() {
  const milestone = useGame((s) => s.milestone)
  const dismiss = useGame((s) => s.dismissMilestone)
  if (!milestone) return null
  const detail = MILESTONES.find((m) => m.title === milestone)?.detail
  return (
    <section className="card" style={{ borderColor: 'var(--brass)' }} aria-live="polite">
      <p className="card__eyebrow">Milestone</p>
      <h3 className="card__title" style={{ fontSize: 19 }}>
        {milestone}
      </h3>
      {detail && <p className="card__body">{detail}</p>}
      <button type="button" className="btn" style={{ marginTop: 10 }} onClick={dismiss}>
        Very good
      </button>
    </section>
  )
}
