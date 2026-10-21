import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, prisma, request, resetDatabase, makeUser, makeBlock, makeRoom, loginAs, disconnect } from "../helpers/db.js";

let block, room;
let studentA, studentB, warden;

before(async () => {
  await resetDatabase();
  warden = await makeUser({ fullName: "Warden W", email: "warden@test.local", role: "WARDEN" });
  studentA = await makeUser({ fullName: "Alice", email: "alice@test.local", studentId: "STU-C-001" });
  studentB = await makeUser({ fullName: "Bob", email: "bob@test.local", studentId: "STU-C-002" });
  block = await makeBlock("Block C-Test");
  room = await makeRoom(block.id, { roomNumber: "TC-101", capacity: 2 });
});

after(disconnect);

test("student submits a complaint and receives a real persisted ID", async () => {
  const agent = await loginAs("alice@test.local");
  const res = await agent.post("/api/v1/complaints").send({
    title: "No hot water in bathroom",
    category: "WATER",
    description: "The geyser has not been working since yesterday morning.",
    priority: "HIGH",
    roomId: room.id,
  });
  assert.equal(res.status, 201);
  assert.ok(res.body.id);
  assert.equal(res.body.status, "SUBMITTED");

  const row = await prisma.complaint.findUnique({ where: { id: res.body.id } });
  assert.ok(row, "complaint must persist in the database");
  assert.equal(row.category, "WATER");
});

test("validation rejects empty title/description and invalid categories", async () => {
  const agent = await loginAs("alice@test.local");
  const cases = [
    { title: "", category: "WATER", description: "valid description here" },
    { title: "ok title", category: "WATER", description: "" },
    { title: "ok title", category: "NOT_A_CATEGORY", description: "valid description here" },
    { title: "ok title", category: "WATER", description: "short" }, // < 10 chars
  ];
  for (const body of cases) {
    const res = await agent.post("/api/v1/complaints").send(body);
    assert.equal(res.status, 422, `${JSON.stringify(body)} must be rejected`);
  }
});

test("student cannot view another student's complaint by guessing the ID", async () => {
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });
  const bob = await loginAs("bob@test.local");
  const res = await bob.get(`/api/v1/complaints/${complaint.id}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "NOT_YOUR_COMPLAINT");
});

test("warden can view any complaint with student details", async () => {
  const w = await loginAs("warden@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });
  const res = await w.get(`/api/v1/complaints/${complaint.id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.student.fullName, "Alice");
});

test("warden assigns to staff and the status moves to ASSIGNED", async () => {
  const w = await loginAs("warden@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });
  const res = await w.patch(`/api/v1/complaints/${complaint.id}/assignment`).send({ assignedToId: warden.id });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ASSIGNED");
  assert.ok(res.body.history.some((h) => h.action === "ASSIGNED"));
});

test("assignment to a student is rejected", async () => {
  const w = await loginAs("warden@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });
  const res = await w.patch(`/api/v1/complaints/${complaint.id}/assignment`).send({ assignedToId: studentA.id });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, "INVALID_ASSIGNEE");
});

test("internal notes are invisible to the student; staff notes are visible", async () => {
  const w = await loginAs("warden@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });

  await w.post(`/api/v1/complaints/${complaint.id}/comments`).send({ message: "Student-visible update: plumber coming at 4 PM.", visibility: "STUDENT_VISIBLE" });
  await w.post(`/api/v1/complaints/${complaint.id}/comments`).send({ message: "INTERNAL: verify if this is repeated negligence by vendor.", visibility: "INTERNAL" });

  const student = await loginAs("alice@test.local");
  const mine = await student.get(`/api/v1/complaints/${complaint.id}`);
  const messages = mine.body.comments.map((c) => c.message);
  assert.ok(messages.some((m) => m.includes("plumber coming")));
  assert.ok(!messages.some((m) => m.includes("INTERNAL")), "internal notes must never reach the student");

  const staffView = await w.get(`/api/v1/complaints/${complaint.id}`);
  const staffMessages = staffView.body.comments.map((c) => c.message);
  assert.ok(staffMessages.some((m) => m.includes("INTERNAL")));
});

test("students cannot post INTERNAL comments or set staff-only statuses", async () => {
  const student = await loginAs("alice@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });

  const internal = await student.post(`/api/v1/complaints/${complaint.id}/comments`).send({ message: "sneaky", visibility: "INTERNAL" });
  assert.equal(internal.status, 403);

  const status = await student.patch(`/api/v1/complaints/${complaint.id}/status`).send({ status: "CLOSED" });
  assert.equal(status.status, 403);
  assert.equal(status.body.error.code, "STAFF_ONLY_STATUS");
});

test("resolution requires a note, sets resolvedAt, and records history", async () => {
  const w = await loginAs("warden@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });

  const noNote = await w.patch(`/api/v1/complaints/${complaint.id}/status`).send({ status: "RESOLVED" });
  assert.equal(noNote.status, 400);
  assert.equal(noNote.body.error.code, "RESOLUTION_NOTE_REQUIRED");

  const res = await w.patch(`/api/v1/complaints/${complaint.id}/status`).send({ status: "RESOLVED", note: "Geyser element replaced; hot water restored." });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "RESOLVED");
  assert.ok(res.body.resolvedAt);

  const row = await prisma.complaint.findUnique({ where: { id: complaint.id } });
  assert.ok(row.resolvedAt, "resolvedAt must be persisted");
  const hist = await prisma.complaintHistory.findMany({ where: { complaintId: complaint.id, newStatus: "RESOLVED" } });
  assert.ok(hist.length >= 1);
});

test("student can reopen a resolved complaint within the window (with a reason)", async () => {
  const student = await loginAs("alice@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });

  const noReason = await student.patch(`/api/v1/complaints/${complaint.id}/status`).send({ status: "REOPENED" });
  assert.equal(noReason.status, 400);

  const res = await student.patch(`/api/v1/complaints/${complaint.id}/status`).send({ status: "REOPENED", note: "Water went cold again an hour later." });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "REOPENED");
  assert.equal(res.body.resolvedAt, null, "reopened complaints no longer count as resolved");
});

test("reopen window is enforced after it expires", async () => {
  const w = await loginAs("warden@test.local");
  const complaint = await prisma.complaint.findFirst({ where: { studentId: studentA.id } });
  // resolve again, then backdate resolvedAt beyond the window
  await w.patch(`/api/v1/complaints/${complaint.id}/status`).send({ status: "RESOLVED", note: "Fixed again." });
  await prisma.complaint.update({ where: { id: complaint.id }, data: { resolvedAt: new Date(Date.now() - 100 * 3600 * 1000) } });

  const student = await loginAs("alice@test.local");
  const res = await student.patch(`/api/v1/complaints/${complaint.id}/status`).send({ status: "REOPENED", note: "Still broken." });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "REOPEN_WINDOW_EXPIRED");
});

test("student /mine lists only their own complaints with filters", async () => {
  const bob = await loginAs("bob@test.local");
  await bob.post("/api/v1/complaints").send({ title: "Wi-Fi drops at night", category: "WIFI", description: "Signal disappears after 10 PM every night in TC-101." });

  const mine = await bob.get("/api/v1/complaints/mine");
  assert.equal(mine.body.total, 1);
  assert.ok(mine.body.items.every((c) => c.title === "Wi-Fi drops at night"));

  const filtered = await bob.get("/api/v1/complaints/mine?category=WATER");
  assert.equal(filtered.body.total, 0);
});

test("staff queue supports category/status/priority filters", async () => {
  const w = await loginAs("warden@test.local");
  const all = await w.get("/api/v1/complaints?limit=100");
  assert.ok(all.body.total >= 2);

  const wifi = await w.get("/api/v1/complaints?category=WIFI");
  assert.ok(wifi.body.items.every((c) => c.category === "WIFI"));
  assert.equal(wifi.body.total, 1);
});
