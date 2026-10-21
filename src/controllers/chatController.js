import { handleChatMessage, getHistory } from "../chatbot/chatService.js";
import { prisma } from "../utils/prisma.js";

export async function chatMessageHandler(req, res, next) {
  try {
    // user id comes from the authenticated session — never from the message body
    const result = await handleChatMessage(req.user, req.body.message);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function faqsHandler(req, res, next) {
  try {
    const items = await prisma.hostelFAQ.findMany({
      where: { isPublished: true },
      select: { id: true, question: true, answer: true, intent: true },
      orderBy: { question: "asc" },
    });
    res.json({ items });
  } catch (err) {
    next(err);
  }
}

export async function historyHandler(req, res) {
  res.json({ items: getHistory(req.user.id) });
}
