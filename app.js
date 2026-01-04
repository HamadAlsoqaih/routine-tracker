// Routine Tracker v5 (FIXED weeks + multi-day add)
// Key fixes:
// 1) Timezone-safe local dates (NO toISOString) => week navigation works reliably.
// 2) Add task defaults to selected day only.
//    Multi-day only applies if you open "Add more days" and press "Confirm days".
//    If you open picker and forget confirm, Add will block and tell you.

const STORAGE_KEY = "routine_tracker_v5";
const DOW = ["Sat","Sun","Mon","Tue","Wed","Thu","Fri"];
const CATEGORIES = ["Health", "Study", "Work"];

const els = {
  daysRow: document.getElementById("daysRow"),
  weekLabel: document.getElementById("weekLabel"),
  selectedDayLabel: document.getElementById("selectedDayLabel"),
  progressText: document.getElementById("progressText"),

  routineList: document.getElementById("routineList"),

  addForm: document.getElementById("addForm"),
  newItemInput: document.getElementById("newItemInput"),
  newItemCategory: document.getElementById("newItemCategory"),
  newItemDesc: document.getElementById("newItemDesc"),

  // days picker
  daysChipsWrap: document.getElementById("daysChipsWrap"),
  toggleDays: document.getElementById("toggleDays"),
  confirmDays: document.getElementById("confirmDays"),
  daysChips: document.getElementById("daysChips"),
  daysAll: document.getElementById("daysAll"),
  daysNone: document.getElementById("daysNone"),
  daysWeekdays: document.getElementById("daysWeekdays"),
  daysWeekend: document.getElementById("daysWeekend"),

  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  resetWeek: document.getElementById("resetWeek"),
  toggleTheme: document.getElementById("toggleTheme"),

  exportJson: document.getElementById("exportJson"),
  importFile: document.getElementById("importFile"),
};

let activeFilter = "All";

// Add-form day selection state
let newTaskDays = [false,false,false,false,false,false,false];
let daysPickerOpen = false;
let daysSelectionConfirmed = false;

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{
    return null;
  }
}

function saveState(s){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

/* -------------------- Local date utilities (timezone-safe) -------------------- */
// Return YYYY-MM-DD using *local* calendar (no UTC conversion)
function toLocalISO(date){
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Parse YYYY-MM-DD into local Date safely
function fromLocalISO(iso){
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function startOfWeekSaturday(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const jsDow = d.getDay(); // Sun=0 ... Sat=6
  const offset = (jsDow + 1) % 7; // Sat->0, Sun->1, Mon->2...
  d.setDate(d.getDate() - offset);
  return d;
}

function dayIndexFromISO(dayISO){
  const d = fromLocalISO(dayISO);
  const js = d.getDay(); // Sun=0 ... Sat=6
  return (js + 1) % 7;   // Sat=0, Sun=1, Mon=2, ... Fri=6
}

function formatRange(weekStartDate){
  const end = addDays(weekStartDate, 6);
  const opts = { year: "numeric", month: "short", day: "numeric" };
  return `${weekStartDate.toLocaleDateString(undefined, opts)} → ${end.toLocaleDateString(undefined, opts)}`;
}

function selectedDayOnlyMask(){
  const idx = dayIndexFromISO(state.selectedISO);
  const arr = [false,false,false,false,false,false,false];
  arr[idx] = true;
  return arr;
}

/* -------------------- State -------------------- */
function defaultState(){
  const today = new Date();
  const ws = startOfWeekSaturday(today);
  return {
    theme: "dark",
    weekStartISO: toLocalISO(ws),
    selectedISO: toLocalISO(today),
    items: [],
    completion: {}, // completion[weekStartISO][dayISO][itemId] = true
    ui: { openDescByItemId: {} }
  };
}

let state = loadState() || defaultState();

/* -------------------- Theme -------------------- */
function applyTheme(){
  const root = document.documentElement;
  if(state.theme === "light"){
    root.classList.add("light");
    els.toggleTheme.textContent = "☀️ Light";
    els.toggleTheme.setAttribute("aria-pressed", "false");
  }else{
    root.classList.remove("light");
    els.toggleTheme.textContent = "🌙 Dark";
    els.toggleTheme.setAttribute("aria-pressed", "true");
  }
}

/* -------------------- Completion + streak -------------------- */
function ensureWeekBucket(wsISO){
  if(!state.completion[wsISO]) state.completion[wsISO] = {};
}

function getCompletionMapForCurrentWeekDay(dayISO){
  ensureWeekBucket(state.weekStartISO);
  const week = state.completion[state.weekStartISO];
  if(!week[dayISO]) week[dayISO] = {};
  return week[dayISO];
}

function setItemDone(dayISO, itemId, done){
  const map = getCompletionMapForCurrentWeekDay(dayISO);
  if(done) map[itemId] = true;
  else delete map[itemId];
  saveState(state);
  renderProgressOnly();
  renderListOnly();
}

function isDoneOnDay(itemId, dayISO){
  const d = fromLocalISO(dayISO);
  const wsISO = toLocalISO(startOfWeekSaturday(d));
  const week = state.completion[wsISO];
  if(!week) return false;
  const dayMap = week[dayISO];
  if(!dayMap) return false;
  return !!dayMap[itemId];
}

function streakForItem(itemId, upToDayISO){
  let streak = 0;
  let cursor = fromLocalISO(upToDayISO);
  while(true){
    const iso = toLocalISO(cursor);
    if(isDoneOnDay(itemId, iso)){
      streak += 1;
      cursor = addDays(cursor, -1);
    }else break;
  }
  return streak;
}

/* -------------------- Week controls -------------------- */
function getWeekStartDate(){
  return fromLocalISO(state.weekStartISO);
}

function resetAddDaysToSelectedOnly(){
  newTaskDays = selectedDayOnlyMask();
  daysPickerOpen = false;
  daysSelectionConfirmed = false;

  // collapse picker UI
  if(els.daysChipsWrap) els.daysChipsWrap.classList.add("collapsed");
  if(els.confirmDays) els.confirmDays.style.display = "none";
  if(els.toggleDays) els.toggleDays.style.display = "inline-block";

  renderDayChips();
}

function setWeekStart(date){
  const ws = startOfWeekSaturday(date);
  state.weekStartISO = toLocalISO(ws);

  // keep selected inside this week range
  const sel = fromLocalISO(state.selectedISO);
  const start = ws;
  const end = addDays(ws, 6);
  if(sel < start || sel > end){
    state.selectedISO = toLocalISO(ws);
  }

  saveState(state);
  resetAddDaysToSelectedOnly();
  render();
}

function setSelectedDay(iso){
  state.selectedISO = iso;
  saveState(state);
  resetAddDaysToSelectedOnly();
  render();
}

/* -------------------- UI helpers -------------------- */
function escapeHtml(str){
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/* -------------------- Filtering -------------------- */
function itemsForSelectedDay(){
  const dayIdx = dayIndexFromISO(state.selectedISO);
  let items = state.items.filter(it => it.days?.[dayIdx] === true);
  if(activeFilter !== "All") items = items.filter(it => it.category === activeFilter);
  return items;
}

function scheduledItemsForDay(dayISO){
  const dayIdx = dayIndexFromISO(dayISO);
  return state.items.filter(it => it.days?.[dayIdx] === true);
}

function dayProgress(dayISO){
  const scheduled = scheduledItemsForDay(dayISO);
  const total = scheduled.length;
  if(total === 0) return { done: 0, total: 0 };

  const map = getCompletionMapForCurrentWeekDay(dayISO);
  let done = 0;
  for(const it of scheduled){
    if(map[it.id]) done++;
  }
  return { done, total };
}

/* -------------------- Render -------------------- */
function renderDays(){
  els.daysRow.innerHTML = "";
  const start = getWeekStartDate();
  els.weekLabel.textContent = formatRange(start);

  for(let i=0;i<7;i++){
    const d = addDays(start, i);
    const iso = toLocalISO(d);

    const card = document.createElement("div");
    card.className = "day" + (iso === state.selectedISO ? " selected" : "");
    card.tabIndex = 0;
    card.role = "button";
    card.innerHTML = `
      <div class="dow">${DOW[i]}</div>
      <div class="date">${d.getDate()}</div>
    `;
    card.addEventListener("click", () => setSelectedDay(iso));
    card.addEventListener("keydown", (e) => {
      if(e.key === "Enter" || e.key === " "){
        e.preventDefault();
        setSelectedDay(iso);
      }
    });
    els.daysRow.appendChild(card);
  }

  const selDate = fromLocalISO(state.selectedISO);
  els.selectedDayLabel.textContent = selDate.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

function renderDayChips(){
  if(!els.daysChips) return;
  els.daysChips.innerHTML = "";

  for(let i=0;i<7;i++){
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (newTaskDays[i] ? " active" : "");
    chip.textContent = DOW[i];
    chip.addEventListener("click", () => {
      newTaskDays[i] = !newTaskDays[i];
      renderDayChips();
    });
    els.daysChips.appendChild(chip);
  }
}

function renderListOnly(){
  const dayISO = state.selectedISO;
  const map = getCompletionMapForCurrentWeekDay(dayISO);
  const items = itemsForSelectedDay();

  els.routineList.innerHTML = "";

  if(items.length === 0){
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No tasks scheduled for this day (or this category).";
    els.routineList.appendChild(empty);
    return;
  }

  for(const it of items){
    const done = !!map[it.id];
    const open = !!state.ui.openDescByItemId[it.id];
    const streak = streakForItem(it.id, dayISO);

    const card = document.createElement("div");
    card.className = "card" + (open ? " open" : "");
    card.innerHTML = `
      <div class="card-top">
        <div class="left">
          <input class="checkbox" type="checkbox" ${done ? "checked" : ""} />
          <div>
            <div class="name">${escapeHtml(it.name)}</div>
            <div class="meta">
              <span class="badge">${escapeHtml(it.category)}</span>
              <span class="streak">🔥 Streak: ${streak}</span>
            </div>
          </div>
        </div>

        <div class="right">
          <button class="small-btn toggle" type="button" title="Toggle description">${open ? "^" : ">"}</button>
          <button class="small-btn" type="button">Edit</button>
          <button class="small-btn danger" type="button">Delete</button>
        </div>
      </div>

      <div class="desc">${it.desc ? escapeHtml(it.desc) : "No description."}</div>
    `;

    card.querySelector(".checkbox").addEventListener("change", (e) => {
      setItemDone(dayISO, it.id, e.target.checked);
    });

    card.querySelector(".toggle").addEventListener("click", () => {
      state.ui.openDescByItemId[it.id] = !state.ui.openDescByItemId[it.id];
      saveState(state);
      renderListOnly();
    });

    // Edit (includes days via prompt)
    const editBtn = card.querySelectorAll("button")[1];
    editBtn.addEventListener("click", () => {
      const newName = prompt("Edit task name:", it.name);
      if(newName === null) return;
      const name = newName.trim();
      if(!name) return;

      const newCat = prompt("Edit category (Health/Study/Work):", it.category);
      if(newCat === null) return;
      const cat = newCat.trim();
      if(!CATEGORIES.includes(cat)){
        alert("Category must be: Health, Study, or Work");
        return;
      }

      const newDesc = prompt("Edit description:", it.desc || "");
      if(newDesc === null) return;

      const newDays = prompt('Edit days: "Sat,Mon" or "Fri,Sat" or "All"', daysToText(it.days));
      if(newDays === null) return;

      const parsed = parseDaysInput(newDays);
      if(!parsed){
        alert('Invalid days. Use "All" or comma-separated: Sat,Sun,Mon,Tue,Wed,Thu,Fri');
        return;
      }

      it.name = name;
      it.category = cat;
      it.desc = newDesc.trim();
      it.days = parsed;

      saveState(state);
      render();
    });

    const delBtn = card.querySelectorAll("button")[2];
    delBtn.addEventListener("click", () => {
      if(!confirm(`Delete "${it.name}"?`)) return;

      state.items = state.items.filter(x => x.id !== it.id);

      for(const ws of Object.keys(state.completion)){
        const week = state.completion[ws];
        for(const day of Object.keys(week)){
          if(week[day] && week[day][it.id]) delete week[day][it.id];
        }
      }

      delete state.ui.openDescByItemId[it.id];
      saveState(state);
      render();
    });

    els.routineList.appendChild(card);
  }
}

function daysToText(daysArr){
  if(!Array.isArray(daysArr) || daysArr.length !== 7) return "All";
  if(daysArr.every(Boolean)) return "All";
  const picks = [];
  for(let i=0;i<7;i++) if(daysArr[i]) picks.push(DOW[i]);
  return picks.join(",");
}

function parseDaysInput(input){
  const s = String(input || "").trim();
  if(!s) return null;
  if(/^all$/i.test(s)) return [true,true,true,true,true,true,true];

  const parts = s.split(",").map(x => x.trim()).filter(Boolean);
  if(parts.length === 0) return null;

  const days = [false,false,false,false,false,false,false];
  for(const p of parts){
    const idx = DOW.findIndex(d => d.toLowerCase() === p.toLowerCase());
    if(idx === -1) return null;
    days[idx] = true;
  }
  return days.some(Boolean) ? days : null;
}

function renderProgressOnly(){
  const { done, total } = dayProgress(state.selectedISO);
  if(total === 0) els.progressText.textContent = "—";
  else{
    const pct = Math.round((done / total) * 100);
    els.progressText.textContent = `${done}/${total} (${pct}%)`;
  }
}

function render(){
  renderDays();
  renderListOnly();
  renderProgressOnly();
}

/* -------------------- Events -------------------- */
// Category pills
document.querySelectorAll(".pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    render();
  });
});

// Days picker open/confirm
els.toggleDays?.addEventListener("click", () => {
  daysPickerOpen = true;
  daysSelectionConfirmed = false;

  els.daysChipsWrap.classList.remove("collapsed");
  els.confirmDays.style.display = "inline-block";
  els.toggleDays.style.display = "none";
});

els.confirmDays?.addEventListener("click", () => {
  if(!newTaskDays.some(Boolean)){
    alert("Pick at least one day.");
    return;
  }
  daysSelectionConfirmed = true;
  daysPickerOpen = false;

  els.daysChipsWrap.classList.add("collapsed");
  els.confirmDays.style.display = "none";
  els.toggleDays.style.display = "inline-block";
});

// Presets (Saudi weekend = Fri + Sat)
els.daysAll?.addEventListener("click", () => {
  newTaskDays = [true,true,true,true,true,true,true];
  renderDayChips();
});
els.daysNone?.addEventListener("click", () => {
  newTaskDays = [false,false,false,false,false,false,false];
  renderDayChips();
});
// Weekdays = Sun..Thu
els.daysWeekdays?.addEventListener("click", () => {
  newTaskDays = [false,true,true,true,true,true,false];
  renderDayChips();
});
// Weekend = Fri + Sat
els.daysWeekend?.addEventListener("click", () => {
  newTaskDays = [true,false,false,false,false,false,true];
  renderDayChips();
});

// Add task
els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.newItemInput.value.trim();
  const category = els.newItemCategory.value;
  const desc = els.newItemDesc.value.trim();
  if(!name) return;

  // If picker is open, REQUIRE confirm (your requested flow)
  if(daysPickerOpen && !daysSelectionConfirmed){
    alert("Press 'Confirm days' to apply the selected days.");
    return;
  }

  // Default = selected day only, unless confirmed multi-day
  const days = daysSelectionConfirmed ? [...newTaskDays] : selectedDayOnlyMask();

  state.items.unshift({ id: uid(), name, category, desc, days });

  els.newItemInput.value = "";
  els.newItemDesc.value = "";

  saveState(state);
  resetAddDaysToSelectedOnly();
  render();
});

// Week nav
els.prevWeek.addEventListener("click", () => {
  setWeekStart(addDays(getWeekStartDate(), -7));
});
els.nextWeek.addEventListener("click", () => {
  setWeekStart(addDays(getWeekStartDate(), 7));
});

// Reset week
els.resetWeek.addEventListener("click", () => {
  if(!confirm("Reset all checkmarks for this week only?")) return;
  state.completion[state.weekStartISO] = {};
  saveState(state);
  render();
});

// Theme toggle
els.toggleTheme.addEventListener("click", () => {
  state.theme = (state.theme === "dark") ? "light" : "dark";
  saveState(state);
  applyTheme();
});

// Export / Import
els.exportJson.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "routine-tracker-export.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

els.importFile.addEventListener("change", async () => {
  const file = els.importFile.files?.[0];
  if(!file) return;

  try{
    const text = await file.text();
    const imported = JSON.parse(text);

    if(!imported || typeof imported !== "object") throw new Error("Invalid JSON");
    if(!Array.isArray(imported.items)) throw new Error("Missing items array");
    if(typeof imported.completion !== "object") throw new Error("Missing completion object");

    state = {
      theme: imported.theme === "light" ? "light" : "dark",
      weekStartISO: imported.weekStartISO || toLocalISO(startOfWeekSaturday(new Date())),
      selectedISO: imported.selectedISO || imported.weekStartISO || toLocalISO(new Date()),
      items: imported.items.map(it => ({
        id: it.id || uid(),
        name: String(it.name || "").trim() || "Untitled",
        category: CATEGORIES.includes(it.category) ? it.category : "Health",
        desc: typeof it.desc === "string" ? it.desc : "",
        days: Array.isArray(it.days) && it.days.length === 7 ? it.days.map(Boolean) : [true,true,true,true,true,true,true]
      })),
      completion: imported.completion || {},
      ui: imported.ui && typeof imported.ui === "object" ? imported.ui : { openDescByItemId: {} }
    };

    if(!state.ui.openDescByItemId) state.ui.openDescByItemId = {};

    saveState(state);
    applyTheme();
    resetAddDaysToSelectedOnly();
    render();
    alert("Import successful.");
  }catch(err){
    alert("Import failed: " + (err?.message || "Unknown error"));
  }finally{
    els.importFile.value = "";
  }
});

/* -------------------- Init -------------------- */
(function init(){
  if(!state.ui) state.ui = { openDescByItemId: {} };
  if(!state.ui.openDescByItemId) state.ui.openDescByItemId = {};

  // Normalize items if old
  state.items = (state.items || []).map(it => ({
    id: it.id || uid(),
    name: it.name || "Untitled",
    category: CATEGORIES.includes(it.category) ? it.category : "Health",
    desc: typeof it.desc === "string" ? it.desc : "",
    days: Array.isArray(it.days) && it.days.length === 7 ? it.days.map(Boolean) : [true,true,true,true,true,true,true]
  }));

  // Normalize date strings if missing
  if(!state.weekStartISO) state.weekStartISO = toLocalISO(startOfWeekSaturday(new Date()));
  if(!state.selectedISO) state.selectedISO = state.weekStartISO;

  saveState(state);
  applyTheme();
  resetAddDaysToSelectedOnly();
  render();
})();
