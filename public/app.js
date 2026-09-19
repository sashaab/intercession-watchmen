const tg = window.Telegram?.WebApp;
const state = {
  me: null,
  meta: null,
  view: "mine",
  selectedId: null,
};

const el = {
  app: document.getElementById("app"),
  userLine: document.getElementById("userLine"),
  roleBadge: document.getElementById("roleBadge"),
  nav: document.getElementById("nav"),
  main: document.getElementById("main"),
  toast: document.getElementById("toast"),
  toastBody: document.getElementById("toastBody"),
};

function toast(message) {
  el.toast.hidden = false;
  el.toastBody.textContent = message;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    el.toast.hidden = true;
  }, 2600);
}

function headers() {
  const h = { "Content-Type": "application/json" };
  if (tg?.initData) h["x-telegram-init-data"] = tg.initData;
  return h;
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function isLeader() {
  return state.me?.role === "leader" || state.me?.role === "admin";
}

function navItems() {
  const items = [{ id: "mine", label: "My history" }];
  if (isLeader()) {
    items.push(
      { id: "inbox", label: "Inbox" },
      { id: "radar", label: "Radar" },
      { id: "prayer", label: "Prayer" },
      { id: "learning", label: "Learning" },
    );
  }
  if (state.me?.role === "admin") {
    items.push({ id: "roles", label: "Roles" });
  }
  return items;
}

function renderNav() {
  el.nav.innerHTML = navItems()
    .map(
      (item) =>
        `<button type="button" data-view="${item.id}" class="nav-link ${
          state.view === item.id ? "active" : ""
        }">${item.label}</button>`,
    )
    .join("");
  el.nav.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.view = btn.dataset.view;
      state.selectedId = null;
      render();
    });
  });
}

async function render() {
  renderNav();
  el.main.innerHTML = `<div class="panel"><p class="panel-lead mb-0">Loading…</p></div>`;
  try {
    if (state.view === "mine") await renderMine();
    else if (state.view === "inbox") await renderInbox();
    else if (state.view === "detail") await renderDetail();
    else if (state.view === "radar") await renderRadar();
    else if (state.view === "prayer") await renderPrayer();
    else if (state.view === "learning") await renderLearning();
    else if (state.view === "roles") await renderRoles();
    else await renderMine();
  } catch (err) {
    el.main.innerHTML = `<div class="panel"><p class="panel-lead mb-0">${escapeHtml(
      err.message,
    )}</p></div>`;
  }
}

function previewBanner() {
  if (tg?.initData) return "";
  return `<div class="preview-banner">Browser preview mode (DEV_PREVIEW). In Telegram the same UI opens as a Mini App.</div>`;
}

function impressionCard(item, { openable = true } = {}) {
  const lock = item.confidential ? `<span class="tag lock">Confidential</span>` : "";
  const urgency =
    item.urgency === "high" || item.urgency === "medium"
      ? `<span class="tag hot">${escapeHtml(item.urgency)}</span>`
      : "";
  const body =
    item.confidential && !isLeader() && item.watchman_id !== state.me.id
      ? "[restricted]"
      : item.perceived;
  const attrs = openable
    ? `type="button" class="item" data-id="${item.id}"`
    : `class="item" style="cursor:default"`;
  return `
    <button ${attrs}>
      <div class="item-title">
        <span>#${item.id} · ${escapeHtml(item.status)}</span>
        <span>${lock} ${urgency}</span>
      </div>
      <div class="item-meta">${escapeHtml(item.watchman_name)} · ${escapeHtml(
        item.created_at,
      )} · ${escapeHtml(item.topic_cluster || item.context)}</div>
      <div class="item-body">${escapeHtml(body).slice(0, 220)}</div>
    </button>
  `;
}

async function renderMine() {
  const { items } = await api("/impressions/mine");
  el.main.innerHTML = `
    <section class="panel">
      ${previewBanner()}
      <h2 class="panel-title">My history</h2>
      <p class="panel-lead">Record new impressions in the Telegram bot (/new). This app is for review.</p>
      <div class="d-grid gap-2">
        ${
          items.length
            ? items.map((i) => impressionCard(i)).join("")
            : `<p class="empty mb-0">No impressions yet. Use the bot: /new</p>`
        }
      </div>
    </section>
  `;
  wireOpen();
}

async function renderInbox() {
  const { items } = await api("/inbox");
  const statuses = state.meta.statuses
    .map((s) => `<option value="${s.id}">${escapeHtml(s.label)}</option>`)
    .join("");
  el.main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Leadership inbox</h2>
      <p class="panel-lead">Who noticed what → review → decision → outcome.</p>
      <div class="mb-3">
        <label class="form-label" for="statusFilter">Filter status</label>
        <select class="form-select" id="statusFilter">
          <option value="">All recent</option>
          ${statuses}
        </select>
      </div>
      <div id="inboxList" class="d-grid gap-2">
        ${
          items.length
            ? items.map((i) => impressionCard(i)).join("")
            : `<p class="empty mb-0">Inbox is empty.</p>`
        }
      </div>
    </section>
  `;
  wireOpen();
  document.getElementById("statusFilter").addEventListener("change", async (e) => {
    const status = e.target.value;
    const q = status ? `?status=${encodeURIComponent(status)}` : "";
    const data = await api(`/inbox${q}`);
    const list = document.getElementById("inboxList");
    list.innerHTML = data.items.length
      ? data.items.map((i) => impressionCard(i)).join("")
      : `<p class="empty mb-0">No items.</p>`;
    wireOpen();
  });
}

function wireOpen() {
  el.main.querySelectorAll("[data-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedId = Number(btn.dataset.id);
      state.view = "detail";
      render();
    });
  });
}

async function renderDetail() {
  const { item } = await api(`/impressions/${state.selectedId}`);
  const statusOptions = state.meta.statuses
    .map(
      (s) =>
        `<option value="${s.id}" ${s.id === item.status ? "selected" : ""}>${escapeHtml(
          s.label,
        )}</option>`,
    )
    .join("");

  el.main.innerHTML = `
    <section class="panel">
      <button type="button" class="btn btn-watch-outline mb-3" id="backBtn">← Back</button>
      <h2 class="panel-title">Impression #${item.id}</h2>
      <div class="detail-grid">
        <div><span class="muted">Watcher</span><br>${escapeHtml(item.watchman_name)}</div>
        <div><span class="muted">Type / context</span><br>${escapeHtml(
          item.type,
        )} · ${escapeHtml(item.context)}</div>
        <div><span class="muted">Urgency</span><br>${escapeHtml(item.urgency)}</div>
        <div><span class="muted">Prayed / confidential</span><br>${
          item.prayed ? "Yes" : "No"
        } / ${item.confidential ? "Yes" : "No"}</div>
      </div>
      <h3>Perceived</h3>
      <p class="item-body">${escapeHtml(item.perceived)}</p>
      <h3>Interpretation</h3>
      <p class="item-body muted">${escapeHtml(item.interpretation || "(none)")}</p>
      ${
        item.ai_recommendation
          ? `<div class="ai-box">${escapeHtml(item.ai_recommendation)}</div>`
          : ""
      }
      ${
        isLeader()
          ? `
        <div class="mb-3 mt-3">
          <label class="form-label" for="statusSelect">Status</label>
          <select class="form-select" id="statusSelect">${statusOptions}</select>
        </div>
        <div class="mb-3">
          <label class="form-label" for="decisionNotes">Decision notes</label>
          <textarea class="form-control" id="decisionNotes" placeholder="What was reviewed / decided">${escapeHtml(
            item.decision_notes || "",
          )}</textarea>
        </div>
        <div class="mb-3">
          <label class="form-label" for="forwardedTo">Forwarded to</label>
          <input class="form-control" id="forwardedTo" value="${escapeHtml(
            item.forwarded_to || "",
          )}" />
        </div>
        <div class="mb-3">
          <label class="form-label" for="outcome">Outcome</label>
          <textarea class="form-control" id="outcome">${escapeHtml(item.outcome || "")}</textarea>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-watch" id="saveStatus">Save decision</button>
          <button type="button" class="btn btn-watch-ghost" id="makePrayer">Create prayer focus</button>
        </div>
      `
          : `<p class="panel-lead mb-0">Status: <strong>${escapeHtml(item.status)}</strong></p>`
      }
    </section>
  `;

  document.getElementById("backBtn").addEventListener("click", () => {
    state.view = isLeader() ? "inbox" : "mine";
    render();
  });

  document.getElementById("saveStatus")?.addEventListener("click", async () => {
    try {
      await api(`/impressions/${item.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status: document.getElementById("statusSelect").value,
          decisionNotes: document.getElementById("decisionNotes").value,
          forwardedTo: document.getElementById("forwardedTo").value,
          outcome: document.getElementById("outcome").value,
        }),
      });
      toast("Decision saved");
      render();
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("makePrayer")?.addEventListener("click", async () => {
    const title = item.topic_cluster || `${item.context} focus`;
    try {
      const data = await api("/prayer", {
        method: "POST",
        body: JSON.stringify({ title, impressionId: item.id }),
      });
      toast(`Prayer focus #${data.item.id}`);
      state.view = "prayer";
      render();
    } catch (err) {
      toast(err.message);
    }
  });
}

async function renderRadar() {
  const { items } = await api("/radar");
  el.main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Topic radar</h2>
      <p class="panel-lead">Recurring themes from independent watchers (10 days).</p>
      <div class="d-grid gap-2">
        ${
          items.length
            ? items
                .map(
                  (r) => `
            <div class="item" style="cursor:default">
              <div class="item-title"><span>${escapeHtml(r.topic)}</span><span class="tag">${
                    r.count
                  }</span></div>
              <div class="item-meta">${r.watchmen} watchers · ids ${escapeHtml(
                    r.sample_ids,
                  )}</div>
              <div class="item-body muted">Relevant? Pray together? Forward? Keep monitoring?</div>
            </div>`,
                )
                .join("")
            : `<p class="empty mb-0">No multi-watcher clusters yet.</p>`
        }
      </div>
    </section>
  `;
}

async function renderPrayer() {
  const { items } = await api("/prayer");
  el.main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Prayer focuses</h2>
      <p class="panel-lead">Create focuses from reviewed themes, assign timeframe, document updates.</p>
      <form id="prayerForm" class="mb-4">
        <div class="mb-3">
          <label class="form-label" for="prayerTitle">New focus title</label>
          <input class="form-control" id="prayerTitle" name="title" required placeholder="Youth & Belonging" />
        </div>
        <div class="row g-2 mb-3">
          <div class="col-sm-6">
            <label class="form-label" for="weeks">Weeks</label>
            <input class="form-control" id="weeks" name="weeks" type="number" min="1" value="4" />
          </div>
          <div class="col-sm-6">
            <label class="form-label" for="sharedWith">Shared with</label>
            <input class="form-control" id="sharedWith" name="sharedWith" placeholder="Youth Leadership" />
          </div>
        </div>
        <button class="btn btn-watch" type="submit">Create</button>
      </form>
      <div class="d-grid gap-2">
        ${
          items.length
            ? items
                .map(
                  (f) => `
            <div class="item" style="cursor:default" data-prayer="${f.id}">
              <div class="item-title">
                <span>#${f.id} ${escapeHtml(f.title)}</span>
                <span class="tag">${escapeHtml(f.status)}</span>
              </div>
              <div class="item-meta">${f.duration_weeks} weeks · Leader ${escapeHtml(
                    f.leader_name || "—",
                  )} · Linked ${f.linkedWatchmen}</div>
              <div class="item-body">${escapeHtml(f.origin_note || "")}</div>
              ${
                f.updates
                  ? `<div class="ai-box">${escapeHtml(f.updates)}</div>`
                  : ""
              }
              <div class="d-flex flex-wrap gap-2 mt-2">
                <button type="button" class="btn btn-sm btn-watch-ghost" data-act="update">Add update</button>
                <button type="button" class="btn btn-sm btn-watch-outline" data-act="paused">Pause</button>
                <button type="button" class="btn btn-sm btn-watch-outline" data-act="completed">Complete</button>
              </div>
            </div>`,
                )
                .join("")
            : `<p class="empty mb-0">No prayer focuses yet.</p>`
        }
      </div>
    </section>
  `;

  document.getElementById("prayerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api("/prayer", {
        method: "POST",
        body: JSON.stringify({
          title: fd.get("title"),
          durationWeeks: Number(fd.get("weeks") || 4),
          sharedWith: fd.get("sharedWith") || undefined,
        }),
      });
      toast("Prayer focus created");
      render();
    } catch (err) {
      toast(err.message);
    }
  });

  el.main.querySelectorAll("[data-prayer]").forEach((card) => {
    const id = Number(card.dataset.prayer);
    card.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        try {
          if (act === "update") {
            const text = prompt("Update text");
            if (!text) return;
            await api(`/prayer/${id}/update`, {
              method: "POST",
              body: JSON.stringify({ text }),
            });
          } else {
            await api(`/prayer/${id}/status`, {
              method: "PATCH",
              body: JSON.stringify({ status: act }),
            });
          }
          render();
        } catch (err) {
          toast(err.message);
        }
      });
    });
  });
}

async function renderLearning() {
  const data = await api("/learning");
  el.main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">History & learning</h2>
      <p class="panel-lead">Not hit-rates for watchers — spiritual and practical learning.</p>
      <div class="row g-2 stats mb-3">
        <div class="col-4"><div class="stat"><strong>${data.total}</strong><span class="muted">Total</span></div></div>
        <div class="col-4"><div class="stat"><strong>${data.completed}</strong><span class="muted">Completed</span></div></div>
        <div class="col-4"><div class="stat"><strong>${data.noAction}</strong><span class="muted">No action</span></div></div>
      </div>
      <h3>Repeated topics</h3>
      <div class="d-grid gap-2">
        ${
          data.repeatedTopics.length
            ? data.repeatedTopics
                .map(
                  (t) => `
              <div class="item" style="cursor:default">
                <div class="item-title"><span>${escapeHtml(t.topic)}</span><span class="tag">${
                  t.c
                }</span></div>
              </div>`,
                )
                .join("")
            : `<p class="empty mb-0">No repeated topics yet.</p>`
        }
      </div>
    </section>
  `;
}

async function renderRoles() {
  const { items } = await api("/users");
  el.main.innerHTML = `
    <section class="panel">
      <h2 class="panel-title">Roles</h2>
      <p class="panel-lead">Sensitive items stay restricted; assign access carefully.</p>
      <div class="d-grid gap-2">
        ${items
          .map(
            (u) => `
          <div class="item" style="cursor:default">
            <div class="item-title"><span>${escapeHtml(u.display_name)}</span><span class="tag">${escapeHtml(
              u.role,
            )}</span></div>
            <div class="item-meta">id ${u.telegram_id}</div>
            <div class="d-flex flex-wrap gap-2 mt-2">
              <button type="button" class="btn btn-sm btn-watch-ghost" data-role="watcher" data-user="${
                u.telegram_id
              }">Watcher</button>
              <button type="button" class="btn btn-sm btn-watch-ghost" data-role="leader" data-user="${
                u.telegram_id
              }">Leader</button>
              <button type="button" class="btn btn-sm btn-watch-ghost" data-role="admin" data-user="${
                u.telegram_id
              }">Admin</button>
            </div>
          </div>`,
          )
          .join("")}
      </div>
    </section>
  `;
  el.main.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/users/${btn.dataset.user}/role`, {
          method: "PATCH",
          body: JSON.stringify({ role: btn.dataset.role }),
        });
        toast("Role updated");
        await bootMe();
        render();
      } catch (err) {
        toast(err.message);
      }
    });
  });
}

async function bootMe() {
  state.me = await api("/me");
  el.userLine.textContent = state.me.displayName;
  el.roleBadge.textContent = state.me.role;
}

async function boot() {
  if (tg) {
    tg.ready();
    tg.expand();
    // Keep Mini App on our light palette; ignore Telegram dark text/bg theme.
    try {
      tg.setHeaderColor("#000000");
      tg.setBackgroundColor("#ffffff");
    } catch {
      // Older clients may not support these APIs
    }
  }

  state.meta = await fetch("/api/meta").then((r) => r.json());
  await bootMe();
  await render();
}

boot().catch((err) => {
  el.userLine.textContent = "Auth failed";
  el.main.innerHTML = `<div class="panel"><p class="panel-lead mb-0">${escapeHtml(
    err.message,
  )}. For browser preview set DEV_PREVIEW=1 in .env</p></div>`;
});
