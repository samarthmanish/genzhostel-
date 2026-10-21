import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { app, prisma, request, resetDatabase, makeUser, loginAs, disconnect, TEST_PASSWORD } from "../helpers/db.js";

before(async () => {
  await resetDatabase();
  await makeUser({ fullName: "Admin One", email: "admin@test.local", role: "ADMIN" });
  await makeUser({ fullName: "Warden One", email: "warden@test.local", role: "WARDEN" });
  await makeUser({ fullName: "Student One", email: "student@test.local", role: "STUDENT", studentId: "STU-T-001" });
  await makeUser({ fullName: "Deactivated Dan", email: "dead@test.local", role: "STUDENT", isActive: false });
});

after(disconnect);

test("valid login succeeds and returns the user without password hash", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: "student@test.local", password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, "student@test.local");
  assert.equal(res.body.user.passwordHash, undefined);
  assert.match(res.headers["set-cookie"][0], /hms_session=/);
  assert.match(res.headers["set-cookie"][0], /HttpOnly/i);
});

test("login works with student ID as identifier", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: "STU-T-001", password: TEST_PASSWORD });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, "student@test.local");
});

test("invalid password returns a generic authentication error", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: "student@test.local", password: "WrongPass1!" });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("unknown account returns the same generic error (no user enumeration)", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: "ghost@test.local", password: TEST_PASSWORD });
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, "INVALID_CREDENTIALS");
});

test("deactivated users cannot sign in", async () => {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: "dead@test.local", password: TEST_PASSWORD });
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "ACCOUNT_DEACTIVATED");
});

test("unauthenticated requests to protected routes are rejected", async () => {
  for (const path of ["/api/v1/rooms", "/api/v1/allocations/mine", "/api/v1/complaints/mine", "/api/v1/chat/faqs"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, `${path} should require auth`);
  }
});

test("student cannot access admin APIs", async () => {
  const student = await loginAs("student@test.local");
  const res = await student.get("/api/v1/users");
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, "ROLE_FORBIDDEN");
});

test("student cannot access warden/admin reports", async () => {
  const student = await loginAs("student@test.local");
  const res = await student.get("/api/v1/reports/stats");
  assert.equal(res.status, 403);
});

test("warden can access reports but not admin user management", async () => {
  const warden = await loginAs("warden@test.local");
  assert.equal((await warden.get("/api/v1/reports/stats")).status, 200);
  assert.equal((await warden.get("/api/v1/users")).status, 403);
});

test("/auth/me returns the current session user", async () => {
  const warden = await loginAs("warden@test.local");
  const res = await warden.get("/api/v1/auth/me");
  assert.equal(res.status, 200);
  assert.equal(res.body.user.role, "WARDEN");
});

test("logout clears the session cookie and old cookie stops working", async () => {
  const agent = await loginAs("student@test.local");
  const out = await agent.post("/api/v1/auth/logout");
  assert.equal(out.status, 204);
  const me = await agent.get("/api/v1/auth/me");
  assert.equal(me.status, 401);
});

test("self-registration creates STUDENT accounts only — role in body is ignored", async () => {
  const res = await request(app).post("/api/v1/auth/register").send({
    fullName: "New Student",
    email: "newbie@test.local",
    studentId: "STU-T-777",
    password: "Fresh@12345",
    confirmPassword: "Fresh@12345",
    role: "ADMIN", // must be ignored
  });
  assert.equal(res.status, 201);
  assert.equal(res.body.user.role, "STUDENT");
  const stored = await prisma.user.findUnique({ where: { email: "newbie@test.local" } });
  assert.equal(stored.role, "STUDENT");
  assert.notEqual(stored.passwordHash, "Fresh@12345"); // hashed, not plaintext
  assert.match(stored.passwordHash, /^\$2[aby]\$/);
});

test("registration rejects duplicate email and weak password", async () => {
  const dup = await request(app).post("/api/v1/auth/register").send({
    fullName: "Dup Student", email: "newbie@test.local", studentId: "STU-T-778",
    password: "Fresh@12345", confirmPassword: "Fresh@12345",
  });
  assert.equal(dup.status, 409);

  const weak = await request(app).post("/api/v1/auth/register").send({
    fullName: "Weak Pass", email: "weak@test.local", studentId: "STU-T-779",
    password: "short", confirmPassword: "short",
  });
  assert.equal(weak.status, 422);
});

test("change password requires the correct current password", async () => {
  const student = await loginAs("student@test.local");
  const bad = await student.post("/api/v1/auth/change-password").send({
    currentPassword: "Nope@12345", newPassword: "Brand@New1", confirmPassword: "Brand@New1",
  });
  assert.equal(bad.status, 401);

  const ok = await student.post("/api/v1/auth/change-password").send({
    currentPassword: TEST_PASSWORD, newPassword: "Brand@New1", confirmPassword: "Brand@New1",
  });
  assert.equal(ok.status, 200);

  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: "student@test.local", password: "Brand@New1" });
  assert.equal(login.status, 200);
  // restore for other tests in this file
  const again = await loginAs("student@test.local", "Brand@New1");
  await again.post("/api/v1/auth/change-password").send({
    currentPassword: "Brand@New1", newPassword: TEST_PASSWORD, confirmPassword: TEST_PASSWORD,
  });
});

test("health endpoint reports real database connectivity", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.database, "connected");
});
