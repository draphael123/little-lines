import { useEffect, useState } from 'react'
import { BUILDINGS } from '../world/buildings'
import { useRegion } from '../store/useRegion'
import { AudioMenu } from './AudioMenu'
import { Dialog } from './Dialog'

const PAGES = [
  {
    title: 'The country is yours to open up',
    lede: 'Four kilometres of coast, hills and river valley.',
    body: [
      'Scattered across it are a dozen hamlets, sitting where people would actually settle: flat ground, out of the wind, within reach of water. Left alone they will stay hamlets forever.',
      'You never build a house, a shop or a street. You build the railway and the things that serve it, and the country arranges itself around what you have built. Everything you see grow — the streets, the terraces, the towers in the middle of a city — appeared because a railway made the place worth living in.',
    ],
  },
  {
    title: 'Laying a line',
    lede: 'Drag from somewhere to somewhere else.',
    body: [
      'Pick the rail tool and drag across the country. The line curves; it does not turn in right angles. Drop an end near track you have already built and it joins on, leaving that junction along the direction the rails were already running.',
      'A railway does not follow the ground. It cuts through the high bits and is carried over the low ones, and it will not exceed a gradient of one in twenty-five. If two junctions are too far apart in height for the distance between them, the line is refused and told you why. An end out in open country is free to settle into a cutting or onto an embankment.',
      'Raise and Lower act on a line you have already built — click it and it lifts four metres at a time, into an embankment and then onto a viaduct with piers. Before you drag, the three buttons under the rail tool set the height the new line will be built at.',
    ],
  },
  {
    title: 'Making a place grow',
    lede: 'Two rules, and everything follows from them.',
    body: [
      'First: a settlement grows only when a station stands within reach of it. A station reaches about 380 metres; a grand terminus much further.',
      'Second — and this is the one people miss — that station has to share a network with a station serving somewhere else. A railway between two places carries passengers. A line that runs out from one hamlet and stops carries nobody, and the panel will tell you so.',
      'After that it is about service. A network with more stations than trains can work grows slowly; roughly one train for every two stations keeps it at full pace. Engine sheds are what let you run more trains, and a water tower lifts the service of its whole network.',
    ],
  },
  {
    title: 'Money, and going backwards',
    lede: 'You can be poor. You cannot lose.',
    body: [
      'Line costs by the metre and much more where it has to be carried on a viaduct. Every building costs to put up and then costs every month it stands. Fares arrive continuously from the people you actually carry, so a network that stops earning starts to bite.',
      'The balance floors at zero — there is no bankruptcy, only waiting for the traffic to catch up.',
      'A town never shrinks because you looked away. It stalls if the service is poor, and it only empties if you take its railway away: close its station, or cut the line, and people will start to leave. Nowhere ever empties below the handful who never do.',
    ],
  },
  {
    title: 'Watching it work',
    lede: 'Three cameras, and the clock is the trains.',
    body: [
      'Free camera: drag to travel, wheel to zoom, right-drag or shift-drag to turn, W A S D to pan. Come right down and the camera flattens out so street level looks along the ground rather than down at it.',
      'Follow puts you behind a train; Cab puts you in it. Both are in the cluster at the bottom left, next to the coordinates.',
      'Time only passes while the trains are running, so the pause button stops the whole country. Slow, Normal and Fast change how quickly the months go by.',
    ],
  },
]

export function RegionTutorial() {
  const open = useRegion((s) => s.showTutorial)
  const close = useRegion((s) => s.closeTutorial)
  const [page, setPage] = useState(0)

  useEffect(() => {
    if (open) setPage(0)
  }, [open])

  const current = PAGES[page]
  const last = page === PAGES.length - 1

  return (
    <Dialog
      open={open}
      title={current.title}
      labelSuffix={`${current.lede}  ·  Page ${page + 1} of ${PAGES.length}`}
      onClose={close}
      footer={
        <>
          <div className="pages" aria-hidden="true">
            {PAGES.map((p, i) => (
              <i key={p.title} data-on={i <= page} />
            ))}
          </div>
          <div className="chips">
            <button
              type="button"
              className="btn"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Back
            </button>
            {last ? (
              <button type="button" className="btn btn--accent" onClick={close}>
                Open the country
              </button>
            ) : (
              <button type="button" className="btn btn--accent" onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            )}
          </div>
        </>
      }
    >
      <div aria-live="polite">
        {current.body.map((paragraph) => (
          <p key={paragraph.slice(0, 28)}>{paragraph}</p>
        ))}
      </div>
    </Dialog>
  )
}

const RULES = [
  {
    title: 'Gradients',
    text: 'A line will not exceed one in twenty-five. It cuts through high ground and is carried over low ground to keep inside that, which is why an ordinary line across rolling country is never refused.',
  },
  {
    title: 'Junctions',
    text: 'Drop the end of a drag within about seventy metres of existing track and the two join. Lines that touch anywhere form one network, so a junction really does connect the traffic.',
  },
  {
    title: 'Viaducts',
    text: 'Wherever the finished line stands more than three metres clear of the ground it gets piers and a deck, and it costs four times as much per metre.',
  },
  {
    title: 'Catchment',
    text: 'A station serves anything within 380 metres, a grand terminus within 620. Only the nearest station counts for a given settlement.',
  },
  {
    title: 'Service',
    text: 'Roughly one train per two stations on a network keeps it at full service. Below that, growth slows in proportion. A water tower adds a fifth back.',
  },
  {
    title: 'Reachable by rail',
    text: 'A market, a school or a clinic does nothing at all unless it stands within reach of a station on a network that is actually carrying people.',
  },
]

export function RegionGuide() {
  const open = useRegion((s) => s.showGuide)
  const setOpen = useRegion((s) => s.setGuide)
  return (
    <Dialog
      open={open}
      title="Reference"
      labelSuffix="The rules in full, and the sound"
      onClose={() => setOpen(false)}
    >
      <div className="guide">
        {RULES.map((rule) => (
          <section key={rule.title}>
            <h3>{rule.title}</h3>
            <p>{rule.text}</p>
          </section>
        ))}
      </div>

      <h3 style={{ marginTop: 22, fontSize: 18 }}>What you can build</h3>
      <div className="guide" style={{ marginTop: 8 }}>
        {BUILDINGS.map((b) => (
          <section key={b.id}>
            <h3 style={{ fontSize: 14 }}>
              {b.name}
              <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>
                {' '}
                — £{b.cost.toLocaleString()}, £{b.upkeep}/mo
                {b.unlockAt > 0 && `, opens at ${b.unlockAt} people`}
              </span>
            </h3>
            <p>{b.blurb}</p>
          </section>
        ))}
      </div>

      <h3 style={{ marginTop: 22, fontSize: 18 }}>Sound</h3>
      <AudioMenu />
    </Dialog>
  )
}
