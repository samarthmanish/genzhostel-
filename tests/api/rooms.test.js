import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, prisma, request, resetDatabase, makeUser, makeBlock, makeRoom, loginAs, disconnect, TEST_PASSWORD } from "../helpers/db.js";

let block;

before(async () => {
  await resetDatabase();
  await makeUser({ fullName: "Warden W", email: "warden@test.local", role: "WARDEN" });
  await makeUser({ fullName: "Student S", email: "student@test.local", role: "STUDENT", studentId: "STU-R-001" });
  block = await makeBlock("Block X");
  await makeRoom(block.id, { roomNumber: "X-101", capacity: 2, roomType: "DOUBLE", amenities: ["Wi-Fi"] });
  await makeRoom(block.id, { roomNumber: "X-102", capacity: 1, roomType: "SINGLE" });
  await makeRoom(block.id, { roomNumber: "X-103", capacity: 3, roomType: "TRIPLE", status: "MAINTENANCE" });
  await makeRoom(block.id, { roomNumber: "X-999", capacity: 2, roomType: "DOUBLE", status: "INACTIVE" });
});

after(disconnect);

test("room list displays database records with computed availability", async () => {
  const student = await loginAs("student@test.local");
  const res = await student.get("/api/v1/rooms?limit=100");
  assert.equal(res.status, 200);
  const numbers = res.body.items.map((r) => r.roomNumber);
  assert.ok(numbers.includes("X-101"));
  assert.ok(numbers.includes("X-102"));
  // INACTIVE rooms are hidden from students
  assert.ok(!numbers.includes("X-999"));
  const r101 = res.body.items.find((r) => r.roomNumber === "X-101");
  assert.equal(r101.occupancy, 0);
  assert.equal(r101.availableBeds, 2);
  assert.equal(r101.status, "AVAILABLE");
  assert.equal(r101.canRequest, true);
  // No private student fields leak in listings
  assert.equal(r101.residents, undefined);
});

test("filters by block, type, availability, and search work", async () => {
  const student = await loginAs("student@test.local");
  const byType = await student.get(`/api/v1/rooms?roomType=SINGLE&limit=100`);
  assert.deepEqual(byType.body.items.map((r) => r.roomNumber), ["X-102"]);

  const byAmenity = await student.get(`/api/v1/rooms?amenity=${encodeURIComponent("Wi-Fi")}&limit=100`);
  assert.ok(byAmenity.body.items.every((r) => r.amenities.includes("Wi-Fi")));

  const search = await student.get(`/api/v1/rooms?q=x-10&limit=100`);
  assert.ok(search.body.items.length >= 3);

  const byBlock = await student.get(`/api/v1/rooms?blockId=${block.id}&limit=100`);
  assert.ok(byBlock.body.items.length >= 3);
});

test("students cannot create or modify rooms", async () => {
  const student = await loginAs("student@test.local");
  const create = await student.post("/api/v1/rooms").send({
    blockId: block.id, roomNumber: "X-200", floor: 2, roomType: "SINGLE", capacity: 1,
  });
  assert.equal(create.status, 403);
});

test("warden can create a room and it persists in PostgreSQL", async () => {
  const warden = await loginAs("warden@test.local");
  const res = await warden.post("/api/v1/rooms").send({
    blockId: block.id, roomNumber: "X-201", floor: 2, roomType: "TRIPLE", capacity: 3, amenities: ["Wi-Fi", "Geyser"],
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.roomNumber, "X-201");

  const row = await prisma.room.findFirst({ where: { roomNumber: "X-201" } });
  assert.ok(row, "room must exist in the database");
  assert.equal(row.capacity, 3);
});

test("duplicate room number in the same block is rejected (409)", async () => {
  const warden = await loginAs("warden@test.local");
  const res = await warden.post("/api/v1/rooms").send({
    blockId: block.id, roomNumber: "X-201", floor: 2, roomType: "SINGLE", capacity: 1,
  });
  assert.equal(res.status, 409);
});

test("invalid capacity values are rejected", async () => {
  const warden = await loginAs("warden@test.local");
  for (const capacity of [0, -2, 1.5, 999]) {
    const res = await warden.post("/api/v1/rooms").send({
      blockId: block.id, roomNumber: `BAD-${capacity}`, floor: 1, roomType: "SINGLE", capacity,
    });
    assert.equal(res.status, 422, `capacity ${capacity} must be rejected`);
  }
});

test("room status transitions are staff-only and validated", async () => {
  const warden = await loginAs("warden@test.local");
  const room = await prisma.room.findFirst({ where: { roomNumber: "X-102" } });
  const res = await warden.patch(`/api/v1/rooms/${room.id}/status`).send({ status: "MAINTENANCE" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "MAINTENANCE");

  const bad = await warden.patch(`/api/v1/rooms/${room.id}/status`).send({ status: "FULL" });
  assert.equal(bad.status, 422); // FULL is derived, not manually settable

  // restore
  await warden.patch(`/api/v1/rooms/${room.id}/status`).send({ status: "AVAILABLE" });
});

test("pagination is bounded", async () => {
  const student = await loginAs("student@test.local");
  const res = await student.get("/api/v1/rooms?limit=10000");
  assert.equal(res.status, 422);
});
