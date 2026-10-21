import { z } from "zod";
import { MAX_MESSAGE_LENGTH } from "../chatbot/chatService.js";

export const chatMessageSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Message cannot be empty.")
    .max(MAX_MESSAGE_LENGTH, `Messages are limited to ${MAX_MESSAGE_LENGTH} characters.`),
});
