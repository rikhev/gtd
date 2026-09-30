/**
 * Shows how a subscribed calendar writes an appointment, straight from the feed, to explain one the app shows but the
 * calendar doesn't (or the other way round). Run on the machine that holds the data:
 *
 *   npm run calendar:find -- "Lunch with Anna"
 *
 * Prints every VEVENT whose title contains the words (any case), with every other VEVENT sharing its UID (moved or
 * cancelled occurrences), from every subscribed calendar. The links themselves are never printed.
 */
import { getSetting } from "../server/db.ts";

const query = process.argv.slice(2).join(" ").trim().toLowerCase();
if (!query) {
  console.error('Name the appointment: npm run calendar:find -- "Lunch with Anna"');
  process.exit(1);
}

const feeds = JSON.parse(getSetting("calendars", "[]")) as { name: string; url: string }[];
if (!feeds.length) console.log("No calendars are subscribed on this machine.");

for (const f of feeds) {
  let text: string;
  try {
    const res = await fetch(f.url, { signal: AbortSignal.timeout(15_000), headers: { "cache-control": "no-cache" } });
    text = await res.text();
    console.log(`\n== ${f.name} (${new URL(f.url).host}): ${res.status}, ${text.length} bytes, Last-Modified ${res.headers.get("last-modified") ?? "–"}, Age ${res.headers.get("age") ?? "–"}`);
  } catch (e) {
    console.log(`\n== ${f.name}: couldn't be read (${(e as Error).message})`);
    continue;
  }
  const lines = text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const events = lines.match(/BEGIN:VEVENT\n[\s\S]*?\nEND:VEVENT/g) ?? [];
  const uidOf = (e: string) => /^UID:(.*)$/m.exec(e)?.[1].trim();
  const hits = events.filter((e) => (/^SUMMARY[^:]*:(.*)$/m.exec(e)?.[1] ?? "").toLowerCase().includes(query));
  const uids = new Set(hits.map(uidOf));
  const shown = events.filter((e) => hits.includes(e) || uids.has(uidOf(e)));
  console.log(`${events.length} appointments; ${hits.length} titled like “${query}”${shown.length > hits.length ? `, plus ${shown.length - hits.length} sharing their UID` : ""}.`);
  for (const e of shown) console.log(`\n${e.replace(/^(ATTENDEE|ORGANIZER)[^\n]*\n/gm, "")}`);
}
