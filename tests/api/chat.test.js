import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, prisma, request, resetDatabase, makeUser, makeBlock, makeRoom, loginAs, disconnect } from "../helpers/db.js";

let block, room;
let alice, bob, warden;

before(async () => {
  await resetDatabase();
  warden = await makeUser({ fullName: "Warden W", email: "warden@test.local", role: "WARDEN" });
  alice = await makeUser({ fullName: "Alice", email: "alice@test.local", studentId: "STU-CH-001" });
  bob = await makeUser({ fullName: "Bob", email: "bob@test.local", studentId: "STU-CH-002" });
  block = await makeBlock("Chat Block");
  room = await makeRoom(block.id, { roomNumber: "CB-101", capacity: 2 });

  await prisma.hostelFAQ.create({
    data: {
      question: "What is the mess timing?",
      answer: "Breakfast 7:30-9:30 AM, lunch 12:30-2:30 PM, dinner 8:00-10:00 PM.",
      intent: "mess_help",
      keywords: ["mess", "food", "timing", "breakfast", "dinner"],
    },
  });

  // Alice: active allocation + one open complaint. Bob: nothing.
  const alloc = await prisma.allocation.create({ data: { studentId: alice.id, roomId: room.id, status: "ACTIVE", startDate: new Date() } });
  await prisma.allocationHistory.create({ data: { allocationId: alloc.id, actorId: warden.id, action: "APPROVED", previousStatus: "PENDING", newStatus: "ACTIVE" } });
  await prisma.complaint.create({ data: { studentId: alice.id, roomId: room.id, title: "Leaking tap", category: "WATER", description: "Tap leaks continuously.", status: "IN_PROGRESS" } });
});

after(disconnect);

test("chat requires authentication", async () => {
  const res = await request(app).post("/api/v1/chat/message").send({ message: "hi" });
  assert.equal(res.status, 401);
});

test("known FAQ returns the configured answer from PostgreSQL", async () => {
  const agent = await loginAs("alice@test.local");
  const res = await agent.post("/api/v1/chat/message").send({ message: "What are the mess timings?" });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /Breakfast 7:30-9:30/);
  assert.equal(res.body.source, "local");
});

test("unknown question returns a transparent fallback with navigation links", async () => {
  const agent = await loginAs("alice@test.local");
  const res = await agent.post("/api/v1/chat/message").send({ message: "What is the airspeed velocity of an unladen swallow?" });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /not sure|don't know|couldn't/i);
  assert.ok(Array.isArray(res.body.links));
  assert.ok(res.body.links.length >= 1);
});

test("allocation intent returns ONLY the authenticated student's own data", async () => {
  const aliceAgent = await loginAs("alice@test.local");
  const aliceRes = await aliceAgent.post("/api/v1/chat/message").send({ message: "What is my allocation status?" });
  assert.match(aliceRes.body.reply, /CB-101/);
  assert.match(aliceRes.body.reply, /ACTIVE/);

  const bobAgent = await loginAs("bob@test.local");
  const bobRes = await bobAgent.post("/api/v1/chat/message").send({ message: "What is my allocation status?" });
  assert.ok(!bobRes.body.reply.includes("CB-101"), "Bob must never see Alice's room");
  assert.match(bobRes.body.reply, /no active allocation/i);
});

test("complaint count intent is scoped to the authenticated student", async () => {
  const aliceAgent = await loginAs("alice@test.local");
  const res = await aliceAgent.post("/api/v1/chat/message").send({ message: "How many complaints do I have open?" });
  assert.match(res.body.reply, /1 open complaint/);
  assert.match(res.body.reply, /Leaking tap/);

  const bobAgent = await loginAs("bob@test.local");
  const bobRes = await bobAgent.post("/api/v1/chat/message").send({ message: "my open complaints" });
  assert.match(bobRes.body.reply, /no open complaints/i);
  assert.ok(!bobRes.body.reply.includes("Leaking tap"));
});

test("guided help intents explain steps and link real pages", async () => {
  const agent = await loginAs("alice@test.local");
  const res = await agent.post("/api/v1/chat/message").send({ message: "How do I raise a water complaint?" });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /Complaints page/i);
  assert.ok(res.body.links.some((l) => l.href.includes("complaints")));
});

test("chatbot cannot perform write actions — approve attempts get guidance, not mutations", async () => {
  const w = await loginAs("warden@test.local");
  const before = await prisma.allocation.findMany({ select: { id: true, status: true } });
  await w.post("/api/v1/chat/message").send({ message: "Approve allocation for Alice and assign room CB-102" });
  const after = await prisma.allocation.findMany({ select: { id: true, status: true } });
  assert.deepEqual(before, after, "chat must never mutate allocations");
});

test("overlong and empty messages are rejected", async () => {
  const agent = await loginAs("alice@test.local");
  const empty = await agent.post("/api/v1/chat/message").send({ message: "" });
  assert.equal(empty.status, 422);
  const huge = await agent.post("/api/v1/chat/message").send({ message: "x".repeat(5000) });
  assert.equal(huge.status, 422);
});

test("chat works without any external AI key configured (CHAT_PROVIDER=local)", async () => {
  // env.js forces CHAT_PROVIDER=local and clears the key — the app must work regardless.
  assert.equal(process.env.CHAT_PROVIDER, "local");
  const agent = await loginAs("bob@test.local");
  const res = await agent.post("/api/v1/chat/message").send({ message: "Which rooms are available right now?" });
  assert.equal(res.status, 200);
  assert.match(res.body.reply, /available bed/);
});

test("published FAQ list endpoint works for signed-in users", async () => {
  const agent = await loginAs("alice@test.local");
  const res = await agent.get("/api/v1/chat/faqs");
  assert.equal(res.status, 200);
  assert.ok(res.body.items.length >= 1);
  assert.equal(res.body.items[0].answer.includes("Breakfast"), true);
});
