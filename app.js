(() => {
  "use strict";

  const STORAGE_KEY = "shirafu-biyori-v1";
  const SOBER_MESSAGES = ["今日は、しらふ日和。", "炭酸水も、案外悪くない。", "一日分、そっと積み上がりました。", "まあ、こんな日もいい。", "明日のことは、明日考えよう。"];
  const DRINK_MESSAGES = ["今日は飲む日。", "そんな日もあります。", "記録だけして、おしまい。", "また明日。", "おいしかったなら、それもよし。"];

  let records = loadRecords();
  const now = new Date();
  const todayKey = toDateKey(now);
  let calendarDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let dialogDateKey = null;
  let dialogStatus = null;
  let toastTimer = null;
  const el = (id) => document.getElementById(id);

  function loadRecords() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch (error) {
      console.warn("保存データを読み込めませんでした", error);
      return {};
    }
  }

  function saveRecords() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }
  function pad(value) { return String(value).padStart(2, "0"); }
  function toDateKey(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function fromDateKey(key) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
  function dateLabel(date, includeYear = false) {
    const weekday = new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(date);
    return `${includeYear ? `${date.getFullYear()}年` : ""}${date.getMonth() + 1}月${date.getDate()}日（${weekday}）`;
  }
  function monthLabel(date) { return `${date.getFullYear()}年 ${date.getMonth() + 1}月`; }
  function randomMessage(status) { const options = status === "sober" ? SOBER_MESSAGES : DRINK_MESSAGES; return options[Math.floor(Math.random() * options.length)]; }

  function upsertRecord(dateKey, values) {
    const existing = records[dateKey];
    const stamp = new Date().toISOString();
    records[dateKey] = {
      date: dateKey,
      status: values.status,
      drinkType: values.status === "drink" ? values.drinkType || "" : "",
      drinkAmount: values.status === "drink" ? values.drinkAmount || "" : "",
      memo: values.memo || "",
      createdAt: existing?.createdAt || stamp,
      updatedAt: stamp,
    };
    saveRecords();
  }

  function render() { renderToday(); renderSummary(); renderCalendar(); renderHistory(); }

  function renderToday() {
    const record = records[todayKey];
    el("today-date").textContent = `今日・${dateLabel(now)}`;
    document.querySelectorAll(".day-choice").forEach((button) => {
      const selected = record?.status === button.dataset.status;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    el("recorded-note").hidden = !record;
    if (!record) { el("today-details").hidden = true; return; }
    el("recorded-message").textContent = record.status === "sober" ? "今日のしらふを、記録しました。" : "今日のことを、記録しました。";
    el("toggle-details").textContent = record.memo || record.drinkType || record.drinkAmount ? "内容をみる" : "メモをのこす";
    el("drink-fields").hidden = record.status !== "drink";
    el("drink-type").value = record.drinkType || "";
    el("drink-amount").value = record.drinkAmount || "";
    el("today-memo").value = record.memo || "";
  }

  function setTodayStatus(status) {
    const existing = records[todayKey] || {};
    upsertRecord(todayKey, { status, drinkType: status === "drink" ? existing.drinkType : "", drinkAmount: status === "drink" ? existing.drinkAmount : "", memo: existing.memo });
    el("today-details").hidden = status !== "drink";
    render();
    el("today-details").hidden = status !== "drink";
    showToast(randomMessage(status));
    if (status === "drink") el("drink-type").focus({ preventScroll: true });
  }

  function saveTodayDetails(event) {
    event.preventDefault();
    const current = records[todayKey];
    if (!current) return;
    upsertRecord(todayKey, { status: current.status, drinkType: el("drink-type").value, drinkAmount: el("drink-amount").value, memo: el("today-memo").value.trim() });
    render();
    el("today-details").hidden = true;
    showToast("今日のひとことも、そっと保存しました。");
  }

  function getMonthStats(year, month) {
    const first = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0).getDate();
    const isCurrent = year === now.getFullYear() && month === now.getMonth();
    const isFuture = first > new Date(now.getFullYear(), now.getMonth(), 1);
    const elapsedDays = isFuture ? 0 : isCurrent ? now.getDate() : lastDay;
    let sober = 0; let drink = 0;
    for (let day = 1; day <= lastDay; day += 1) {
      const record = records[toDateKey(new Date(year, month, day))];
      if (record?.status === "sober") sober += 1;
      if (record?.status === "drink") drink += 1;
    }
    const logged = sober + drink;
    return { sober, drink, none: Math.max(elapsedDays - logged, 0), logged, rate: logged ? Math.round((sober / logged) * 100) : null, elapsedDays };
  }

  function renderSummary() {
    const stats = getMonthStats(now.getFullYear(), now.getMonth());
    const total = Object.values(records).filter((record) => record?.status === "sober").length;
    el("month-sober-count").textContent = stats.sober;
    el("total-sober-count").textContent = `${total}日`;
    el("month-rate").textContent = stats.rate === null ? "—" : `${stats.rate}%`;
    el("rate-ring").style.setProperty("--rate", stats.rate || 0);
    el("month-sentence").textContent = stats.sober ? `今月は${stats.sober}日、しらふで過ごしました。` : "今月はまだ、のんびりこれから。";
  }

  function renderCalendar() {
    const year = calendarDate.getFullYear(); const month = calendarDate.getMonth(); const grid = el("calendar-grid");
    grid.innerHTML = ""; el("calendar-month").textContent = monthLabel(calendarDate);
    const firstWeekdayMondayFirst = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < firstWeekdayMondayFirst; i += 1) { const placeholder = document.createElement("span"); placeholder.className = "calendar-day is-placeholder"; grid.appendChild(placeholder); }
    for (let day = 1; day <= days; day += 1) {
      const date = new Date(year, month, day); const key = toDateKey(date); const record = records[key]; const isFuture = key > todayKey;
      const button = document.createElement("button"); button.type = "button";
      button.className = `calendar-day${record ? ` ${record.status}` : ""}${key === todayKey ? " is-today" : ""}${isFuture ? " is-future" : ""}${record?.memo ? " has-memo" : ""}`;
      button.disabled = isFuture;
      button.setAttribute("aria-label", `${dateLabel(date, true)}${record ? `、${record.status === "sober" ? "しらふ" : "飲んだ"}` : "、記録なし"}`);
      button.innerHTML = `<span class="day-number">${day}</span>${record ? '<span class="day-state" aria-hidden="true"></span>' : ""}`;
      if (!isFuture) button.addEventListener("click", () => openDayDialog(key));
      grid.appendChild(button);
    }
  }

  function renderHistory() {
    const list = el("history-list"); list.innerHTML = "";
    for (let offset = 0; offset < 6; offset += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1); const stats = getMonthStats(date.getFullYear(), date.getMonth());
      const soberWidth = stats.elapsedDays ? (stats.sober / stats.elapsedDays) * 100 : 0; const drinkWidth = stats.elapsedDays ? (stats.drink / stats.elapsedDays) * 100 : 0;
      const row = document.createElement("article"); row.className = "history-row";
      row.innerHTML = `<div class="history-month"><strong>${date.getMonth() + 1}月</strong><small>${date.getFullYear()}年</small></div><div class="history-bar" aria-hidden="true"><i class="sober-part" style="width:${soberWidth}%"></i><i class="drink-part" style="width:${drinkWidth}%"></i></div><div class="history-stats"><span>しらふ <b>${stats.sober}日</b></span><span>飲んだ <b>${stats.drink}日</b></span><span>記録なし <b>${stats.none}日</b></span><span>しらふ率 <b>${stats.rate === null ? "—" : `${stats.rate}%`}</b></span></div>`;
      list.appendChild(row);
    }
  }

  function openDayDialog(key) {
    dialogDateKey = key; const date = fromDateKey(key); const record = records[key]; dialogStatus = record?.status || null;
    el("dialog-year").textContent = `${date.getFullYear()}年`; el("dialog-date").textContent = dateLabel(date);
    el("dialog-drink-type").value = record?.drinkType || ""; el("dialog-drink-amount").value = record?.drinkAmount || ""; el("dialog-memo").value = record?.memo || "";
    el("delete-record").disabled = !record; updateDialogStatus(); el("day-dialog").showModal();
  }

  function updateDialogStatus() {
    document.querySelectorAll("[data-dialog-status]").forEach((button) => { const selected = button.dataset.dialogStatus === dialogStatus; button.classList.toggle("is-selected", selected); button.setAttribute("aria-pressed", String(selected)); });
    el("dialog-drink-fields").hidden = dialogStatus !== "drink";
  }

  function saveDialogRecord(event) {
    event.preventDefault();
    if (!dialogStatus || !dialogDateKey) { showToast("しらふか、飲んだかを選んでください。"); return; }
    upsertRecord(dialogDateKey, { status: dialogStatus, drinkType: el("dialog-drink-type").value, drinkAmount: el("dialog-drink-amount").value, memo: el("dialog-memo").value.trim() });
    el("day-dialog").close(); render(); showToast("その日の記録を保存しました。");
  }

  function deleteDialogRecord() {
    if (!dialogDateKey || !records[dialogDateKey]) return;
    delete records[dialogDateKey]; saveRecords(); el("day-dialog").close(); render(); showToast("記録を空欄に戻しました。");
  }

  function showToast(message) {
    const toast = el("toast"); clearTimeout(toastTimer); toast.textContent = message; toast.classList.add("is-visible");
    toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function registerWebMcpTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const statuses = ["sober", "drink"];
    Promise.resolve(context.registerTool({
      name: "record_day", title: "一日の記録をつける", description: "指定した日を「しらふ」または「飲んだ」として記録し、任意のメモや飲酒内容も保存します。",
      inputSchema: { type: "object", properties: { date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "YYYY-MM-DD形式の日付" }, status: { type: "string", enum: statuses }, drinkType: { type: "string" }, drinkAmount: { type: ["string", "number"] }, memo: { type: "string", maxLength: 120 } }, required: ["date", "status"], additionalProperties: false },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || !statuses.includes(input.status) || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > todayKey) throw new Error("日付または状態が正しくありません");
        upsertRecord(input.date, input); render(); return { saved: true, date: input.date, status: input.status };
      },
    })).catch(() => {});
  }

  function init() {
    document.querySelectorAll(".day-choice").forEach((button) => button.addEventListener("click", () => setTodayStatus(button.dataset.status)));
    el("toggle-details").addEventListener("click", () => { const form = el("today-details"); form.hidden = !form.hidden; if (!form.hidden) el("today-memo").focus({ preventScroll: true }); });
    el("today-details").addEventListener("submit", saveTodayDetails);
    el("prev-month").addEventListener("click", () => { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1); renderCalendar(); });
    el("next-month").addEventListener("click", () => { calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1); renderCalendar(); });
    el("calendar-month").addEventListener("click", () => { calendarDate = new Date(now.getFullYear(), now.getMonth(), 1); renderCalendar(); });
    document.querySelectorAll("[data-dialog-status]").forEach((button) => button.addEventListener("click", () => { dialogStatus = button.dataset.dialogStatus; updateDialogStatus(); }));
    el("day-form").addEventListener("submit", saveDialogRecord); el("delete-record").addEventListener("click", deleteDialogRecord); el("close-dialog").addEventListener("click", () => el("day-dialog").close());
    el("day-dialog").addEventListener("click", (event) => { if (event.target === el("day-dialog")) el("day-dialog").close(); });
    render(); registerWebMcpTools();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
