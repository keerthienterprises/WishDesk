// Lightweight dependency-free charts

export function BarChart({ data, height = 180, color = 'var(--brand)', formatLabel = (l) => l }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const every = Math.ceil(data.length / 10)
  return (
    <div className="bar-chart" style={{ height }}>
      {data.map((d, i) => (
        <div key={d.label} className="bar-col" title={`${formatLabel(d.label)}: ${d.value}`}>
          <div className="bar-track">
            <div className="bar" style={{ height: `${(d.value / max) * 100}%`, background: d.color ?? color }}>
              {d.value > 0 && data.length <= 14 && <span className="bar-value">{d.value}</span>}
            </div>
          </div>
          <span className="bar-label">{i % every === 0 ? formatLabel(d.label) : ''}</span>
        </div>
      ))}
    </div>
  )
}

export function HBarList({ items, total }) {
  const max = total ?? Math.max(1, ...items.map((i) => i.value))
  return (
    <div className="hbar-list">
      {items.map((i) => (
        <div key={i.label} className="hbar-row">
          <div className="hbar-head">
            <span>{i.icon}{i.label}</span>
            <strong>{i.value}</strong>
          </div>
          <div className="hbar-track"><div className="hbar" style={{ width: `${(i.value / max) * 100}%`, background: i.color ?? 'var(--brand)' }} /></div>
        </div>
      ))}
    </div>
  )
}
