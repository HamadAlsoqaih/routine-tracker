// Routine Tracker v2
// Week starts Saturday. Items are global (same across weeks).
// Completion stored per-weekStartISO -> dayISO -> itemId.
// Streak per item = consecutive days completed up to the SELECTED day.

const STORAGE_KEY = "routine_tracker_v2";
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

  prevWeek: document.getElementById("prevWeek"),
  nextWeek: document.getElementById("nextWeek"),
  resetWeek: document.getElementById("resetWeek"),
  toggleTheme: document.getElementById("toggleTheme"),

  exportJson: document.getElementById("exportJson"),
  importFile: document.getElementById("importFile"),
};

let activeFilter = "All";

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
// Find the Saturday on/before a date
function startOfWeekSaturday(date){
  const d = new Date(date);
  d.setHours(0,0,0,0);
  const jsDow = d.getDay(); // Sun=0 ... Sat=6
  const offset = (jsDow + 1) % 7; // Sat->0, Sun->1, Mon->2...
  d.setDate(d.getDate() - offset);
  return d;
}

function defaultState(){
  const today = new Date();
  const ws = startOfWeekSaturday(today);
  return {
    theme: "dark",
    weekStartISO: toISODate(ws),
    selectedISO: toISODate(today),
    items: [
      { id: uid(), name: "Walk 30 min", category: "Health", desc: "Easy pace. If busy: 10 minutes is fine." },
      { id: uid(), name: "Read 20 min", category: "Study", desc: "Any book/article. Just keep it consistent." },
      { id: uid(), name: "Deep work 45 min", category: "Work", desc: "No phone. One task only." }
    ],
    completion: {}, // completion[weekStartISO][dayISO][itemId] = true
    ui: {
      openDescByItemId: {} // remember which descriptions are open
    }
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
function getCompletionForDay(dayISO){
  // dayISO belongs to some weekStart, but our UI writes completion under CURRENT weekStartISO only.
  // For streaks we need global lookup, so we keep this for selected day (current week UI):
  ensureWeekBucket(state.weekStartISO);
  const week = state.completion[state.weekStartISO];
  if(!week[dayISO]) week[dayISO] = {};
  return week[dayISO];
}
function setItemDone(dayISO, itemId, done){
  const map = getCompletionForDay(dayISO);
  if(done) map[itemId] = true;
  else delete map[itemId];
  saveState(state);
  renderProgressOnly();
  renderListOnly(); // update streak badges live
}

// Global lookup: is item done on a specific dayISO (across any week)
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

// Streak: consecutive days done up to selected day (inclusive)
function streakForItem(itemId, upToDayISO){
  let streak = 0;
  let cursor = new Date(upToDayISO + "T00:00:00");

  while(true){
    const iso = toISODate(cursor);
    if(isDoneOnDay(itemId, iso)){
      streak += 1;
      cursor = addDays(cursor, -1);
    }else{
      break;
    }
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

  // keep selected day inside this week
  const sel = new Date(state.selectedISO + "T00:00:00");
  const start = ws;
  const end = addDays(ws, 6);
  if(sel < start || sel > end){
    state.selectedISO = state.weekStartISO; // select Saturday
  }
  saveState(state);
  render();
}
function setSelectedDay(iso){
  state.selectedISO = iso;
  saveState(state);
  render();
}

function dayProgress(dayISO){
  const visibleItems = filteredItems();
  const total = visibleItems.length;
  if(total === 0) return { done: 0, total: 0 };

  // progress should consider ALL items, not only filtered?
  // You didn’t specify. I’m using ALL items (more accurate).
  const allTotal = state.items.length;
  const map = getCompletionForDay(dayISO);
  let done = 0;
  for(const it of state.items){
    if(map[it.id]) done++;
  }
  return { done, total: allTotal };
}

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

function escapeHtml(str){
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Filtering
function filteredItems(){
  if(activeFilter === "All") return state.items;
  return state.items.filter(it => it.category === activeFilter);
}

function renderListOnly(){
  const dayISO = state.selectedISO;
  const map = getCompletionForDay(dayISO);
  const items = filteredItems();

  els.routineList.innerHTML = "";

  if(items.length === 0){
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No items in this category. Add one above or switch filter.";
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
    const toggleBtn = card.querySelector(".toggle");
    toggleBtn.addEventListener("click", () => {
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

      it.name = name;
      it.category = cat;
      it.desc = newDesc.trim();

      saveState(state);
      render();
    });

    // Delete
    const delBtn = card.querySelectorAll("button")[2];
    delBtn.addEventListener("click", () => {
      if(!confirm(`Delete "${it.name}"?`)) return;

      // remove item
      state.items = state.items.filter(x => x.id !== it.id);

      // remove from completion maps
      for(const ws of Object.keys(state.completion)){
        const week = state.completion[ws];
        for(const day of Object.keys(week)){
          if(week[day] && week[day][it.id]) delete week[day][it.id];
        }
      }

      // remove ui open state
      delete state.ui.openDescByItemId[it.id];

      saveState(state);
      render();
    });

    els.routineList.appendChild(card);
  }
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

// Add item
els.addForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const name = els.newItemInput.value.trim();
  const category = els.newItemCategory.value;
  const desc = els.newItemDesc.value.trim();

  if(!name) return;

  state.items.unshift({ id: uid(), name, category, desc });
  els.newItemInput.value = "";
  els.newItemDesc.value = "";
  saveState(state);
  render();
});

// Week navigation
els.prevWeek.addEventListener("click", () => {
  setWeekStart(addDays(getWeekStartDate(), -7));
});
els.nextWeek.addEventListener("click", () => {
  setWeekStart(addDays(getWeekStartDate(), 7));
});
els.resetWeek.addEventListener("click", () => {
  if(!confirm("Reset all checkmarks for this week only?")) return;
  const ws = state.weekStartISO;
  state.completion[ws] = {};
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

els.importFile.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if(!file) return;

  try{
    const text = await file.text();
    const imported = JSON.parse(text);

    // minimal validation
    if(!imported || typeof imported !== "object") throw new Error("Invalid JSON");
    if(!Array.isArray(imported.items)) throw new Error("Missing items array");
    if(typeof imported.completion !== "object") throw new Error("Missing completion object");

    // normalize + keep current theme if missing
    state = {
      theme: imported.theme === "light" ? "light" : "dark",
      weekStartISO: imported.weekStartISO || toISODate(startOfWeekSaturday(new Date())),
      selectedISO: imported.selectedISO || imported.weekStartISO || toISODate(new Date()),
      items: imported.items.map(it => ({
        id: it.id || uid(),
        name: String(it.name || "").trim() || "Untitled",
        category: CATEGORIES.includes(it.category) ? it.category : "Health",
        desc: typeof it.desc === "string" ? it.desc : ""
      })),
      completion: imported.completion || {},
      ui: imported.ui && typeof imported.ui === "object" ? imported.ui : { openDescByItemId: {} }
    };

    saveState(state);
    applyTheme();
    render();
    alert("Import successful.");
  }catch(err){
    alert("Import failed: " + (err?.message || "Unknown error"));
  }finally{
    els.importFile.value = "";
  }
});

// Init fixups
(function init(){
  if(!state.ui) state.ui = { openDescByItemId: {} };
  if(!state.ui.openDescByItemId) state.ui.openDescByItemId = {};
  if(!state.weekStartISO) state.weekStartISO = toISODate(startOfWeekSaturday(new Date()));
  if(!state.selectedISO) state.selectedISO = state.weekStartISO;

  // ensure categories exist on old items
  state.items = (state.items || []).map(it => ({
    id: it.id || uid(),
    name: it.name || "Untitled",
    category: CATEGORIES.includes(it.category) ? it.category : "Health",
    desc: typeof it.desc === "string" ? it.desc : ""
  }));

  saveState(state);
  render();
})();
