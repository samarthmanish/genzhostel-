import { Router } from "express";
import rateLimit from "express-rate-limit";
import * as ctrl from "../controllers/chatController.js";
import { authenticate } from "../middleware/authenticate.js";
import { validate } from "../middleware/validate.js";
import { chatMessageSchema } from "../validators/chatValidators.js";

const router = Router();
router.use(authenticate);

// Abuse guard: chat is cheap but not free — cap messages per user window.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (req) => req.user?.id ?? req.ip,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: { code: "CHAT_RATE_LIMIT", message: "You're sending messages too fast. Please wait a moment." } },
});

router.post("/chat/message", chatLimiter, validate({ body: chatMessageSchema }), ctrl.chatMessageHandler);
router.get("/chat/faqs", ctrl.faqsHandler);
router.get("/chat/history", ctrl.historyHandler);

export default router;
