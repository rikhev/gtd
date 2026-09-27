// Synthetic cached proposals so the Clarify card can be inspected without an API key.
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(`${process.env.GTD_DATA_DIR ?? "data"}/gtd.sqlite`);
const stuff = db.prepare("SELECT id, text FROM stuff WHERE status='inbox' ORDER BY created_at").all();
const projects = db.prepare("SELECT id, title FROM projects").all();
const shred = projects.find((p) => p.title.startsWith("Shredder"))?.id ?? null;
const garage = projects.find((p) => p.title.startsWith("Garage"))?.id ?? null;
const d = new Date();
d.setDate(d.getDate() + 3);
const soon = d.toISOString().slice(0, 10);
const blank = { due: null, defer: null, time_min: null, energy: null, waiting_who: null, two_minute: false };
const byText = (t) => stuff.find((s) => s.text.includes(t))?.id;
const P = [
  { stuff_id: byText("mom birthday"), disposition: "actionable", new_project: { title: "Mom's birthday celebrated", area: "Home" }, reference: null, actions: [
    { ...blank, title: "Call Dad to agree on a gift for Mom", kind: "next", project: "new", context: "@phone", time_min: 15, energy: 1 },
    { ...blank, title: "Book a table for Sunday dinner", kind: "next", project: "new", context: "@computer", time_min: 15, energy: 1, two_minute: true },
  ] },
  { stuff_id: byText("rotor blades"), disposition: "actionable", new_project: null, reference: null, actions: [
    { ...blank, title: "Ask Per whether the 300-series needs new rotor blades", kind: "next", project: null, context: "@agenda", time_min: 5, energy: 1, two_minute: true },
  ] },
  { stuff_id: byText("Anna Lind"), disposition: "actionable", new_project: null, reference: null, actions: [
    { ...blank, title: "Email Anna to confirm the regrind trial on the 14th", kind: "next", project: shred, context: "@computer", due: soon, time_min: 5, energy: 1, two_minute: true },
    { ...blank, title: "Send Anna the updated safety sheet", kind: "next", project: shred, context: "@computer", due: soon, time_min: 15, energy: 1 },
    { ...blank, title: "Recommend a screen size for the PVC run", kind: "next", project: shred, context: "@office", time_min: 30, energy: 3 },
  ] },
  { stuff_id: byText("standing desk"), disposition: "someday", new_project: null, reference: null, actions: [
    { ...blank, title: "Research standing desks under 6 000 kr", kind: "someday", project: null, context: "@computer", time_min: 60, energy: 2 },
  ] },
  { stuff_id: byText("gutter"), disposition: "actionable", new_project: null, reference: null, actions: [
    { ...blank, title: "Get a quote for fixing the garage gutter", kind: "next", project: garage, context: "@phone", time_min: 15, energy: 1 },
  ] },
].filter((p) => p.stuff_id);
const ins = db.prepare("INSERT OR REPLACE INTO proposals (stuff_id, data, created_at) VALUES (?, ?, ?)");
for (const p of P) ins.run(p.stuff_id, JSON.stringify({ ...p, v: 3 }), new Date().toISOString());
console.log("proposals", P.length);
