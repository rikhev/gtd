/** Empty states teach in plain words; the keys live in ⌘K and the ? overlay. An empty list may offer its first step. */
export function EmptyState({ title, lines, note, action }: { title: string; lines?: string[]; note?: string; action?: { label: string; run: () => void } }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {note && <p className="empty-note">{note}</p>}
      {lines && (
        <ul className="empty-lines">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
      {action && (
        <button type="button" className="text-btn empty-action" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}
