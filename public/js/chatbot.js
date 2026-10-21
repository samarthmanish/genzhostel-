/**
 * Hostel Help Assistant — floating chat widget.
 * Talks to POST /api/v1/chat/message (rate-limited, authenticated).
 * The backend decides answers; the UI only renders text/links safely.
 * Links returned by the server are restricted to same-origin relative paths.
 */
import { api } from "./api.js";
import { h, icon, toastError } from "./ui.js";

const LS_OPEN = "hms-chat-open";

export function mountChatWidget(user) {
  if (document.getElementById("chat-fab")) return;

  let open = false;
  let greeted = false;

  const body = h("div", { class: "chat-body", id: "chat-body", role: "log", "aria-live": "polite", "aria-label": "Chat messages" });
  const suggest = h("div", { class: "chat-suggest", id: "chat-suggest" });
  const input = h("input", {
    type: "text",
    id: "chat-input",
    placeholder: "Ask about rooms, complaints, FAQs…",
    "aria-label": "Message the hostel help assistant",
    maxlength: "1000",
    autocomplete: "off",
  });
  const sendBtn = h("button", { class: "btn btn-primary btn-sm", "aria-label": "Send message", onclick: () => send() }, icon("send", 15));

  const panel = h("section", { class: "chat-panel", id: "chat-panel", hidden: true, "aria-label": "Hostel Help Assistant" },
    h("div", { class: "chat-head" },
      h("span", { class: "avatar", style: "background:var(--color-primary);color:#fff" }, icon("chat", 15)),
      h("div", {},
        h("div", { class: "chat-title", text: "Hostel Help" }),
        h("div", { class: "chat-sub", text: "FAQ assistant · answers use your own account data only" })),
      h("button", { class: "icon-btn", "aria-label": "Close chat", onclick: () => toggle(false) }, icon("close", 16))),
    body,
    suggest,
    h("form", { class: "chat-foot", onsubmit: (e) => { e.preventDefault(); send(); } }, input, sendBtn));

  const fab = h("button", {
    class: "chat-fab",
    id: "chat-fab",
    "aria-label": "Open Hostel Help assistant",
    onclick: () => toggle(true),
  }, icon("chat", 24));

  document.body.append(fab, panel);

  function toggle(next) {
    open = next ?? !open;
    panel.hidden = !open;
    fab.hidden = open;
    try { localStorage.setItem(LS_OPEN, open ? "1" : "0"); } catch { /* ignore */ }
    if (open) {
      input.focus();
      if (!greeted) { greet(); greeted = true; }
    }
  }

  function greet() {
    addBotMessage(
      `Hi ${user.fullName.split(" ")[0]}! I'm the Hostel Help assistant.\nAsk me how to request a room, track a complaint, check availability, or anything from the hostel FAQ. I can also show your own allocation or complaint status.`,
      [],
      ["How do I request a room?", "Show my allocation status", "How can I track my complaint?", "Which rooms are available right now?"]
    );
  }

  function timeNow() {
    return new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  function addUserMessage(text) {
    body.append(h("div", { class: "chat-msg user" },
      h("div", { class: "bubble", text }),
      h("span", { class: "msg-time", text: timeNow() })));
    scrollDown();
  }

  function safeHref(href) {
    // Only allow same-origin relative links suggested by the server.
    if (typeof href !== "string") return null;
    if (href.startsWith("/") && !href.startsWith("//")) return href;
    try {
      const u = new URL(href, window.location.origin);
      return u.origin === window.location.origin ? u.pathname + u.search : null;
    } catch { return null; }
  }

  function addBotMessage(text, links = [], suggested = []) {
    const linksEl = (links ?? [])
      .map((l) => {
        const href = safeHref(l.href);
        if (!href) return null;
        return h("a", { href, class: "chat-link", onclick: () => toggle(false) }, icon("send", 12), l.label ?? href);
      })
      .filter(Boolean);

    body.append(h("div", { class: "chat-msg bot" },
      h("div", { class: "bubble" },
        text,
        linksEl.length ? h("span", { class: "chat-links", style: "margin-top:8px" }, ...linksEl) : null),
      h("span", { class: "msg-time", text: timeNow() })));

    suggest.textContent = "";
    for (const q of suggested ?? []) {
      suggest.append(h("button", { type: "button", onclick: () => { input.value = q; send(); } }, q));
    }
    scrollDown();
  }

  function addTyping() {
    const t = h("div", { class: "chat-msg bot", id: "chat-typing" },
      h("div", { class: "chat-typing" }, h("span"), h("span"), h("span")));
    body.append(t);
    scrollDown();
    return t;
  }

  function scrollDown() {
    body.scrollTop = body.scrollHeight;
  }

  let sending = false;
  async function send() {
    const text = input.value.trim();
    if (!text || sending) return;
    sending = true;
    sendBtn.disabled = true;
    input.value = "";
    addUserMessage(text);
    const typing = addTyping();
    try {
      const res = await api("/chat/message", { method: "POST", body: { message: text } });
      typing.remove();
      addBotMessage(res.reply, res.links, res.suggested);
    } catch (err) {
      typing.remove();
      if (err.status === 429) {
        addBotMessage("You're sending messages a bit too fast — give me a few seconds and try again.", [], []);
      } else {
        addBotMessage("Sorry, I couldn't reach the help service just now. Please try again.", [], []);
        toastError(err.message ?? "Chat request failed.");
      }
    } finally {
      sending = false;
      sendBtn.disabled = false;
      input.focus();
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });

  // Restore open state across pages within the session
  try {
    if (localStorage.getItem(LS_OPEN) === "1") toggle(true);
  } catch { /* ignore */ }
}
