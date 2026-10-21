import { config } from "../config/index.js";

/**
 * OPTIONAL server-side LLM adapter ("openai-compatible" chat completions).
 * - Only used when CHAT_PROVIDER=openai-compatible AND CHAT_PROVIDER_API_KEY is set.
 * - The key lives in server environment only; browser JS never sees it.
 * - We send ONLY the user's question + role + a safe system prompt.
 *   Private student records are never forwarded to an external provider.
 * - Any failure (network, auth, timeout) resolves to null so the caller
 *   transparently falls back to the local rule-based assistant.
 */
export function aiProviderEnabled() {
  return (
    config.CHAT_PROVIDER === "openai-compatible" &&
    Boolean(config.CHAT_PROVIDER_API_KEY) &&
    Boolean(config.CHAT_PROVIDER_BASE_URL)
  );
}

const SYSTEM_PROMPT = [
  "You are a polite help assistant for a college hostel management system.",
  "Answer briefly and honestly. If you are not sure, say so and suggest contacting the hostel warden.",
  "Never invent room availability, fees, policies, or personal information.",
  "Never claim you performed an action (approving rooms, closing complaints). Direct users to the app's forms instead.",
].join(" ");

export async function askAiProvider(userMessage, { role }) {
  if (!aiProviderEnabled()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${config.CHAT_PROVIDER_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.CHAT_PROVIDER_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.CHAT_PROVIDER_MODEL || undefined,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `User role: ${role}. Question: ${userMessage}` },
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[chatbot] AI provider responded ${res.status}; falling back to local assistant.`);
      return null;
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text ? { text, source: "ai" } : null;
  } catch (err) {
    console.warn(`[chatbot] AI provider error (${err.message}); falling back to local assistant.`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
