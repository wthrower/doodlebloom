import { PIPELINE_STAGES } from '../game/pipeline'

interface Props {
  stage: string
}

export function ProcessingScreen({ stage }: Props) {
  const currentIndex = PIPELINE_STAGES.findIndex(s => s.key === stage)

  return (
    <div className="screen processing-screen">
      <ul className="pipeline-checklist">
        {PIPELINE_STAGES.map((s, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          return (
            <li key={s.key} className={done ? 'done' : active ? 'active' : 'pending'}>
              <span className="pipeline-check">{done ? '✓' : active ? '→' : '○'}</span>
              <div className="pipeline-text">
                <span className="pipeline-label">{s.label}</span>
                <span className="pipeline-desc">{s.desc}</span>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
