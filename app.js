// Routine Tracker v3
// - Week starts Saturday (Sat..Fri)
// - Weekend preset = Friday + Saturday
// - When adding a task: default days = SELECTED day only
//   If user expands picker and confirms, they can add to multiple days.
// - Items are global (not week-specific)
// - Completion is per day inside week buckets
// - Streak per item = consecutive days done up to selected day (inclusive)

const STORAGE_KEY = "routine_tracker_v3";
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

// For the Add form: selected days for the new task (Sat..Fri)
let newTaskDays = [false,false,false,false,false,false,false];
let userCustomizedDays = false; // if false, changing selected day resets to selected day only

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

function dayIndexFromISO(dayISO){
  const d = new Date(dayISO + "T00:00:00");
  const js = d.getDay(); // Sun=0 ... Sat=6
  return (js + 1) % 7;   // Sat=0, Sun=1, Mon=2, ... Fri=6
}

function setDefaultDaysToSelected(){
  const idx = dayIndexFromISO(state.selectedISO);
  newTaskDays = [false,false,false,false,false,false,false];
  newTaskDays[idx] = true;
  userCustomizedDays = false;
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
    items: [
      { id: uid(), name: "Walk 30 min", category: "Health", desc: "Easy pace. If busy: 10 minutes is fine.", days: [false,false,true,false,false,false,false] }, // default Mon
      { id: uid(), name: "Read 20 min", category: "Study", desc: "Any book/article. Just keep it consistent.", days: [false,false,true,true,true,true,false] }, // Mon-Thu
      { id: uid(), name: "Deep work 45 min", category: "Work", desc: "No phone. One task only.", days: [false,true,true,true,true,true,false] } // Sun-Thu
    ],
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

// For current UI week/selected day
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

  // reset default add-days if user didn't customize
  if(!userCustomizedDays){
    setDefaultDaysToSelected();
    renderDayChips();
  }

  saveState(state);
  render();
}

function setSelectedDay(iso){
  state.selectedISO = iso;

  if(!userCustomizedDays){
    setDefaultDaysToSelected();
    renderDayChips();
  }

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

// Filtering: day schedule + category
function filteredItems(){
  const dayIdx = dayIndexFromISO(state.selectedISO);

  // by day schedule first
  let items = state.items.filter(it => (it.days?.[dayIdx] ?? true));

  // then by category
  if(activeFilter !== "All"){
    items = items.filter(it => it.category === activeFilter);
  }
  return items;
}

function dayProgress(dayISO){
  // progress is based on ALL items scheduled for that day (ignores category filter)
  const dayIdx = dayIndexFromISO(dayISO);
  const scheduled = state.items.filter(it => (it.days?.[dayIdx] ?? true));
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

// Days chips (add form)
function renderDayChips(){
  if(!els.daysChips) return;
  els.daysChips.innerHTML = "";

  for(let i=0;i<7;i++){
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip" + (newTaskDays[i] ? " active" : "");
    chip.textContent = DOW[i]; // Sat..Fri
    chip.addEventListener("click", () => {
      newTaskDays[i] = !newTaskDays[i];
      userCustomizedDays = true;
      renderDayChips();
    });
    els.daysChips.appendChild(chip);
  }
}

// Render routine list
function renderListOnly(){
  const dayISO = state.selectedISO;
  const map = getCompletionForSelectedWeekDay(dayISO);
  const items = filteredItems();

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
    const toggleBtn = card.querySelector(".toggle");
    toggleBtn.addEventListener("click", () => {
      state.ui.openDescByItemId[it.id] = !state.ui.openDescByItemId[it.id];
      saveState(state);
      renderListOnly();
    });

    // Edit (name/category/desc/days)
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

      // Days editing via simple prompt: e.g. "Sat,Mon,Wed" or "All"
      const newDays = prompt(
        'Edit days (examples: "Sat,Mon,Wed" OR "All" OR "Fri,Sat"):',
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

      // remove item
      state.items = state.items.filter(x => x.id !== it.id);

      // remove from completion maps
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
  for(let i=0;i<7;i++){
    if(daysArr[i]) picks.push(DOW[i]);
  }
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
});

els.confirmDays?.addEventListener("click", () => {
  if(!newTaskDay
