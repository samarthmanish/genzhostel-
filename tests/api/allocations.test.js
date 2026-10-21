import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, prisma, request, resetDatabase, makeUser, makeBlock, makeRoom, loginAs, disconnect } from "../helpers/db.js";

let block, roomSmall, roomMaint, roomBig;
let s1, s2, s3;

before(async () => {
  await resetDatabase();
  await makeUser({ fullName: "Warden W", email: "warden@test.local", role: "WARDEN" });
  s1 = await makeUser({ fullName: "S One", email: "s1@test.local", studentId: "STU-A-001" });
  s2 = await makeUser({ fullName: "S Two", email: "s2@test.local", studentId: "STU-A-002" });
  s3 = await makeUser({ fullName: "S Three", email: "s3@test.local", studentId: "STU-A-003" });
  block = await makeBlock("Block A-Test");
  roomSmall = await makeRoom(block.id, { roomNumber: "TA-101", capacity: 1, roomType: "SINGLE" });
  roomBig = await makeRoom(block.id, { roomNumber: "TA-102", capacity: 3, roomType: "TRIPLE" });
  roomMaint = await makeRoom(block.id, { roomNumber: "TA-103", capacity: 2, status: "MAINTENANCE" });
});

after(disconnect);

test("student can submit a valid allocation request", async () => {
  const student = await loginAs("s1@test.local");
  const res = await student.post("/api/v1/allocations/requests").send({
    roomId: roomBig.id,
    preferenceNote: "Lower floor preferred",
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, "PENDING");
  assert.ok(res.body.id);
  assert.ok(res.body.requestedAt);

  const row = await prisma.allocation.findUnique({ where: { id: res.body.id } });
  assert.ok(row, "request must persist in the database");
});

test("duplicate pending request is rejected (409)", async () => {
  const student = await loginAs("s1@test.local");
  const res = await student.post("/api/v1/allocations/requests").send({ preferenceNote: "second try" });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "DUPLICATE_REQUEST");
});

test("student can see own request via /mine with history", async () => {
  const student = await loginAs("s1@test.local");
  const res = await student.get("/api/v1/allocations/mine");
  assert.equal(res.status, 200);
  assert.equal(res.body.items.length, 1);
  assert.equal(res.body.items[0].status, "PENDING");
  assert.ok(res.body.items[0].history.some((h) => h.action === "REQUESTED"));
});

test("student cannot cancel another student's request", async () => {
  const other = await loginAs("s2@test.local");
  const s1Alloc = await prisma.allocation.findFirst({ where: { studentId: s1.id } });
  const res = await other.post(`/api/v1/allocations/${s1Alloc.id}/cancel`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "NOT_YOUR_ALLOCATION");
});

test("warden approves request → ACTIVE with room assignment, history + audit recorded", async () => {
  const warden = await loginAs("warden@test.local");
  const alloc = await prisma.allocation.findFirst({ where: { studentId: s1.id, status: "PENDING" } });
  const res = await warden.post(`/api/v1/allocations/${alloc.id}/approve`).send({
    roomId: roomBig.id,
    reason: "Space available",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "ACTIVE");
  assert.equal(res.body.room.id, roomBig.id);
  assert.ok(res.body.decidedAt);
  assert.ok(res.body.history.some((h) => h.action === "APPROVED"));

  const audits = await prisma.auditLog.findMany({ where: { action: "ALLOCATION_APPROVED" } });
  assert.ok(audits.length >= 1);
});

test("student sees the status change on their side", async () => {
  const student = await loginAs("s1@test.local");
  const res = await student.get("/api/v1/allocations/mine");
  assert.equal(res.body.items[0].status, "ACTIVE");
  assert.equal(res.body.items[0].room.roomNumber, "TA-102");
});

test("a student with an active allocation cannot submit a new request", async () => {
  const student = await loginAs("s1@test.local");
  const res = await student.post("/api/v1/allocations/requests").send({});
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "ALREADY_ALLOCATED");
});

test("approval fails for a room under maintenance", async () => {
  const s2agent = await loginAs("s2@test.local");
  const created = await s2agent.post("/api/v1/allocations/requests").send({});
  assert.equal(created.status, 201);

  const warden = await loginAs("warden@test.local");
  const res = await warden.post(`/api/v1/allocations/${created.body.id}/approve`).send({ roomId: roomMaint.id });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, "ROOM_NOT_ALLOCATABLE");
});

test("rejection requires a reason and records it", async () => {
  const warden = await loginAs("warden@test.local");
  const alloc = await prisma.allocation.findFirst({ where: { studentId: s2.id, status: "PENDING" } });

  const noReason = await warden.post(`/api/v1/allocations/${alloc.id}/reject`).send({ reason: "" });
  assert.equal(noReason.status, 422);

  const res = await warden.post(`/api/v1/allocations/${alloc.id}/reject`).send({ reason: "Block full this semester" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "REJECTED");
  assert.equal(res.body.decisionReason, "Block full this semester");

  const student = await loginAs("s2@test.local");
  const mine = await student.get("/api/v1/allocations/mine");
  const rejected = mine.body.items.find((a) => a.id === alloc.id);
  assert.equal(rejected.status, "REJECTED");
  assert.equal(rejected.decisionReason, "Block full this semester"); // visible to the student
});

test("two concurrent approvals for the LAST bed cannot overbook the room", async () => {
  // roomSmall has capacity 1; two students race for it.
  const s2agent = await loginAs("s2@test.local");
  const s3agent = await loginAs("s3@test.local");
  const reqA = await s2agent.post("/api/v1/allocations/requests").send({});
  const reqB = await s3agent.post("/api/v1/allocations/requests").send({});
  assert.equal(reqA.status, 201);
  assert.equal(reqB.status, 201);

  const warden = await loginAs("warden@test.local");
  const [resA, resB] = await Promise.all([
    warden.post(`/api/v1/allocations/${reqA.body.id}/approve`).send({ roomId: roomSmall.id }),
    warden.post(`/api/v1/allocations/${reqB.body.id}/approve`).send({ roomId: roomSmall.id }),
  ]);
  const statuses = [resA.status, resB.status].sort();
  assert.deepEqual(statuses, [200, 409], `expected exactly one success, got ${resA.status}/${resB.status}`);
  const failed = resA.status === 409 ? resA : resB;
  assert.equal(failed.body.error.code, "ROOM_CAPACITY_EXCEEDED");

  const occ = await prisma.allocation.count({ where: { roomId: roomSmall.id, status: { in: ["ACTIVE", "APPROVED"] } } });
  assert.equal(occ, 1, "database must never exceed capacity");
});

test("room FULL flag syncs and clears on vacate", async () => {
  const warden = await loginAs("warden@test.local");
  let room = await prisma.room.findUnique({ where: { id: roomSmall.id } });
  assert.equal(room.status, "FULL");

  const alloc = await prisma.allocation.findFirst({ where: { roomId: roomSmall.id, status: "ACTIVE" } });
  const vac = await warden.post(`/api/v1/allocations/${alloc.id}/vacate`).send({ reason: "Student moved out" });
  assert.equal(vac.status, 200);
  assert.equal(vac.body.status, "VACATED");
  assert.ok(vac.body.endDate);

  room = await prisma.room.findUnique({ where: { id: roomSmall.id } });
  assert.equal(room.status, "AVAILABLE");
});

test("vacating requires a reason", async () => {
  const warden = await loginAs("warden@test.local");
  const alloc = await prisma.allocation.findFirst({ where: { studentId: s1.id, status: "ACTIVE" } });
  const res = await warden.post(`/api/v1/allocations/${alloc.id}/vacate`).send({ reason: "" });
  assert.equal(res.status, 422);
});

test("transfer moves the student to another room within capacity and records history", async () => {
  const warden = await loginAs("warden@test.local");
  const alloc = await prisma.allocation.findFirst({ where: { studentId: s1.id, status: "ACTIVE" } });
  const res = await warden.post(`/api/v1/allocations/${alloc.id}/transfer`).send({
    toRoomId: roomSmall.id,
    reason: "Student requested a single room",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.room.id, roomSmall.id);
  assert.ok(res.body.history.some((h) => h.action === "TRANSFERRED"));

  const oldRoom = await prisma.room.findUnique({ where: { id: roomBig.id } });
  assert.equal(oldRoom.status, "AVAILABLE");
});

test("student cannot view another student's allocation by guessing the ID", async () => {
  const s1Alloc = await prisma.allocation.findFirst({ where: { studentId: s1.id } });
  const s3agent = await loginAs("s3@test.local");
  const res = await s3agent.get(`/api/v1/allocations/${s1Alloc.id}`);
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "NOT_YOUR_ALLOCATION");
});

test("students cannot access the staff allocation queue", async () => {
  const student = await loginAs("s1@test.local");
  const res = await student.get("/api/v1/allocations");
  assert.equal(res.status, 403);
});

test("warden queue lists all requests with student details and filters", async () => {
  const warden = await loginAs("warden@test.local");
  const all = await warden.get("/api/v1/allocations?limit=100");
  assert.equal(all.status, 200);
  assert.ok(all.body.items.length >= 3);
  assert.ok(all.body.items[0].student?.fullName);

  const rejected = await warden.get("/api/v1/allocations?status=REJECTED");
  assert.ok(rejected.body.items.every((a) => a.status === "REJECTED"));
});

test("DB constraints independently block duplicate active and duplicate pending allocations", async () => {
  // 1) The partial unique index blocks a second ACTIVE allocation for a student,
  //    even if buggy application code tried to insert one directly.
  await assert.rejects(
    prisma.allocation.create({ data: { studentId: s1.id, roomId: roomBig.id, status: "ACTIVE" } }),
    (err) => err.code === "P2002"
  );
  // 2) The partial unique index blocks a second PENDING request for a student
  //    who already has one pending (leftover from the race test above).
  const stillPending = await prisma.allocation.findFirst({ where: { status: "PENDING" } });
  assert.ok(stillPending, "race-test loser's request should still be PENDING");
  await assert.rejects(
    prisma.allocation.create({ data: { studentId: stillPending.studentId, status: "PENDING" } }),
    (err) => err.code === "P2002"
  );
  // 3) The API-level rule "no new request while ACTIVE" is covered by its own test above.
});
