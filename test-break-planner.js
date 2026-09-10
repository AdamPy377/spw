const fs = require("fs");
const vm = require("vm");
const assert = require("assert");

const mins = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const duration = (a, b) => { let d = mins(b) - mins(a); return d < 0 ? d + 1440 : d; };
const addMins = (_, n) => `${String(Math.floor(((n % 1440) + 1440) % 1440 / 60)).padStart(2,"0")}:${String(((n % 1440) + 1440) % 1440 % 60).padStart(2,"0")}`;
const relativeMins = (t, start) => { let d = mins(t) - mins(start); return d < 0 ? d + 1440 : d; };
const context = {
  console, mins, duration, addMins, relativeMins,
  normaliseAssignments: (x = []) => x,
  hourStarts: () => [0], num: Number,
  currentSpw: { hours: ["00:00"], actual: [100], projected: [100], crew: [] },
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("js/spw.js", "utf8"), context);

const outgoing = { id: 1, name: "Outgoing", area: "Kitchen", shift_start: "16:00", shift_end: "20:00", assignments: [] };
const relief = { id: 2, name: "Relief", area: "Kitchen", shift_start: "17:00", shift_end: "22:00", assignments: [] };
const drive = { id: 3, name: "Drive", area: "Drive Thru", shift_start: "16:00", shift_end: "20:00", assignments: [] };
context.currentSpw.crew = [outgoing, relief, drive];
let plans = context.buildShiftBreakPlan(context.currentSpw.crew);
assert.equal(plans.get(outgoing).rest1, "17:00", "4–8 rest should use the 5pm same-area clock-on");
assert.equal(plans.get(drive).rest1, "17:00", "different areas may take breaks together");

const k1 = { id: 4, name: "K1", area: "Kitchen", shift_start: "16:00", shift_end: "20:00", assignments: [] };
const k2 = { id: 5, name: "K2", area: "Kitchen", shift_start: "16:00", shift_end: "20:00", assignments: [] };
context.currentSpw.crew = [k1, k2];
plans = context.buildShiftBreakPlan(context.currentSpw.crew);
assert.notEqual(plans.get(k1).rest1, plans.get(k2).rest1, "same-area rests must not overlap");
assert.ok(Math.abs(mins(plans.get(k1).rest1) - mins(plans.get(k2).rest1)) >= 10);

const sent = { id: 6, name: "Sent", area: "Kitchen", shift_start: "12:00", shift_end: "22:00", assignments: [], rest1_sent: 1, rest1_time: "13:00" };
const other = { id: 7, name: "Other", area: "Kitchen", shift_start: "12:00", shift_end: "16:00", assignments: [] };
context.currentSpw.crew = [sent, other];
plans = context.buildShiftBreakPlan(context.currentSpw.crew);
assert.equal(plans.get(sent).rest1, "13:00", "sent rests remain fixed");
assert.notEqual(plans.get(other).rest1, "13:00", "sent rests reserve their area window");

console.log("break planner tests passed");

const out = { id: 20, name: "Out", area: "Kitchen", station: "Grill", shift_start: "16:00", shift_end: "20:00", assignments: [] };
const exact = { id: 21, name: "Exact", area: "Kitchen", station: "Grill", shift_start: "20:00", shift_end: "00:00", assignments: [] };
const wrong = { id: 22, name: "Wrong position", area: "Kitchen", station: "Fried", shift_start: "20:00", shift_end: "00:00", assignments: [] };
context.currentSpw.crew = [out, exact, wrong];
assert.equal(context.directReliefFor(out).incoming.id, exact.id, "exact same-position swap is detected");

exact.shift_start = "20:15";
assert.equal(context.directReliefFor(out).incoming.id, exact.id, "15-minute relief gap is accepted");
exact.shift_start = "20:16";
assert.equal(context.directReliefFor(out), null, "relief outside 15 minutes is rejected");

const overnightOut = { id: 23, name: "Night out", area: "Drive Thru", station: "Cash", shift_start: "20:00", shift_end: "00:00", assignments: [] };
const overnightIn = { id: 24, name: "Night in", area: "Drive Thru", station: "Cash", shift_start: "00:00", shift_end: "04:00", assignments: [] };
context.currentSpw.crew = [overnightOut, overnightIn];
assert.equal(context.directReliefFor(overnightOut).incoming.id, overnightIn.id, "midnight relief is detected across dates");

console.log("handover tests passed");
