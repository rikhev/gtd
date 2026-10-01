// Synthetic demo data for screenshots and keyboard tests (not the owner's data).
const API = "http://127.0.0.1:5174";
const { state } = await (await fetch(`${API}/api/state`)).json();
const ctx = Object.fromEntries(state.contexts.map((c) => [c.name, c.id]));
const area = Object.fromEntries(state.areas.map((a) => [a.name, a.id]));
const now = new Date();
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const day = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return iso(d); };
const stamp = (n = 0) => { const d = new Date(now); d.setDate(d.getDate() + n); return d.toISOString(); };
let sort = 1;
const id = () => crypto.randomUUID();
const ops = [];
const P = {};
const project = (key, title, areaName, outcome = "", extra = {}) => {
  P[key] = id();
  ops.push({ type: "create", table: "projects", row: { id: P[key], title, outcome, notes: "", area_id: area[areaName] ?? null, status: "active", due: null, bring_back: null, sort: sort++, created_at: stamp(-20), completed_at: null, ...extra } });
};
const action = (title, o = {}) => {
  ops.push({ type: "create", table: "actions", row: { id: id(), title, notes: "", project_id: null, context_id: null, due: null, defer: null, time_min: null, energy: null, flagged: 0, status: "next", waiting_who: null, waiting_since: null, followup: null, recurrence: null, bring_back: null, sort: sort++, created_at: stamp(-10), completed_at: null, ...o } });
};

project("shred", "Deliver the shredder test report to Nordplast", "Work", "", { due: day(9) });
project("cad", "Renew the CAD licences for the design team", "Work");
project("garage", "Convert the garage into a workshop", "Home");
project("passport", "Renew the passports before the Lisbon trip", "Home", "", { due: day(21) });
project("fitness", "Run a 10K in under 55 minutes", "Health");
project("tax", "File the 2025 tax return", "Finance");
project("offsite", "Plan the Q4 team offsite", "Work");

action("Email Per the shredder throughput numbers", { project_id: P.shred, context_id: ctx["@computer"], due: day(-1), time_min: 15, energy: 2, flagged: 1 });
action("Draft the test report outline", { project_id: P.shred, context_id: ctx["@computer"], due: day(3), time_min: 60, energy: 3 });
action("Book the lab for the regrind trial", { project_id: P.shred, context_id: ctx["@phone"], time_min: 5, energy: 1 });
action("Ask Karin which seats need a licence", { project_id: P.cad, context_id: ctx["@agenda"], time_min: 5 });
action("Get three quotes from electricians", { project_id: P.garage, context_id: ctx["@phone"], time_min: 30, energy: 2 });
action("Measure the back wall for the bench", { project_id: P.garage, context_id: ctx["@home"], time_min: 15, energy: 1, defer: day(4) });
action("Print the passport application forms", { project_id: P.passport, context_id: ctx["@office"], time_min: 5, energy: 1, flagged: 1 });
action("Book photo booth appointment", { project_id: P.passport, context_id: ctx["@errands"], due: day(6), time_min: 30 });
action("Run 5K easy on Saturday", { project_id: P.fitness, context_id: ctx["@home"], due: day(1), time_min: 30, energy: 2, recurrence: "every sat" });
action("Pay the VAT for Q3", { context_id: ctx["@computer"], due: day(0), time_min: 15, energy: 1, recurrence: "every 3 months" });
action("Buy printer toner", { context_id: ctx["@errands"], time_min: 15, energy: 1 });
action("Call the dentist about the crown", { context_id: ctx["@phone"], time_min: 5, energy: 1 });
action("Water the plants", { context_id: ctx["@home"], recurrence: "weekly", time_min: 5, energy: 1 });
action("Review the granulator maintenance manual draft", { context_id: ctx["@office"], time_min: 120, energy: 3 });

action("Signed NDA back from Nordplast", { project_id: P.shred, status: "waiting", waiting_who: "Anna Lind", waiting_since: day(-12), followup: day(-2) });
action("Quote for the Autodesk renewal", { project_id: P.cad, status: "waiting", waiting_who: "Reseller", waiting_since: day(-4), followup: day(3) });
action("Tax statement from the bank", { project_id: P.tax, status: "waiting", waiting_who: "Handelsbanken", waiting_since: day(-6) });

action("Learn to weld", { status: "someday" });
action("Kayak the Stockholm archipelago", { status: "someday", bring_back: day(120) });
ops.push({ type: "create", table: "projects", row: { id: id(), title: "Build a sauna by the lake", outcome: "", notes: "", area_id: area.Home, status: "someday", due: null, bring_back: null, sort: sort++, created_at: stamp(-40), completed_at: null } });

action("Send the invoice to Rapid support", { status: "done", completed_at: stamp(0), context_id: ctx["@computer"] });
action("Renew the car insurance", { status: "done", completed_at: stamp(-1), context_id: ctx["@phone"] });
action("Clear out the downloads folder", { status: "done", completed_at: stamp(-3), context_id: ctx["@computer"] });

ops.push({ type: "create", table: "refs", row: { id: id(), title: "Wi-Fi password for the workshop", notes: "Network: Verkstad-5G", project_id: null, status: "active", created_at: stamp(-8) } });
ops.push({ type: "create", table: "refs", row: { id: id(), title: "Nordplast contact list", notes: "Anna Lind, purchasing\nPer Holm, production", project_id: P.shred, status: "active", created_at: stamp(-15) } });

// Checklists: one with a run under way, one finished last week.
const checklist = (title, areaName, lines, ticked = 0, finished = null) => {
  const cid = id();
  ops.push({ type: "create", table: "checklists", row: { id: cid, title, notes: "", area_id: area[areaName] ?? null, status: "active", sort: sort++, created_at: stamp(-30), updated_at: stamp(-30), finished_at: finished } });
  let n = 0;
  lines.forEach((line, i) => {
    const section = line.endsWith(":") ? 1 : 0;
    const tick = !section && n++ < ticked;
    ops.push({ type: "create", table: "checklist_items", row: { id: id(), checklist_id: cid, title: section ? line.slice(0, -1) : line, section, checked_at: tick ? stamp(0) : null, sort: i + 1, created_at: stamp(-30) } });
  });
};
checklist("Packing for a work trip", "Work", ["Papers:", "Passport", "Tickets and booking numbers", "Company card", "Kit:", "Laptop and charger", "Adapter plug", "Headphones", "Clothes:", "Shirts for each day", "Running shoes"], 4);
checklist("Closing the month", "Finance", ["Reconcile the business account", "Send the invoices", "File the receipts", "Pay the supplier bills", "Update the cash forecast"], 0, stamp(-6));
checklist("Before a long weekend away", "Home", ["Water the plants", "Empty the fridge", "Lock the garage", "Set the heating to away"]);
// A routine: three daily habits with four weeks of history, done more often than not.
{
  const cid = id();
  ops.push({ type: "create", table: "checklists", row: { id: cid, title: "Morning routine", notes: "", area_id: area.Health ?? null, status: "active", sort: sort++, created_at: stamp(-40), updated_at: stamp(-40), finished_at: null, repeats: "day" } });
  ["Stretch for ten minutes", "Read for twenty minutes", "Plan the day from Next Actions"].forEach((title, i) => {
    const iid = id();
    ops.push({ type: "create", table: "checklist_items", row: { id: iid, checklist_id: cid, title, section: 0, checked_at: null, sort: i + 1, created_at: stamp(-40) } });
    for (let d = -27; d <= -1; d++) {
      // A steady recent run, a gap or two further back.
      if ((d + i * 3) % 5 === 0 && d < -6) continue;
      ops.push({ type: "create", table: "checklist_ticks", row: { id: id(), item_id: iid, checklist_id: cid, day: day(d), created_at: stamp(d) } });
    }
  });
}

const stuff = (text, kind = "text", d = 0) => ops.push({ type: "create", table: "stuff", row: { id: id(), text, kind, status: "inbox", created_at: stamp(d), processed_at: null } });
stuff("mom birthday", "text", -2);
stuff("new rotor blades for the 300-series? ask Per", "text", -1);
stuff("From: Anna Lind <anna@nordplast.example>\nSubject: Trial dates and next steps\n\nHi! We can host the regrind trial on the 14th or 21st. Please confirm which works and send over the updated safety sheet. Also, could you recommend a screen size for the PVC run?\n\n/Anna", "email", 0);
stuff("look into standing desk", "text", 0);
stuff("gutter on the garage is leaking", "text", 0);

const res = await fetch(`${API}/api/ops`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) });
console.log(res.status, await res.text(), ops.length, "ops");

