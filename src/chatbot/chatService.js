import { prisma } from "../utils/prisma.js";
import { ApiError } from "../utils/ApiError.js";
import { detectIntent } from "./intents.js";
import { getPublishedFaqs, matchFaq } from "./faqService.js";
import { askAiProvider, aiProviderEnabled } from "./optionalProvider.js";
import { OPEN_COMPLAINT_STATUSES } from "../services/complaintService.js";
import { OCCUPYING_STATUSES } from "../services/roomService.js";

export const MAX_MESSAGE_LENGTH = 1000;

/** Minimal in-memory chat history (demo convenience only; not persisted to DB). */
const history = new Map(); // userId -> [{role, text, at}]
const HISTORY_LIMIT = 50;

function pushHistory(userId, role, text) {
  const list = history.get(userId) ?? [];
  list.push({ role, text, at: new Date().toISOString() });
  if (list.length > HISTORY_LIMIT) list.splice(0, list.length - HISTORY_LIMIT);
  history.set(userId, list);
}

export function getHistory(userId) {
  return history.get(userId) ?? [];
}

/** Role-aware page links. The assistant never links staff pages to students. */
function linksFor(user) {
  const isStudent = user.role === "STUDENT";
  const isAdmin = user.role === "ADMIN";
  return {
    rooms: { label: "Open Room Directory", href: isStudent ? "/student/rooms.html" : "/warden/rooms.html" },
    allocation: { label: "Open Allocation Page", href: isStudent ? "/student/allocation.html" : "/warden/allocations.html" },
    complaints: { label: "Open Complaints", href: isStudent ? "/student/complaints.html" : "/warden/complaints.html" },
    dashboard: {
      label: "Open Dashboard",
      href: isStudent ? "/student/dashboard.html" : isAdmin ? "/admin/dashboard.html" : "/warden/dashboard.html",
    },
    profile: { label: "Open Profile", href: isStudent ? "/student/profile.html" : "/admin/settings.html" },
    reports: { label: "Open Reports", href: isAdmin ? "/admin/reports.html" : "/admin/reports.html" },
  };
}

const STATUS_MEANINGS = {
  SUBMITTED: "your complaint is in the queue and no one has picked it up yet",
  ASSIGNED: "a staff member has been assigned to handle it",
  IN_PROGRESS: "work on it has started",
  RESOLVED: "staff marked it as fixed — you can confirm and reopen it if the problem persists",
  CLOSED: "the complaint was finalized and closed",
  REOPENED: "it went back into the active queue because the issue was not actually fixed",
};

/* ------------------------------------------------------------------ */
/* Data-aware intents — always derived from the AUTHENTICATED user.    */
/* The userId from req.user (session), never from the chat text.       */
/* ------------------------------------------------------------------ */

async function myAllocationStatus(user) {
  const active = await prisma.allocation.findFirst({
    where: { studentId: user.id, status: { in: OCCUPYING_STATUSES } },
    include: { room: { include: { block: true } } },
    orderBy: { startDate: "desc" },
  });
  if (active?.room) {
    return {
      text:
        `You are currently allocated to room ${active.room.roomNumber} in ${active.room.block.name} ` +
        `(floor ${active.room.floor}, ${active.room.roomType.toLowerCase()}). Status: ${active.status}.` +
        (active.startDate ? ` Allocated since ${active.startDate.toISOString().slice(0, 10)}.` : ""),
    };
  }
  const pending = await prisma.allocation.findFirst({
    where: { studentId: user.id, status: "PENDING" },
  });
  if (pending) {
    return {
      text:
        `Your room request (ID ${pending.id.slice(0, 8)}…) is still PENDING — submitted on ` +
        `${pending.requestedAt.toISOString().slice(0, 10)}. A warden has to approve it and assign a room. ` +
        `I can't predict when that will happen, but you can track it on the allocation page.`,
    };
  }
  const last = await prisma.allocation.findFirst({
    where: { studentId: user.id },
    orderBy: { requestedAt: "desc" },
  });
  if (last && last.status === "REJECTED") {
    return {
      text:
        `Your most recent request was REJECTED` +
        (last.decisionReason ? ` with the reason: “${last.decisionReason}”.` : ".") +
        ` You can submit a new request from the allocation page.`,
    };
  }
  return {
    text: "You have no active allocation and no pending request right now. You can request a room from the allocation page — pick a preferred room from the directory first if you like.",
  };
}

async function myComplaintsStatus(user) {
  const [open, total] = await Promise.all([
    prisma.complaint.findMany({
      where: { studentId: user.id, status: { in: OPEN_COMPLAINT_STATUSES } },
      orderBy: { submittedAt: "desc" },
      take: 3,
    }),
    prisma.complaint.count({ where: { studentId: user.id } }),
  ]);
  if (open.length === 0) {
    return { text: `You have no open complaints (out of ${total} total). Everything is resolved or you haven't submitted any yet.` };
  }
  const lines = open.map((c) => `• “${c.title}” — ${c.status.replace(/_/g, " ").toLowerCase()} (${c.category.toLowerCase()})`);
  return {
    text: `You have ${open.length} open complaint${open.length === 1 ? "" : "s"}:\n${lines.join("\n")}\nOpen the complaints page for full details and updates.`,
  };
}

async function roomAvailabilitySummary() {
  const rooms = await prisma.room.findMany({
    where: { status: { notIn: ["INACTIVE", "MAINTENANCE"] } },
    select: { id: true, capacity: true },
  });
  const activeCount = await prisma.allocation.count({ where: { status: { in: OCCUPYING_STATUSES } } });
  const totalBeds = rooms.reduce((s, r) => s + r.capacity, 0);
  const available = Math.max(0, totalBeds - activeCount);
  return {
    text:
      `Right now there are ${available} available bed${available === 1 ? "" : "s"} across ${rooms.length} bookable rooms. ` +
      `For room-level detail (block, type, amenities), open the room directory — availability there is computed live from the database.`,
  };
}

/* ------------------------------------------------------------------ */
/* Static intent responses                                             */
/* ------------------------------------------------------------------ */

function staticReply(intentId, links, isStudent) {
  switch (intentId) {
    case "greeting":
      return { text: "Hello! I'm the Hostel Help assistant. Ask me about requesting a room, tracking complaints, room availability, or hostel FAQs." };
    case "thanks":
      return { text: "You're welcome! Ask me anything else, or use the links in the app to continue." };
    case "capabilities":
      return {
        text:
          "I can help with:\n" +
          "• How to request a room, and your current allocation status\n" +
          "• How to raise and track complaints (maintenance, water, Wi-Fi, etc.)\n" +
          "• Live room availability summaries\n" +
          "• Hostel FAQs (rules, fees, contacts) stored by the hostel office\n" +
          "I can't approve allocations or close complaints myself — those actions go through the normal forms with proper authorization.",
        links: [links.dashboard],
      };
    case "room_request_help":
      return {
        text:
          "To request a room:\n" +
          "1. Open the Room Directory and find a room with available beds (status “Available”).\n" +
          "2. Click “Request this room”, or open the Allocation page and submit a request with your preferences.\n" +
          "3. A warden reviews it — you'll see the status change to Approved (with your assigned room) or Rejected (with a reason).\n" +
          "4. Track everything on the Allocation page, including the full status history.\n" +
          "Note: submitting a request does not guarantee that exact room — the warden makes the final assignment.",
        links: isStudent ? [links.rooms, links.allocation] : [links.allocation],
      };
    case "complaint_help":
      return {
        text:
          "To raise a complaint:\n" +
          "1. Open the Complaints page and click “New complaint”.\n" +
          "2. Fill in a short title, pick the category (maintenance, cleanliness, water, electricity, Wi-Fi, security, other), describe the issue, and optionally link your room and suggest a priority.\n" +
          "3. Submit — you'll get a real complaint ID to track it with.\n" +
          "4. Staff will assign it, update the status, and leave response notes you can read. If a “resolved” complaint isn't actually fixed, you can reopen it within the allowed window.",
        links: [links.complaints],
      };
    case "complaint_status_meaning":
      return {
        text:
          "Complaint statuses mean:\n" +
          Object.entries(STATUS_MEANINGS)
            .map(([k, v]) => `• ${k.replace(/_/g, " ")}: ${v}`)
            .join("\n"),
        links: [links.complaints],
      };
    case "contact_warden":
      return {
        text:
          "I don't have verified warden contact details, so I won't invent any. The reliable routes are: raise a complaint (staff see it immediately in their queue), check the hostel noticeboard/FAQs, or ask the hostel office in person. If the hostel office adds contact FAQs, I'll be able to share them.",
        links: [links.complaints],
      };
    case "password_help":
      return {
        text: isStudent
          ? "You can change your password on your Profile page (it asks for your current password first). If you've forgotten it, contact the hostel office/admin — an admin can reset it for you."
          : "Password changes go through the admin user management screen. Use a strong, unique password.",
        links: [links.profile],
      };
    case "reports_help":
      return isStudent
        ? { text: "Reports (occupancy, allocations, complaints) are available to wardens and admins. If you need a specific number, the warden can export it for you." }
        : { text: "Reports are on the Reports page: occupancy by block/room type, allocation requests by status, complaints by category/status with average resolution time, and CSV export.", links: [links.reports] };
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function handleChatMessage(user, rawMessage) {
  if (typeof rawMessage !== "string" || rawMessage.trim().length === 0) {
    throw ApiError.badRequest("EMPTY_MESSAGE", "Message cannot be empty.");
  }
  const message = rawMessage.trim().slice(0, MAX_MESSAGE_LENGTH);
  const links = linksFor(user);
  const isStudent = user.role === "STUDENT";

  pushHistory(user.id, "user", message);

  let reply;
  const intent = detectIntent(message);

  try {
    if (intent) {
      switch (intent.id) {
        case "my_allocation_status":
          reply = isStudent
            ? { ...(await myAllocationStatus(user)), links: [links.allocation] }
            : { text: "Allocation lookups in chat are scoped to your own record. As staff, use the Allocations page to review any student's request — search by name or student ID.", links: [links.allocation] };
          break;
        case "my_complaints":
          reply = isStudent
            ? { ...(await myComplaintsStatus(user)), links: [links.complaints] }
            : { text: "As staff, open the Complaints page to see the full queue with filters for status, category, priority, and age.", links: [links.complaints] };
          break;
        case "room_availability":
          reply = { ...(await roomAvailabilitySummary()), links: [links.rooms] };
          break;
        default: {
          // Category help intents (water/wifi/...) and policy intents (fees/rules)
          // first try the DB-backed FAQs, then a static fallback.
          const faqs = await getPublishedFaqs();
          const faq = matchFaq(faqs, message);
          if (faq && !staticReply(intent.id, links, isStudent)) {
            reply = { text: faq.answer, links: [links.complaints], faqId: faq.id };
          } else {
            reply =
              staticReply(intent.id, links, isStudent) ?? {
                text: `Here's the official FAQ on that:\n${faq?.answer ?? ""}`,
                links: [links.complaints],
              };
            if (faq && !reply.text.includes(faq.answer)) {
              reply.text += `\n\nFAQ from the hostel office: ${faq.answer}`;
            }
          }
        }
      }
    } else {
      // No intent matched — try FAQ, then honest fallback.
      const faqs = await getPublishedFaqs();
      const faq = matchFaq(faqs, message);
      if (faq) {
        reply = { text: faq.answer, links: [], faqId: faq.id };
      } else if (aiProviderEnabled()) {
        const ai = await askAiProvider(message, { role: user.role });
        reply = ai
          ? { text: `${ai.text}\n\n(AI-assisted answer — for official decisions, always verify with the hostel office.)`, links: [links.dashboard], source: "ai" }
          : fallbackReply(links);
      } else {
        reply = fallbackReply(links);
      }
    }
  } catch (err) {
    // A data lookup failed — be honest rather than fabricating an answer.
    console.error("[chatbot] error handling message:", err.message);
    reply = {
      text: "Sorry — I couldn't fetch live data for that just now. Please try again in a moment, or open the relevant page directly.",
      links: [links.dashboard],
    };
  }

  pushHistory(user.id, "assistant", reply.text);
  return {
    reply: reply.text,
    links: reply.links ?? [],
    suggested: suggestedQuestions(user),
    source: reply.source ?? "local",
  };
}

function fallbackReply(links) {
  return {
    text:
      "I'm not sure how to answer that — I only know what's in the hostel's FAQ list and your own account data. " +
      "You can try one of the suggested questions below, browse the FAQs, or raise a complaint so staff can help directly. " +
      "For anything urgent, contact the hostel office.",
    links: [links.complaints, links.dashboard],
  };
}

function suggestedQuestions(user) {
  const base = [
    "How do I request a room?",
    "How can I track my complaint?",
    "What does In Progress mean?",
    "Which rooms are available right now?",
  ];
  if (user.role === "STUDENT") base.push("Show my allocation status");
  if (user.role !== "STUDENT") base.push("How do reports work?");
  base.push("Who should I contact about maintenance?");
  return base.slice(0, 6);
}
