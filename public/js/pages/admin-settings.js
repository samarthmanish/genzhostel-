import { api } from "../api.js";
import { requireAuth } from "../auth.js";
import { buildShell } from "../shell.js";
import { h, icon, statusBadge, formField, openModal, confirmDialog, setPending, toastSuccess, toastError, emptyState, errorState } from "../ui.js";

const user = await requireAuth(["ADMIN"]);
if (!user) throw new Error("redirecting");

await buildShell({
  user,
  pageTitle: "Hostel Configuration",
  breadcrumb: "System · Settings",
  activeHref: "/admin/settings.html",
  renderPage: async ({ content }) => {
    content.append(h("div", { class: "page-head" },
      h("div", {},
        h("h1", { text: "Settings" }),
        h("p", { class: "text-muted text-small", style: "margin:0", text: "Hostel blocks and the chatbot's FAQ knowledge base. All changes are validated and audited." }))));

    /* ---------------- Blocks ---------------- */
    const blocksCard = h("div", { class: "card" },
      h("div", { class: "card-head" }, icon("building", 18), h("h3", { text: "Hostel blocks" }),
        h("div", { class: "card-actions" }, h("button", { class: "btn btn-primary btn-sm", id: "add-block" }, icon("plus", 14), "Add block"))),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    content.append(blocksCard);

    /* ---------------- FAQs ---------------- */
    const faqCard = h("div", { class: "card section-gap" },
      h("div", { class: "card-head" }, icon("chat", 18), h("h3", { text: "Chatbot FAQ knowledge base" }),
        h("div", { class: "card-actions" }, h("button", { class: "btn btn-primary btn-sm", id: "add-faq" }, icon("plus", 14), "Add FAQ"))),
      h("p", { class: "text-small text-muted", text: "These answers power the Hostel Help assistant. Keyword matching connects student questions to the right FAQ. Changes appear in chat within a minute." }),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    content.append(faqCard);

    /* ---------------- Enums (read-only reference) ---------------- */
    const enumsCard = h("div", { class: "card section-gap" },
      h("div", { class: "card-head" }, icon("settings", 18), h("h3", { text: "Configured values" })),
      h("p", { class: "text-small text-muted", text: "Categories and statuses are enforced by the database schema; shown here for reference." }),
      h("div", { class: "loading-row" }, h("div", { class: "spinner" })));
    content.append(enumsCard);

    document.getElementById("add-block").addEventListener("click", () => blockModal(null, loadBlocks));
    document.getElementById("add-faq").addEventListener("click", () => faqModal(null, loadFaqs));

    async function loadBlocks() {
      const body = blocksCard.querySelector(".loading-row, .table-wrap, .empty-state");
      const fresh = h("div", { class: "loading-row" }, h("div", { class: "spinner" }));
      body?.replaceWith(fresh);
      try {
        const data = await api("/blocks");
        const table = data.items.length
          ? h("div", { class: "table-wrap" }, h("table", { class: "data-table" },
              h("thead", {}, h("tr", {}, h("th", { text: "Block" }), h("th", { text: "Description" }), h("th", { text: "Rooms" }), h("th", { text: "Status" }), h("th", { text: "" }))),
              h("tbody", {}, ...data.items.map((b) => h("tr", {},
                h("td", { "data-label": "Block", style: "font-weight:650", text: b.name }),
                h("td", { "data-label": "Description", class: "text-small text-muted", text: b.description ?? "—" }),
                h("td", { "data-label": "Rooms", text: String(b.roomCount) }),
                h("td", { "data-label": "Status" }, b.isActive ? statusBadge("ACTIVE") : statusBadge("INACTIVE")),
                h("td", {}, h("div", { class: "row-actions" },
                  h("button", { class: "btn btn-secondary btn-sm", onclick: () => blockModal(b, loadBlocks) }, "Edit"))))))))
          : emptyState({ iconName: "building", title: "No blocks yet", message: "Add your first hostel block to start creating rooms." });
        fresh.replaceWith(table);
      } catch (err) {
        fresh.replaceWith(errorState(err.message, loadBlocks));
      }
    }

    async function loadFaqs() {
      const body = faqCard.querySelector(".loading-row, .faq-list, .empty-state");
      const fresh = h("div", { class: "loading-row" }, h("div", { class: "spinner" }));
      body?.replaceWith(fresh);
      try {
        const data = await api("/settings/faqs");
        const list = h("div", { class: "faq-list" });
        if (!data.items.length) {
          fresh.replaceWith(emptyState({ iconName: "chat", title: "No FAQs yet", message: "Add the questions students ask most — the assistant will use them." }));
          return;
        }
        for (const f of data.items) {
          list.append(h("div", { class: "faq-item" },
            h("div", { style: "min-width:0" },
              h("div", { class: "faq-q" }, f.question, f.isPublished ? null : h("span", { class: "badge badge-neutral", style: "margin-left:8px", text: "unpublished" })),
              h("div", { class: "faq-a", text: f.answer }),
              h("div", { class: "text-small text-muted", style: "margin-top:4px" },
                h("code", { text: f.intent }), f.keywords?.length ? ` · ${f.keywords.join(", ")}` : "")),
            h("div", { class: "faq-actions" },
              h("button", { class: "btn btn-secondary btn-sm", onclick: () => faqModal(f, loadFaqs) }, icon("edit", 13)),
              h("button", { class: "btn btn-danger-subtle btn-sm", "aria-label": `Delete FAQ: ${f.question}`, onclick: () => deleteFaq(f, loadFaqs) }, icon("trash", 13)))));
        }
        fresh.replaceWith(list);
      } catch (err) {
        fresh.replaceWith(errorState(err.message, loadFaqs));
      }
    }

    async function deleteFaq(f, reload) {
      const ok = await confirmDialog({
        title: "Delete this FAQ?",
        message: `“${f.question}” will no longer be answered by the assistant. This cannot be undone.`,
        confirmLabel: "Delete FAQ", danger: true,
      });
      if (!ok) return;
      try {
        await api(`/settings/faqs/${f.id}`, { method: "DELETE" });
        toastSuccess("FAQ deleted.");
        reload();
      } catch (err) { toastError(err.message); }
    }

    (async () => {
      const body = enumsCard.querySelector(".loading-row");
      try {
        const e = await api("/settings/enums");
        const section = (title, values) => h("div", { style: "margin-bottom:12px" },
          h("div", { class: "text-small text-muted", style: "font-weight:600;margin-bottom:6px", text: title }),
          h("div", { style: "display:flex;gap:6px;flex-wrap:wrap" }, ...values.map((v) => statusBadge(v))));
        body.replaceWith(h("div", {},
          section("Complaint categories", e.complaintCategories),
          section("Complaint priorities", e.complaintPriorities),
          section("Complaint statuses", e.complaintStatuses),
          section("Allocation statuses", e.allocationStatuses),
          section("Room types", e.roomTypes),
          h("p", { class: "text-small text-muted", text: `Students may reopen resolved complaints within ${e.reopenWindowHours} hours (server setting).` })));
      } catch (err) {
        body.replaceWith(errorState(err.message));
      }
    })();

    loadBlocks();
    loadFaqs();
  },
});

/* ---------------- Block modal ---------------- */
function blockModal(existing, reload) {
  const name = formField({ name: "name", label: "Block name", required: true, value: existing?.name ?? "", placeholder: "e.g. Block D — Bose" });
  const desc = formField({ name: "description", label: "Description (optional)", value: existing?.description ?? "", textarea: true, rows: 2 });
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "submit", text: existing ? "Save" : "Create block" });
  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    setPending(submit, true, "Saving…");
    try {
      const body = { name: name.input.value.trim(), description: desc.input.value.trim() };
      if (existing) await api(`/blocks/${existing.id}`, { method: "PATCH", body });
      else await api("/blocks", { method: "POST", body });
      modal.close(); toastSuccess(existing ? "Block updated." : "Block created."); reload();
    } catch (e2) {
      err.className = "form-banner error visible";
      err.textContent = e2.details?.map((d) => d.message).join(" ") || e2.message;
      setPending(submit, false);
    }
  } }, err, name.el, desc.el, submit);
  const modal = openModal({ title: existing ? "Edit block" : "Add hostel block", content: form,
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel")] });
}

/* ---------------- FAQ modal ---------------- */
function faqModal(existing, reload) {
  const question = formField({ name: "question", label: "Question", required: true, value: existing?.question ?? "" });
  const answer = formField({ name: "answer", label: "Answer", required: true, value: existing?.answer ?? "", textarea: true, rows: 4,
    help: "Be accurate — the assistant will not invent information beyond this text." });
  const intent = formField({ name: "intent", label: "Intent tag", required: true, value: existing?.intent ?? "", placeholder: "e.g. mess_help, wifi_help",
    help: "Groups related FAQs; e.g. wifi_help answers Wi-Fi questions." });
  const keywords = formField({ name: "keywords", label: "Keywords (comma separated)", value: (existing?.keywords ?? []).join(", "),
    placeholder: "wifi, internet, router", help: "Used for matching student questions." });
  const publishedId = "faq-published";
  const published = h("input", { type: "checkbox", id: publishedId });
  published.checked = existing?.isPublished ?? true;
  const err = h("div", { class: "form-banner", role: "alert" });
  const submit = h("button", { class: "btn btn-primary", type: "submit", text: existing ? "Save FAQ" : "Add FAQ" });

  const form = h("form", { onsubmit: async (e) => {
    e.preventDefault();
    setPending(submit, true, "Saving…");
    try {
      const body = {
        question: question.input.value.trim(),
        answer: answer.input.value.trim(),
        intent: intent.input.value.trim(),
        keywords: keywords.input.value.split(",").map((k) => k.trim()).filter(Boolean),
        isPublished: published.checked,
      };
      if (existing) await api(`/settings/faqs/${existing.id}`, { method: "PATCH", body: { id: existing.id, ...body } });
      else await api("/settings/faqs", { method: "POST", body });
      modal.close(); toastSuccess("FAQ saved — the assistant picks it up within a minute."); reload();
    } catch (e2) {
      err.className = "form-banner error visible";
      err.textContent = e2.details?.map((d) => d.message).join(" ") || e2.message;
      setPending(submit, false);
    }
  } }, err, question.el, answer.el, h("div", { class: "form-row" }, intent.el, keywords.el),
    h("label", { class: "checkbox-line", style: "margin-bottom:16px", for: publishedId }, published, "Published (visible to the assistant)"),
    submit);

  const modal = openModal({ title: existing ? "Edit FAQ" : "Add FAQ", content: form, size: "modal-lg",
    actions: [h("button", { class: "btn btn-secondary", onclick: () => modal.close() }, "Cancel")] });
}
