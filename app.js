/**
 * 旅行手帳 — hand-drawn travel journal SPA
 * Data persisted in localStorage under TRAVEL_JOURNAL_V2
 */
(function () {
  "use strict";

  const STORAGE_KEY = "TRAVEL_JOURNAL_V2";
  const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
  const CAT_COLORS = {
    交通: "#6b9bd1",
    住宿: "#9b7bb8",
    飲食: "#e07a5f",
    門票: "#7a9e7e",
    購物: "#e8a06a",
    其他: "#9a9a9a",
  };

  /** Demo "today" fixed to Day 1 of the trip so the prototype always looks alive */
  const DEMO_TODAY = "2026-12-15";

  function seedData() {
    return {
      trip: {
        title: "東京 · 富士山",
        start: "2026-12-15",
        end: "2026-12-21",
        budget: 0,
        companions: ["Khalil", "旅伴二", "旅伴三", "旅伴四"],
        jpyToHkd: 0.0523,
      },
      cities: {
        "2026-12-15": "東京",
        "2026-12-16": "東京",
        "2026-12-17": "東京",
        "2026-12-18": "河口湖",
        "2026-12-19": "河口湖",
        "2026-12-20": "東京",
        "2026-12-21": "東京",
      },
      dayTitles: {
        "2026-12-15": "抵達成田・入住",
        "2026-12-16": "淺草・晴空塔",
        "2026-12-17": "渋谷・原宿",
        "2026-12-18": "前往富士山山腳／河口湖",
        "2026-12-19": "富士山五合目・河口湖",
        "2026-12-20": "返東京・自由日",
        "2026-12-21": "手信・回港",
      },
      itinerary: {
        "2026-12-16": { route: "淺草 → 晴空塔", note: "雷門・仲見世通，傍晚上晴空塔睇夜景" },
        "2026-12-17": { route: "渋谷 → 原宿", note: "十字路口・竹下通・明治神宮散步" },
        "2026-12-18": { route: "東京 → 河口湖", note: "前往富士山山腳，入住河口湖" },
      },
      todos: [
        { id: "t1", date: "2026-12-15", text: "換 Suica", done: false },
        { id: "t2", date: "2026-12-15", text: "飯店 check-in", done: false },
        { id: "t3", date: "2026-12-15", text: "附近食晚飯", done: false },
      ],
      expenses: [],
      selectedDate: DEMO_TODAY,
      calMonth: "2026-12",
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.trip && Array.isArray(parsed.expenses)) return parsed;
      }
    } catch (_) {}
    return seedData();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = load();

  function uid(prefix) {
    return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function parseDate(s) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  function fmtDate(s) {
    const dt = parseDate(s);
    return `${dt.getMonth() + 1}月${dt.getDate()}日`;
  }

  function fmtDateLong(s) {
    const dt = parseDate(s);
    return `${dt.getMonth() + 1}月${dt.getDate()}日 星期${WEEKDAYS[dt.getDay()]}`;
  }

  function money(n) {
    return Math.round(n).toLocaleString("en-HK");
  }

  function hkdToJpy(hkd) {
    const rate = state.trip.jpyToHkd || 0.052;
    return Math.round(hkd / rate);
  }

  function totalSpent(expenses) {
    return (expenses || state.expenses).reduce((s, e) => s + (Number(e.hkd) || 0), 0);
  }

  function spentOn(date) {
    return state.expenses
      .filter((e) => e.date === date)
      .reduce((s, e) => s + (Number(e.hkd) || 0), 0);
  }

  function dayIndex(date) {
    const start = parseDate(state.trip.start);
    const d = parseDate(date);
    return Math.floor((d - start) / 86400000) + 1;
  }

  function tripDates() {
    const out = [];
    const a = parseDate(state.trip.start);
    const b = parseDate(state.trip.end);
    for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      out.push(`${y}-${m}-${day}`);
    }
    return out;
  }

  function isInTrip(dateStr) {
    return dateStr >= state.trip.start && dateStr <= state.trip.end;
  }

  function focusDate() {
    return state.selectedDate || DEMO_TODAY;
  }

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => { el.hidden = true; }, 250);
    }, 2600);
  }

  // ---------- Tabs ----------
  function switchTab(name) {
    document.querySelectorAll(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === name);
    });
    document.querySelectorAll(".view").forEach((v) => {
      v.classList.toggle("active", v.id === "view-" + name);
    });
    if (name === "ledger") renderLedger();
    if (name === "charts") renderCharts();
    if (name === "settings") fillSettings();
    if (name === "calendar") renderCalendar();
  }

  // ---------- Header ----------
  function renderHeader() {
    const comps = state.trip.companions || [];
    document.getElementById("topCompanions").textContent = comps.join("、") || "—";
    document.getElementById("topTripChip").textContent = state.trip.title;
  }

  // ---------- Calendar view ----------
  function renderCalendar() {
    const today = focusDate();
    const dayN = dayIndex(today);
    const start = parseDate(state.trip.start);
    const end = parseDate(state.trip.end);

    document.getElementById("calTripTitle").textContent = state.trip.title;
    document.getElementById("calTripSub").textContent =
      `${start.getMonth() + 1}月${start.getDate()}日 – ${end.getMonth() + 1}月${end.getDate()}日 · 共${tripDates().length}天 · 第${dayN}天（${fmtDateLong(today)}）`;

    const spent = totalSpent();
    const budget = Number(state.trip.budget) || 0;
    const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
    document.getElementById("calSpentHkd").textContent = `HKD $${money(spent)}`;
    document.getElementById("calSpentJpy").textContent = `約 ¥${money(hkdToJpy(spent))}`;
    document.getElementById("calProgressBar").style.width = pct + "%";
    document.getElementById("calBudgetPct").textContent = budget > 0 ? pct + "%" : "未設定";
    document.getElementById("calBudget").textContent = budget > 0 ? `HKD $${money(budget)}` : "未設定";
    document.getElementById("calTodaySpend").textContent = `HKD $${money(spentOn(today))}`;

    const city = state.cities[today] || "";
    document.getElementById("calTodoSub").textContent = `Day ${dayN} · ${city}`;
    document.getElementById("pageNum").textContent = String(dayN);

    // Todos
    const todos = state.todos.filter((t) => t.date === today);
    const list = document.getElementById("calTodoList");
    if (!todos.length) {
      list.innerHTML = `<li class="todo-item" style="cursor:default;opacity:.7"><span class="todo-text">今日暫無待辦 — 去設定或者帳本加啲計劃啦</span></li>`;
    } else {
      list.innerHTML = todos
        .map(
          (t) => `
        <li class="todo-item ${t.done ? "done" : ""}" data-todo="${t.id}">
          <input type="checkbox" ${t.done ? "checked" : ""} />
          <span class="check" aria-hidden="true"></span>
          <span class="todo-text">${escapeHtml(t.text)}</span>
          <span class="todo-meta ${t.linkedSpend ? "recorded" : ""}">${
            t.linkedSpend
              ? "已記帳 HKD $" + money(t.linkedSpend)
              : t.note
              ? escapeHtml(t.note)
              : ""
          }</span>
        </li>`
        )
        .join("");
    }

    // Month grid
    renderMonthGrid();

    // Journal
    const dayExps = state.expenses.filter((e) => e.date === today);
    const dayTitle = state.dayTitles[today] || city || "今日";
    document.getElementById("calJournalSummary").innerHTML = `
      <span class="j-title">Day ${dayN} · ${escapeHtml(dayTitle)}</span>
      <span class="j-meta">${dayExps.length} 筆記錄 · HKD $${money(spentOn(today))}</span>`;
    const jl = document.getElementById("calJournalList");
    if (!dayExps.length) {
      jl.innerHTML = `<li><span class="muted">尚未記帳</span></li>`;
    } else {
      jl.innerHTML = dayExps
        .map(
          (e) => `
        <li>
          <span><span class="j-cat cat-${e.cat}">${e.cat}</span>${escapeHtml(e.title)}</span>
          <span class="j-amt">$${money(e.hkd)}</span>
        </li>`
        )
        .join("");
    }

    // Next 3 days
    const dates = tripDates();
    const idx = dates.indexOf(today);
    const next = dates.slice(idx + 1, idx + 4);
    const nextEl = document.getElementById("calNextDays");
    if (!next.length) {
      nextEl.innerHTML = `<div class="muted">行程尾聲啦 🍂</div>`;
    } else {
      nextEl.innerHTML = next
        .map((d) => {
          const dt = parseDate(d);
          const it = state.itinerary[d] || {};
          const route = it.route || state.cities[d] || "";
          const note = it.note || state.dayTitles[d] || "";
          return `
          <div class="next-day">
            <div class="next-date">${dt.getMonth() + 1}/${dt.getDate()}<small>星期${WEEKDAYS[dt.getDay()]}</small></div>
            <div class="next-info">${escapeHtml(route)}<div class="hint-line">${escapeHtml(note)}</div></div>
          </div>`;
        })
        .join("");
    }
  }

  function renderMonthGrid() {
    const [yy, mm] = (state.calMonth || "2026-12").split("-").map(Number);
    document.getElementById("calMonthLabel").textContent = `${yy}年${mm}月`;

    const first = new Date(yy, mm - 1, 1);
    const startPad = first.getDay();
    const daysInMonth = new Date(yy, mm, 0).getDate();
    const today = focusDate();
    const grid = document.getElementById("calGrid");
    const cells = [];

    for (let i = 0; i < startPad; i++) {
      cells.push(`<div class="cal-cell empty"></div>`);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const ds = `${yy}-${String(mm).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const inTrip = isInTrip(ds);
      const isToday = ds === today;
      const isSel = ds === state.selectedDate;
      const city = state.cities[ds] || "";
      const spend = inTrip ? spentOn(ds) : 0;
      const shortCity = city.replace(/→.*$/, "").slice(0, 4);
      cells.push(`
        <div class="cal-cell ${inTrip ? "in-trip" : ""} ${isToday ? "today" : ""} ${isSel && !isToday ? "selected" : ""}"
             data-date="${ds}" role="button" tabindex="0">
          <span class="d">${d}</span>
          ${inTrip && shortCity ? `<span class="city">${escapeHtml(shortCity)}</span>` : ""}
          ${spend > 0 ? `<span class="spend">$${money(spend)}</span>` : ""}
        </div>`);
    }
    grid.innerHTML = cells.join("");
  }

  // ---------- Ledger ----------
  function renderLedger() {
    const daySel = document.getElementById("filterDay");
    const catSel = document.getElementById("filterCat");
    const dates = tripDates();
    const prevDay = daySel.value;
    daySel.innerHTML =
      `<option value="all">全部日子</option>` +
      dates
        .map((d) => {
          const n = dayIndex(d);
          return `<option value="${d}">Day ${n} · ${fmtDate(d)} ${state.cities[d] || ""}</option>`;
        })
        .join("");
    if ([...daySel.options].some((o) => o.value === prevDay)) daySel.value = prevDay;

    const dayF = daySel.value;
    const catF = catSel.value;
    let list = [...state.expenses].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    if (dayF !== "all") list = list.filter((e) => e.date === dayF);
    if (catF !== "all") list = list.filter((e) => e.cat === catF);

    const sum = totalSpent(list);
    document.getElementById("ledgerSummary").innerHTML = `
      <span>顯示 <strong>${list.length}</strong> 筆</span>
      <span>小計 <strong>HKD $${money(sum)}</strong></span>
      <span>約 <strong>¥${money(hkdToJpy(sum))}</strong></span>`;

    const el = document.getElementById("ledgerList");
    if (!list.length) {
      el.innerHTML = `<div class="empty-state">呢個篩選暫時冇記錄 ✍️</div>`;
      return;
    }
    el.innerHTML = list
      .map(
        (e) => `
      <div class="ledger-item" data-id="${e.id}">
        <div>
          <div class="li-title"><span class="cat-pill cat-${e.cat}">${e.cat}</span>${escapeHtml(e.title)}</div>
          <div class="li-meta">${fmtDate(e.date)} · Day ${dayIndex(e.date)} · ${escapeHtml(e.payer || "—")}${
          e.note ? " · " + escapeHtml(e.note) : ""
        }</div>
        </div>
        <div>
          <div class="li-amt">HKD $${money(e.hkd)}
            ${e.jpy ? `<div class="li-jpy">¥${money(e.jpy)}</div>` : ""}
          </div>
          <div class="li-actions">
            <button type="button" class="btn btn-ghost sm" data-edit="${e.id}">編輯</button>
            <button type="button" class="btn btn-danger" data-del="${e.id}">刪除</button>
          </div>
        </div>
      </div>`
      )
      .join("");
  }

  // ---------- Charts ----------
  function renderCharts() {
    const byCat = {};
    state.expenses.forEach((e) => {
      byCat[e.cat] = (byCat[e.cat] || 0) + Number(e.hkd);
    });
    drawPie(byCat);

    const dates = tripDates();
    const max = Math.max(1, ...dates.map((d) => spentOn(d)));
    const today = focusDate();
    document.getElementById("dailyBars").innerHTML = dates
      .map((d) => {
        const v = spentOn(d);
        const h = Math.round((v / max) * 130);
        const dt = parseDate(d);
        return `
        <div class="bar-col ${d === today ? "today-bar" : ""}" title="${fmtDate(d)}: $${money(v)}">
          <div class="bar" style="height:${Math.max(v ? 4 : 0, h)}px"></div>
          <div class="bar-label">${dt.getDate()}<br>${(state.cities[d] || "").slice(0, 2)}</div>
        </div>`;
      })
      .join("");

    const spent = totalSpent();
    const budget = Number(state.trip.budget) || 0;
    if (budget <= 0) {
      document.getElementById("budgetStats").innerHTML = `
      <div><div class="stat-val">$${money(spent)}</div><div class="stat-label">已用（HKD）</div></div>
      <div><div class="stat-val">—</div><div class="stat-label">剩餘</div></div>
      <div><div class="stat-val">未設定</div><div class="stat-label">預算用量</div></div>
      <div class="stat-bar-big"><div class="stat-bar-fill" style="width:0%"></div></div>
      <p class="hint" style="margin-top:.75rem">先去設定填預算</p>`;
    } else {
      const left = Math.max(0, budget - spent);
      const pct = Math.min(100, Math.round((spent / budget) * 100));
      document.getElementById("budgetStats").innerHTML = `
      <div><div class="stat-val">$${money(spent)}</div><div class="stat-label">已用（HKD）</div></div>
      <div><div class="stat-val">$${money(left)}</div><div class="stat-label">剩餘</div></div>
      <div><div class="stat-val">${pct}%</div><div class="stat-label">預算用量</div></div>
      <div class="stat-bar-big"><div class="stat-bar-fill" style="width:${pct}%"></div></div>`;
    }
  }

  function drawPie(byCat) {
    const canvas = document.getElementById("pieChart");
    const ctx = canvas.getContext("2d");
    const entries = Object.entries(byCat).filter(([, v]) => v > 0);
    const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
    const cx = 110, cy = 110, r = 90;

    ctx.clearRect(0, 0, 220, 220);
    if (!entries.length) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = "#e0d4bc";
      ctx.fill();
      document.getElementById("pieLegend").innerHTML = `<li>暫無資料</li>`;
      return;
    }

    let angle = -Math.PI / 2;
    entries.forEach(([cat, val]) => {
      const slice = (val / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = CAT_COLORS[cat] || "#aaa";
      ctx.fill();
      ctx.strokeStyle = "#faf6eb";
      ctx.lineWidth = 3;
      ctx.stroke();
      angle += slice;
    });

    // inner hole for donut feel
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.fillStyle = "#faf6eb";
    ctx.fill();
    ctx.fillStyle = "#3d3429";
    ctx.font = "700 14px 'Noto Sans TC', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("$" + money(total), cx, cy);

    document.getElementById("pieLegend").innerHTML = entries
      .map(
        ([cat, val]) =>
          `<li><span class="swatch" style="background:${CAT_COLORS[cat]}"></span>${cat} · $${money(val)}（${Math.round(
            (val / total) * 100
          )}%）</li>`
      )
      .join("");
  }

  // ---------- Settings ----------
  function fillSettings() {
    document.getElementById("setTitle").value = state.trip.title;
    document.getElementById("setStart").value = state.trip.start;
    document.getElementById("setEnd").value = state.trip.end;
    document.getElementById("setBudget").value = state.trip.budget;
    document.getElementById("setCompanions").value = (state.trip.companions || []).join("、");
    document.getElementById("setRate").value = state.trip.jpyToHkd;
  }

  // ---------- Modal ----------
  function openExpenseModal(expense) {
    const modal = document.getElementById("modal");
    const payerSel = document.getElementById("expPayer");
    payerSel.innerHTML = state.trip.companions
      .map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)
      .join("");

    document.getElementById("modalTitle").textContent = expense ? "編輯開支" : "記一筆";
    document.getElementById("expId").value = expense ? expense.id : "";
    document.getElementById("expDate").value = expense ? expense.date : focusDate();
    document.getElementById("expTitle").value = expense ? expense.title : "";
    document.getElementById("expHkd").value = expense ? expense.hkd : "";
    document.getElementById("expJpy").value = expense && expense.jpy ? expense.jpy : "";
    document.getElementById("expCat").value = expense ? expense.cat : "飲食";
    document.getElementById("expPayer").value = expense ? expense.payer : state.trip.companions[0];
    document.getElementById("expNote").value = expense ? expense.note || "" : "";

    modal.hidden = false;
    document.getElementById("expTitle").focus();
  }

  function closeModal() {
    document.getElementById("modal").hidden = true;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------- Events ----------
  function bind() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });

    document.getElementById("btnScan").addEventListener("click", () => {
      toast("📷 OCR 掃描收據稍後加入 — 而家請用「記一筆」啦");
    });

    document.getElementById("btnAddExpense").addEventListener("click", () => openExpenseModal(null));
    document.getElementById("btnAddExpense2").addEventListener("click", () => openExpenseModal(null));

    document.getElementById("modal").addEventListener("click", (e) => {
      if (e.target.matches("[data-close]") || e.target.classList.contains("modal-backdrop")) closeModal();
    });

    document.getElementById("expenseForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = document.getElementById("expId").value;
      const entry = {
        id: id || uid("e"),
        date: document.getElementById("expDate").value,
        title: document.getElementById("expTitle").value.trim(),
        hkd: Number(document.getElementById("expHkd").value) || 0,
        jpy: document.getElementById("expJpy").value
          ? Number(document.getElementById("expJpy").value)
          : null,
        cat: document.getElementById("expCat").value,
        payer: document.getElementById("expPayer").value,
        note: document.getElementById("expNote").value.trim(),
      };
      if (!entry.jpy && entry.hkd) entry.jpy = hkdToJpy(entry.hkd);

      if (id) {
        const i = state.expenses.findIndex((x) => x.id === id);
        if (i >= 0) state.expenses[i] = entry;
      } else {
        state.expenses.push(entry);
      }
      save();
      closeModal();
      toast(id ? "已更新開支 ✓" : "已記一筆 ✓");
      renderAll();
    });

    // Auto-fill JPY when HKD changes
    document.getElementById("expHkd").addEventListener("change", () => {
      const h = Number(document.getElementById("expHkd").value);
      if (h && !document.getElementById("expJpy").value) {
        document.getElementById("expJpy").value = hkdToJpy(h);
      }
    });

    document.getElementById("calTodoList").addEventListener("click", (e) => {
      const item = e.target.closest("[data-todo]");
      if (!item) return;
      const t = state.todos.find((x) => x.id === item.dataset.todo);
      if (!t) return;
      t.done = !t.done;
      save();
      renderCalendar();
    });

    document.getElementById("calGrid").addEventListener("click", (e) => {
      const cell = e.target.closest("[data-date]");
      if (!cell) return;
      const d = cell.dataset.date;
      if (!isInTrip(d)) return;
      state.selectedDate = d;
      save();
      renderCalendar();
    });

    document.getElementById("calPrev").addEventListener("click", () => {
      const [y, m] = state.calMonth.split("-").map(Number);
      const d = new Date(y, m - 2, 1);
      state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      save();
      renderMonthGrid();
    });
    document.getElementById("calNext").addEventListener("click", () => {
      const [y, m] = state.calMonth.split("-").map(Number);
      const d = new Date(y, m, 1);
      state.calMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      save();
      renderMonthGrid();
    });

    document.getElementById("filterDay").addEventListener("change", renderLedger);
    document.getElementById("filterCat").addEventListener("change", renderLedger);

    document.getElementById("ledgerList").addEventListener("click", (e) => {
      const edit = e.target.closest("[data-edit]");
      const del = e.target.closest("[data-del]");
      if (edit) {
        const exp = state.expenses.find((x) => x.id === edit.dataset.edit);
        if (exp) openExpenseModal(exp);
      }
      if (del) {
        if (confirm("確定刪呢筆記錄？")) {
          state.expenses = state.expenses.filter((x) => x.id !== del.dataset.del);
          save();
          toast("已刪除");
          renderLedger();
          renderHeader();
        }
      }
    });

    document.getElementById("settingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      state.trip.title = document.getElementById("setTitle").value.trim();
      state.trip.start = document.getElementById("setStart").value;
      state.trip.end = document.getElementById("setEnd").value;
      state.trip.budget = Number(document.getElementById("setBudget").value) || 0;
      state.trip.jpyToHkd = Number(document.getElementById("setRate").value) || 0.052;
      const comps = document
        .getElementById("setCompanions")
        .value.split(/[,、，]/)
        .map((s) => s.trim())
        .filter(Boolean);
      state.trip.companions = comps.filter((v, i, a) => a.indexOf(v) === i);
      if (state.selectedDate < state.trip.start || state.selectedDate > state.trip.end) {
        state.selectedDate = state.trip.start;
      }
      save();
      toast("設定已儲存 ✓");
      renderAll();
    });

    document.getElementById("btnResetDemo").addEventListener("click", () => {
      if (!confirm("重設示範資料？你手動加嘅記錄會冇晒。")) return;
      localStorage.removeItem(STORAGE_KEY);
      state = seedData();
      save();
      toast("已重設行程 🎒");
      switchTab("calendar");
      renderAll();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
    });
  }

  function renderAll() {
    renderHeader();
    renderCalendar();
    // keep ledger/charts fresh if visible
    if (document.getElementById("view-ledger").classList.contains("active")) renderLedger();
    if (document.getElementById("view-charts").classList.contains("active")) renderCharts();
  }

  // boot
  bind();
  save(); // persist seed on first visit
  renderAll();
})();
