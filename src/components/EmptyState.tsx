/** Empty states teach in plain words; the keys live in ⌘K and the ? overlay. */
export function EmptyState({ title, lines, note }: { title: string; lines?: string[]; note?: string }) {
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
    </div>
  );
}
