import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, prisma, request, resetDatabase, makeUser, makeBlock, makeRoom, loginAs, disconnect } from "../helpers/db.js";
import { csvCell, toCsv } from "../../src/services/reportService.js";

let block;

before(async () => {
  await resetDatabase();
  await makeUser({ fullName: "Warden W", email: "warden@test.local", role: "WARDEN" });
  await makeUser({ fullName: "Alice", email: "alice@test.local", studentId: "STU-R-001" });
  await makeUser({ fullName: "Bob", email: "bob@test.local", studentId: "STU-R-002" });
  block = await makeBlock("Report Block");
  const r1 = await makeRoom(block.id, { roomNumber: "RB-101", capacity: 2 });
  const r2 = await makeRoom(block.id, { roomNumber: "RB-102", capacity: 3 });
  const alice = await prisma.user.findFirst({ where: { email: "alice@test.local" } });
  const bob = await prisma.user.findFirst({ where: { email: "bob@test.local" } });
  // r1: 2/2 occupied (FULL), r2: 1/3 occupied
  await prisma.allocation.create({ data: { studentId: alice.id, roomId: r1.id, status: "ACTIVE", startDate: new Date() } });
  await prisma.allocation.create({ data: { studentId: bob.id, roomId: r1.id, status: "PENDING" } });
  await prisma.complaint.create({ data: { studentId: alice.id, roomId: r2.id, title: "Broken chair", category: "MAINTENANCE", description: "Chair leg is broken.", status: "SUBMITTED" } });
});

after(disconnect);

test("occupancy report reconciles with the database", async () => {
  const w = await loginAs("warden@test.local");
  const res = await w.get("/api/v1/reports/occupancy");
  assert.equal(res.status, 200);
  const b = res.body.byBlock.find((x) => x.block === "Report Block");
  assert.equal(b.totalBeds, 5);
  // Only ACTIVE allocations occupy beds; the PENDING one must not count.
  assert.equal(b.occupiedBeds, 1);
  assert.equal(b.availableBeds, 4);
  assert.equal(b.occupancyRate, 20);
});

test("stats endpoint matches live counts", async () => {
  const w = await loginAs("warden@test.local");
  const res = await w.get("/api/v1/reports/stats");
  assert.equal(res.status, 200);
  assert.equal(res.body.pendingRequests, 1);
  assert.equal(res.body.openComplaints, 1);
  assert.equal(res.body.occupiedBeds, 1);
});

test("allocations report groups by status and lists waiting requests", async () => {
  const w = await loginAs("warden@test.local");
  const res = await w.get("/api/v1/reports/allocations");
  assert.equal(res.body.byStatus.PENDING, 1);
  assert.equal(res.body.byStatus.ACTIVE, 1);
  assert.equal(res.body.pendingRequests[0].studentName, "Bob");
});

test("complaints report includes category breakdown and average resolution", async () => {
  const w = await loginAs("warden@test.local");
  const res = await w.get("/api/v1/reports/complaints");
  assert.equal(res.status, 200);
  const cat = res.body.byCategory.find((c) => c.category === "MAINTENANCE");
  assert.equal(cat.count, 1);
  assert.equal(res.body.avgResolutionHours, null); // nothing resolved yet
});

test("CSV export is authorized (students get 403) and formula-safe", async () => {
  const student = await loginAs("alice@test.local");
  const denied = await student.get("/api/v1/reports/export.csv?report=occupancy");
  assert.equal(denied.status, 403);

  const w = await loginAs("warden@test.local");
  const res = await w.get("/api/v1/reports/export.csv?report=occupancy");
  assert.equal(res.status, 200);
  assert.match(res.headers["content-type"], /text\/csv/);
  assert.match(res.text, /Report Block/);

  // unknown report rejected
  const bad = await w.get("/api/v1/reports/export.csv?report=secrets");
  assert.equal(bad.status, 422);
});

test("csvCell neutralizes spreadsheet formula injection", () => {
  assert.equal(csvCell("=cmd()"), "'=cmd()");
  assert.equal(csvCell("+1234"), "'+1234");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell('has "quotes", and commas'), '"has ""quotes"", and commas"');
  assert.equal(csvCell(null), "");
  const csv = toCsv(["A", "B"], [["=evil()", "safe"]]);
  assert.ok(csv.startsWith("A,B"));
  assert.ok(csv.includes("'=evil()"));
});
