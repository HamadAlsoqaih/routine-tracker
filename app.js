// Routine Tracker v4 (FIXED DAY-SPECIFIC ADD)
// - Week starts Saturday (Sat..Fri)
// - Weekend preset = Friday + Saturday
// - IMPORTANT FIX:
//   Default add = selected day ONLY
//   Multi-day happens ONLY if user opens day picker and presses "Confirm days"
// - Items are global (not week-specific)
// - Completion is per day inside week buckets
// - Streak per item = consecutive days done up to selected day (inclusive)

const STORAGE_KEY = "routine_tracker_v4"; // changed to avoid old localStorage messing you up
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

// Day selection for the Add form
let newTaskDays = [false,false,false,false,false,false,false];
// This flag is THE fix: only if true we allow multi-day on add
let daysSelectionConfirmed = false;

function uid(){
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

function saveState(state){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// date utils
function toISODate(d){
  const x = new Date(d);
  x.setHours(0,0,0,0);
  return x.toISOString().slice(0,10);
}
function addDays(date, n){
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function formatRange(start){
  const end = addDays(start, 6);
  const opts = { year: "numeric", month: "short", day: "numeric" };
  return `${start.toLocaleDateString(undefined, opts)} → ${end.toLocaleDateString(undefined, opts)}`;
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
  const d = new Date(dayISO + "T00:00:00");
  const js = d.getDay(); // Sun=0 ... Sat=6
  return (js + 1) % 7;   // Sat=0, Sun=1, Mon=2, ... Fri=6
}

function selectedDayOnlyMask(){
  const idx = dayIndexFromISO(state.selectedISO);
  const arr = [false,false,false,false,false,false,false];
  arr[idx] = true;
  return arr;
}

function resetAddDaysToSelectedOnly(){
  newTaskDays = selectedDayOnlyMask();
  daysSelectionConfirmed = false;
  renderDayChips();
}

// --- State
function defaultState(){
  const today = new Date();
  const ws = startOfWeekSaturday(today);
  const todayISO = toISODate(today);

  return {
    theme: "dark",
    weekStartISO: toISODate(ws),
    selectedISO: todayISO,
    items: [],
    completion: {}, // completion[weekStartISO][dayISO][itemId] = true
    ui: { openDescByItemId: {} }
  };
}

let state = loadState() || defaultState();

// Theme
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
applyTheme();

// Completion helpers
function ensureWeekBucket(weekStartISO){
  if(!state.completion[weekStartISO]) state.completion[weekStartISO] = {};
}
function getCompletionForSelectedWeekDay(dayISO){
  ensureWeekBucket(state.weekStartISO);
  const week = state.completion[state.weekStartISO];
  if(!week[dayISO]) week[dayISO] = {};
  return week[dayISO];
}
function setItemDone(dayISO, itemId, done){
  const map = getCompletionForSelectedWeekDay(dayISO);
  if(done) map[itemId] = true;
  else delete map[itemId];
  saveState(state);
  renderProgressOnly();
  renderListOnly();
}

// Global lookup for streak
function isDoneOnDay(itemId, dayISO){
  const d = new Date(dayISO + "T00:00:00");
  const ws = startOfWeekSaturday(d);
  const wsISO = toISODate(ws);
  const week = state.completion[wsISO];
  if(!week) return false;
  const dayMap = week[dayISO];
  if(!dayMap) return false;
  return !!dayMap[itemId];
}
function streakForItem(itemId, upToDayISO){
  let streak = 0;
  let cursor = new Date(upToDayISO + "T00:00:00");
  while(true){
    const iso = toISODate(cursor);
    if(isDoneOnDay(itemId, iso)){
      streak += 1;
      cursor = addDays(cursor, -1);
    }else break;
  }
  return streak;
}

// Week controls
function getWeekStartDate(){
  return new Date(state.weekStartISO + "T00:00:00");
}
function setWeekStart(date){
  const ws = startOfWeekSaturday(date);
  state.weekStartISO = toISODate(ws);

  const sel = new Date(state.selectedISO + "T00:00:00");
  const start = ws;
  const end = addDays(ws, 6);
  if(sel < start || sel > end){
    state.selectedISO = state.weekStartISO;
  }

  // reset add-days to selected only (you asked for this behavior)
  resetAddDaysToSelectedOnly();

  saveState(state);
  render();
}
function setSelectedDay(iso){
  state.selectedISO = iso;

  // reset add-days to selected only unless user is currently in "confirmed multi-day mode"
  // your requirement: add should be day-specific by default, always.
  resetAddDaysToSelectedOnly();

  saveState(state);
  render();
}

// UI helpers
function escapeHtml(str){
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Filter: scheduled for selected day + category
function itemsForSelectedDay(){
  const dayIdx = dayIndexFromISO(state.selectedISO);
  let items = state.items.filter(it => (it.days?.[dayIdx] === true));
  if(activeFilter !== "All"){
    items = items.filter(it => it.category === activeFilter);
  }
  return items;
}

function scheduledItemsCountForDay(dayISO){
  const dayIdx = dayIndexFromISO(dayISO);
  return state.items.filter(it => (it.days?.[dayIdx] === true));
}

function dayProgress(dayISO){
  const scheduled = scheduledItemsCountForDay(dayISO);
  const total = scheduled.length;
  if(total === 0) return { done: 0, total: 0 };

  const map = getCompletionForSelectedWeekDay(dayISO);
  let done = 0;
  for(const it of scheduled){
    if(map[it.id]) done++;
  }
  return { done, total };
}

// Render days
function renderDays(){
  els.daysRow.innerHTML = "";
  const start = getWeekStartDate();
  els.weekLabel.textContent = formatRange(start);

  for(let i=0;i<7;i++){
    const d = addDays(start, i);
    const iso = toISODate(d);

    const card = document.createElement("div");
    card.className = "day" + (iso === state.selectedISO ? " selected" : "");
    card.tabIndex = 0;
    card.role = "button";
    card.ariaLabel = `Select ${DOW[i]} ${iso}`;
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

  const selDate = new Date(state.selectedISO + "T00:00:00");
  els.selectedDayLabel.textContent = selDate.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric"
  });
}

// Days chips UI
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

// Render routine list
function renderListOnly(){
  const dayISO = state.selectedISO;
  const map = getCompletionForSelectedWeekDay(dayISO);
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
          <input class="checkbox" type="checkbox" ${done ? "checked" : ""} aria-label="Done: ${escapeHtml(it.name)}" />
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

    // Checkbox
    card.querySelector(".checkbox").addEventListener("change", (e) => {
      setItemDone(dayISO, it.id, e.target.checked);
    });

    // Toggle description
    card.querySelector(".toggle").addEventListener("click", () => {
      state.ui.openDescByItemId[it.id] = !state.ui.openDescByItemId[it.id];
      saveState(state);
      renderListOnly();
    });

    // Edit
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

      // Days editing (simple): "Sat,Mon" or "Fri,Sat" or "All"
      const newDays = prompt(
        'Edit days (examples: "Sat,Mon,Wed" OR "Fri,Sat" OR "All"):',
        daysToText(it.days)
      );
      if(newDays === null) return;

      const parsed = parseDaysInput(newDays);
      if(!parsed){
        alert('Invalid days. Use "All" or comma-separated days like: Sat,Sun,Mon...');
        return;
      }

      it.name = name;
      it.category = cat;
      it.desc = newDesc.trim();
      it.days = parsed;

      saveState(state);
      render();
    });

    // Delete
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

// Filters UI
document.querySelectorAll(".pill").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pill").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeFilter = btn.dataset.filter;
    render();
  });
});

// Days picker behavior
els.toggleDays?.addEventListener("click", () => {
  els.daysChipsWrap.classList.remove("collapsed");
  els.confirmDays.style.display = "inline-block";
  els.toggleDays.style.display = "none";

  // allow editing multiple days now (still not applied unless confirmed)
  daysSelectionConfirmed = false;
});

els.confirmDays?.addEventListener("click", () => {
  if(!newTaskDays.some(Boolean)){
    alert("Pick at least one day.");
    return;
  }

  // once confirmed, this is the only way multi-day applies
  daysSelectionConfirmed = true;

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

// Add item (THE FIX is here)
els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.newItemInput.value.trim();
  const category = els.newItemCategory.value;
  const desc = els.newItemDesc.value.trim();
  if(!name) return;

  // If user did NOT confirm multi-day, FORCE selected-day-only
  const days = daysSelectionConfirmed ? [...newTaskDays] : selectedDayOnlyMask();

  // safety
  if(!days.some(Boolean)){
    alert("Pick at least one day.");
    return;
  }

  state.items.unshift({ id: uid(), name, category, desc, days });

  els.newItemInput.value = "";
  els.newItemDesc.value = "";

  // reset add-days back to selected day only
  resetAddDaysToSelectedOnly();

  // close picker
  els.daysChipsWrap.classList.add("collapsed");
  els.confirmDays.style.display = "none";
  els.toggleDays.style.display = "inline-block";

  saveState(state);
  render();
});

// Week navigation
els.prevWeek.addEventListener("click", () => setWeekStart(addDays(getWeekStartDate(), -7)));
els.nextWeek.addEventListener("click", () => setWeekStart(addDays(getWeekStartDate(), 7)));

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
      weekStartISO: imported.weekStartISO || toISODate(startOfWeekSaturday(new Date())),
      selectedISO: imported.selectedISO || imported.weekStartISO || toISODate(new Date()),
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

// Init
(function init(){
  if(!state.ui) state.ui = { openDescByItemId: {} };
  if(!state.ui.openDescByItemId) state.ui.openDescByItemId = {};
  if(!state.weekStartISO) state.weekStartISO = toISODate(startOfWeekSaturday(new Date()));
  if(!state.selectedISO) state.selectedISO = state.weekStartISO;

  // normalize items
  state.items = (state.items || []).map(it => ({
    id: it.id || uid(),
    name: it.name || "Untitled",
    category: CATEGORIES.includes(it.category) ? it.category : "Health",
    desc: typeof it.desc === "string" ? it.desc : "",
    days: Array.isArray(it.days) && it.days.length === 7 ? it.days.map(Boolean) : [true,true,true,true,true,true,true]
  }));

  resetAddDaysToSelectedOnly();

  saveState(state);
  render();
})();

