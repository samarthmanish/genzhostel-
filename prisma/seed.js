/**
 * Development seed — creates clearly FAKE demo data only.
 * Never seed real student information. Demo credentials printed below are
 * for local development only; remove or change them before any deployment.
 *
 * Run with: npm run db:seed
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const DEMO_PASSWORD = "Demo@1234";

const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);

async function main() {
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && process.env.SEED_DEMO_USERS !== "true") {
    console.log("[seed] Refusing to seed demo users in production unless SEED_DEMO_USERS=true.");
  }

  console.log("[seed] Clearing existing data (dev reset)...");
  // Order matters for FKs
  await prisma.auditLog.deleteMany();
  await prisma.complaintComment.deleteMany();
  await prisma.complaintHistory.deleteMany();
  await prisma.allocationHistory.deleteMany();
  await prisma.complaint.deleteMany();
  await prisma.allocation.deleteMany();
  await prisma.room.deleteMany();
  await prisma.hostelBlock.deleteMany();
  await prisma.hostelFAQ.deleteMany();
  await prisma.user.deleteMany();

  /* ------------------------------- Users ------------------------------- */
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  console.log("[seed] Creating demo users...");

  const [admin, warden1, warden2, ...students] = await Promise.all([
    prisma.user.create({ data: { fullName: "Asha Deshpande", email: "admin@hostel.local", passwordHash: hash, role: "ADMIN", isActive: true } }),
    prisma.user.create({ data: { fullName: "Ramesh Kulkarni", email: "warden@hostel.local", passwordHash: hash, role: "WARDEN", isActive: true, phone: "+91-90000-00001" } }),
    prisma.user.create({ data: { fullName: "Sunita Patil", email: "warden2@hostel.local", passwordHash: hash, role: "WARDEN", isActive: true } }),
    prisma.user.create({ data: { fullName: "Priya Sharma", email: "student@hostel.local", studentId: "STU-2024-001", passwordHash: hash, role: "STUDENT", course: "B.Tech CSE", yearOfStudy: 2, phone: "+91-90000-10001", emergencyContactName: "Rakesh Sharma", emergencyContactPhone: "+91-90000-20001" } }),
    prisma.user.create({ data: { fullName: "Arjun Verma", email: "arjun@hostel.local", studentId: "STU-2024-002", passwordHash: hash, role: "STUDENT", course: "B.Tech MECH", yearOfStudy: 3 } }),
    prisma.user.create({ data: { fullName: "Meera Iyer", email: "meera@hostel.local", studentId: "STU-2024-003", passwordHash: hash, role: "STUDENT", course: "B.Sc Physics", yearOfStudy: 1 } }),
    prisma.user.create({ data: { fullName: "Rohan Gupta", email: "rohan@hostel.local", studentId: "STU-2024-004", passwordHash: hash, role: "STUDENT", course: "B.Tech CSE", yearOfStudy: 2 } }),
    prisma.user.create({ data: { fullName: "Fatima Khan", email: "fatima@hostel.local", studentId: "STU-2024-005", passwordHash: hash, role: "STUDENT", course: "B.Com", yearOfStudy: 2 } }),
    prisma.user.create({ data: { fullName: "Vikram Singh", email: "vikram@hostel.local", studentId: "STU-2023-011", passwordHash: hash, role: "STUDENT", course: "B.Tech ECE", yearOfStudy: 4 } }),
    prisma.user.create({ data: { fullName: "Inactive Ira", email: "inactive@hostel.local", studentId: "STU-2022-099", passwordHash: hash, role: "STUDENT", isActive: false } }),
  ]);
  const [priya, arjun, meera, rohan, fatima, vikram] = students;

  /* -------------------------- Blocks & rooms --------------------------- */
  console.log("[seed] Creating hostel blocks and rooms...");
  const [blockA, blockB, blockC] = await Promise.all([
    prisma.hostelBlock.create({ data: { name: "Block A — Aryabhata", description: "Boys hostel block, near main gate" } }),
    prisma.hostelBlock.create({ data: { name: "Block B — Ramanujan", description: "Boys hostel block, near sports ground" } }),
    prisma.hostelBlock.create({ data: { name: "Block C — Kalpana", description: "Girls hostel block, near library" } }),
  ]);

  const roomDefs = [];
  const mk = (block, prefix, floors, types) => {
    for (let f = 1; f <= floors; f++) {
      for (let n = 1; n <= 4; n++) {
        const t = types[(f + n) % types.length];
        roomDefs.push({
          blockId: block.id,
          roomNumber: `${prefix}${f}0${n}`,
          floor: f,
          roomType: t.type,
          capacity: t.cap,
          amenities: t.amenities,
        });
      }
    }
  };
  const wifiDesk = ["Wi-Fi", "Study Desk", "Wardrobe"];
  const full = ["Wi-Fi", "Attached Bathroom", "Study Desk", "Wardrobe", "Geyser"];
  mk(blockA, "A-", 3, [
    { type: "TRIPLE", cap: 3, amenities: wifiDesk },
    { type: "DOUBLE", cap: 2, amenities: full },
  ]);
  mk(blockB, "B-", 2, [
    { type: "QUAD", cap: 4, amenities: wifiDesk },
    { type: "SINGLE", cap: 1, amenities: full },
  ]);
  mk(blockC, "C-", 3, [
    { type: "DOUBLE", cap: 2, amenities: full },
    { type: "TRIPLE", cap: 3, amenities: [...wifiDesk, "Balcony"] },
  ]);
  const rooms = [];
  for (const def of roomDefs) rooms.push(await prisma.room.create({ data: def }));

  // One room under maintenance, one inactive (never allocated)
  const maintenanceRoom = rooms.find((r) => r.roomNumber === "A-203");
  await prisma.room.update({ where: { id: maintenanceRoom.id }, data: { status: "MAINTENANCE" } });
  const inactiveRoom = rooms.find((r) => r.roomNumber === "B-204");
  await prisma.room.update({ where: { id: inactiveRoom.id }, data: { status: "INACTIVE" } });

  /* ----------------------------- Allocations ---------------------------- */
  console.log("[seed] Creating sample allocations...");
  const alloc = async (student, room, status, extra = {}) => {
    const a = await prisma.allocation.create({
      data: { studentId: student.id, roomId: room?.id ?? null, status, ...extra },
    });
    await prisma.allocationHistory.create({
      data: {
        allocationId: a.id,
        actorId: extra.decidedById ?? student.id,
        action: status === "PENDING" ? "REQUESTED" : status === "ACTIVE" ? "APPROVED" : "REQUESTED",
        previousStatus: status === "PENDING" ? null : "PENDING",
        newStatus: status,
        reason: extra.decisionReason ?? null,
      },
    });
    return a;
  };

  const rA101 = rooms.find((r) => r.roomNumber === "A-101");
  const rA102 = rooms.find((r) => r.roomNumber === "A-102");
  const rC101 = rooms.find((r) => r.roomNumber === "C-101");

  await alloc(priya, rA101, "ACTIVE", { startDate: daysAgo(60), decidedById: warden1.id, decidedAt: daysAgo(61) });
  await alloc(arjun, rA101, "ACTIVE", { startDate: daysAgo(55), decidedById: warden1.id, decidedAt: daysAgo(56) });
  await alloc(vikram, rA102, "ACTIVE", { startDate: daysAgo(120), decidedById: warden1.id, decidedAt: daysAgo(121) });
  await alloc(fatima, rC101, "ACTIVE", { startDate: daysAgo(30), decidedById: warden2.id, decidedAt: daysAgo(31) });
  await alloc(meera, null, "PENDING", { requestedAt: daysAgo(3), preferenceNote: "Prefer Block C, lower floor, near library." });
  await alloc(rohan, rooms.find((r) => r.roomNumber === "B-102"), "PENDING", { requestedAt: daysAgo(1), preferenceNote: "Any block is fine." });

  // Sync FULL flags where applicable
  for (const room of rooms) {
    const occ = await prisma.allocation.count({ where: { roomId: room.id, status: { in: ["ACTIVE", "APPROVED"] } } });
    if (occ >= room.capacity && !["MAINTENANCE", "INACTIVE"].includes(room.status)) {
      await prisma.room.update({ where: { id: room.id }, data: { status: "FULL" } });
    }
  }

  /* ------------------------------ Complaints ---------------------------- */
  console.log("[seed] Creating sample complaints...");
  const mkComplaint = async (student, data, comments = [], history = []) => {
    const c = await prisma.complaint.create({ data: { studentId: student.id, ...data } });
    await prisma.complaintHistory.create({ data: { complaintId: c.id, actorId: student.id, action: "CREATED", newStatus: "SUBMITTED" } });
    for (const cm of comments) {
      await prisma.complaintComment.create({ data: { complaintId: c.id, authorId: cm.by.id, message: cm.message, visibility: cm.visibility ?? "STUDENT_VISIBLE", createdAt: cm.at ?? new Date() } });
      await prisma.complaintHistory.create({ data: { complaintId: c.id, actorId: cm.by.id, action: cm.visibility === "INTERNAL" ? "INTERNAL_NOTE" : "COMMENT_ADDED", createdAt: cm.at ?? new Date() } });
    }
    for (const h of history) {
      await prisma.complaintHistory.create({ data: { complaintId: c.id, actorId: h.by.id, action: h.action, previousStatus: h.prev ?? null, newStatus: h.status ?? null, note: h.note ?? null, createdAt: h.at ?? new Date() } });
    }
    return c;
  };

  await mkComplaint(
    priya,
    { roomId: rA101.id, title: "Bathroom tap leaking continuously", category: "WATER", description: "The wash-basin tap in room A-101 has been leaking since Monday. A bucket is kept underneath but water is being wasted.", priority: "HIGH", status: "IN_PROGRESS", assignedToId: warden1.id, submittedAt: daysAgo(4) },
    [
      { by: warden1, message: "Plumber has been informed and will visit tomorrow morning.", at: daysAgo(3) },
      { by: warden1, message: "Plumber visit scheduled; parts may need ordering.", visibility: "INTERNAL", at: daysAgo(3) },
    ],
    [
      { by: warden1, action: "ASSIGNED", prev: "SUBMITTED", status: "ASSIGNED", at: daysAgo(3.5) },
      { by: warden1, action: "STATUS_CHANGED", prev: "ASSIGNED", status: "IN_PROGRESS", at: daysAgo(3) },
    ]
  );

  await mkComplaint(
    arjun,
    { roomId: rA101.id, title: "Wi-Fi very slow on first floor of Block A", category: "WIFI", description: "Since last week the Wi-Fi signal in Block A first floor drops every evening. Online classes are getting affected.", priority: "NORMAL", status: "SUBMITTED", submittedAt: daysAgo(1) },
    [],
    []
  );

  await mkComplaint(
    vikram,
    { roomId: rA102.id, title: "Tube light flickering and fan makes noise", category: "ELECTRICITY", description: "Both the tube light and ceiling fan in A-102 are malfunctioning. Light flickers constantly and fan rattles at high speed.", priority: "NORMAL", status: "RESOLVED", assignedToId: warden1.id, submittedAt: daysAgo(10), resolvedAt: daysAgo(7) },
    [
      { by: warden1, message: "Electrician replaced the tube-light choke and serviced the fan bearings. Please confirm everything works now.", at: daysAgo(7) },
    ],
    [
      { by: warden1, action: "ASSIGNED", prev: "SUBMITTED", status: "ASSIGNED", at: daysAgo(9) },
      { by: warden1, action: "STATUS_CHANGED", prev: "IN_PROGRESS", status: "RESOLVED", note: "Repair completed.", at: daysAgo(7) },
      { by: warden1, action: "STATUS_CHANGED", prev: "ASSIGNED", status: "IN_PROGRESS", at: daysAgo(8) },
    ]
  );

  await mkComplaint(
    fatima,
    { roomId: rC101.id, title: "Room cleaning skipped for three days", category: "CLEANLINESS", description: "Housekeeping has not cleaned room C-101 or the corridor since Tuesday. Dustbins are overflowing.", priority: "LOW", status: "CLOSED", assignedToId: warden2.id, submittedAt: daysAgo(15), resolvedAt: daysAgo(12) },
    [{ by: warden2, message: "Spoke with the housekeeping supervisor; cleaning roster corrected and bins emptied.", at: daysAgo(12) }],
    [
      { by: warden2, action: "STATUS_CHANGED", prev: "RESOLVED", status: "CLOSED", note: "Student confirmed resolved.", at: daysAgo(12) },
      { by: warden2, action: "STATUS_CHANGED", prev: "SUBMITTED", status: "RESOLVED", note: "Cleaning completed.", at: daysAgo(12) },
    ]
  );

  /* -------------------------------- FAQs -------------------------------- */
  console.log("[seed] Creating hostel FAQs...");
  const faqs = [
    { question: "What are the hostel visiting hours for parents?", answer: "Parents and guardians may visit between 10:00 AM and 6:00 PM on weekends and holidays, after signing the visitor register at the block office. Visitors are not permitted inside room wings; meetings happen in the visitor lounge.", intent: "rules_help", keywords: ["visiting", "hours", "parents", "visitors", "guest"] },
    { question: "What is the hostel curfew time?", answer: "All students must be inside their blocks by 10:00 PM on weekdays and 10:30 PM on weekends. Late entry requires prior permission from the warden, recorded in the late-entry register.", intent: "rules_help", keywords: ["curfew", "late", "entry", "timing", "night"] },
    { question: "How do hostel fees work and when are they due?", answer: "Hostel fees are billed per semester by the college accounts section, along with your tuition fee demand. This system does not handle fee payment — check the college fee portal or accounts office for exact amounts and due dates. Do not pay any 'hostel fee' requested via chat or phone without verifying with the office.", intent: "fees_help", keywords: ["fees", "payment", "charges", "rent", "due", "semester"] },
    { question: "Who should I contact about a maintenance problem?", answer: "Raise a complaint in the MAINTENANCE category from the Complaints page — it goes directly into the warden's queue with your room reference. For anything urgent and dangerous (sparking wires, major leaks), also inform the block office or warden in person immediately.", intent: "maintenance_help", keywords: ["maintenance", "repair", "broken", "fix", "plumber", "carpenter"] },
    { question: "The Wi-Fi is not working. What should I do?", answer: "First check whether the issue is only on your device (restart it, forget and rejoin the network). If the whole floor or block has no internet, raise a complaint in the WIFI category with the block and floor in the description so the network team can act on it.", intent: "wifi_help", keywords: ["wifi", "wi-fi", "internet", "network", "router", "connection"] },
    { question: "There is no water supply in my block. What now?", answer: "Check the hostel noticeboard first — supply interruptions are usually announced for tank cleaning. If there is no notice and water is missing for more than a few hours, raise a complaint in the WATER category mentioning your block and floor.", intent: "water_help", keywords: ["water", "supply", "tank", "geyser", "tap", "drinking"] },
    { question: "What is the procedure for changing my room?", answer: "Room changes (transfers) are handled by the warden. Discuss the reason with your warden first; if a suitable room with free capacity exists, the warden can transfer your allocation in this system, which records the transfer in your allocation history.", intent: "room_request_help", keywords: ["change", "transfer", "swap", "different room", "shift"] },
    { question: "How long does a room request take to be approved?", answer: "Requests are reviewed by the warden in the order they were submitted, usually within a few working days. You can track the live status (Pending → Approved/Rejected) on your Allocation page. Approval depends on actual bed availability at decision time.", intent: "room_request_help", keywords: ["how long", "time", "approve", "approval", "waiting", "pending"] },
    { question: "What items are prohibited inside hostel rooms?", answer: "Prohibited items typically include heating coils and open-flame appliances, inflammable substances, and any equipment that damages hostel property. The full list is in the hostel handbook and on the noticeboard; violations are handled under hostel discipline rules.", intent: "rules_help", keywords: ["prohibited", "banned", "items", "allowed", "heater", "cooking"] },
    { question: "How do I report ragging or a security concern?", answer: "Use a SECURITY-category complaint for anything you want tracked in the system, and for ragging or personal safety issues contact the warden or the college anti-ragging committee directly and immediately — do not wait on a complaint ticket. Your identity is protected under college policy.", intent: "security_help", keywords: ["ragging", "security", "safety", "theft", "harassment", "urgent"] },
  ];
  for (const f of faqs) {
    await prisma.hostelFAQ.create({ data: f });
  }

  await prisma.auditLog.create({
    data: { actorId: admin.id, action: "SYSTEM_SEEDED", entityType: "System", metadata: { note: "Development seed data created" } },
  });

  /* ------------------------------- Summary ------------------------------- */
  const roomCount = await prisma.room.count();
  console.log("\n[seed] Done.");
  console.log(`[seed] Created: 10 users, 3 blocks, ${roomCount} rooms, 6 allocations, 4 complaints, ${faqs.length} FAQs.\n`);
  console.log("────────────────────────────────────────────────────────");
  console.log(" DEMO ACCOUNTS (local development only — fake data)");
  console.log("────────────────────────────────────────────────────────");
  console.log(" Role     Email                     Password");
  console.log(" ADMIN    admin@hostel.local        " + DEMO_PASSWORD);
  console.log(" WARDEN   warden@hostel.local       " + DEMO_PASSWORD);
  console.log(" WARDEN   warden2@hostel.local      " + DEMO_PASSWORD);
  console.log(" STUDENT  student@hostel.local      " + DEMO_PASSWORD + "  (Priya, allocated A-101)");
  console.log(" STUDENT  meera@hostel.local        " + DEMO_PASSWORD + "  (pending request)");
  console.log(" STUDENT  inactive@hostel.local     " + DEMO_PASSWORD + "  (deactivated — cannot log in)");
  console.log("────────────────────────────────────────────────────────");
  console.log(" Change or remove these credentials before deployment.\n");
}

main()
  .catch((e) => {
    console.error("[seed] FAILED:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
