import { roleLabel } from '../lib/roles'
import { Avatar } from './ui'

// Choose which team members share the work, with a live preview of counts per person
export default function TeamPicker({ team, selectedIds, onChange, counts }) {
  const active = team.filter((u) => u.is_active)
  const allOn = selectedIds.length === active.length
  const toggle = (id) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id])

  return (
    <div className="team-picker">
      <div className="team-picker-head">
        <span className="muted small">{selectedIds.length} of {active.length} selected</span>
        <button type="button" className="btn btn-link btn-xs" onClick={() => onChange(allOn ? [] : active.map((u) => u.id))}>
          {allOn ? 'Clear all' : 'Select all'}
        </button>
      </div>
      {active.map((u) => {
        const on = selectedIds.includes(u.id)
        return (
          <label key={u.id} className={`team-row ${on ? 'is-on' : ''}`}>
            <input type="checkbox" checked={on} onChange={() => toggle(u.id)} />
            <Avatar name={u.full_name} size={32} />
            <span className="team-row-name">
              <strong>{u.full_name}</strong>
              <span className="muted small">{roleLabel(u.role)}, {u.email}</span>
            </span>
            {counts && <span className="team-row-count">{counts[u.id] ?? 0}<small>messages</small></span>}
          </label>
        )
      })}
    </div>
  )
}
