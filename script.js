const STORAGE_KEY = "timetableData";
// 祝日はバックアップ・本体データに含めず、別キーのキャッシュ（オフライン用）としてだけ保存する。
const HOLIDAY_CACHE_KEY = "timetableHolidays";
const HOLIDAY_API_URL = "https://holidays-jp.github.io/api/v1/date.json";
const PERIODS = 8;
const FIRST_TERM_START_MONTH = 4;
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
const WEEKDAY_KEYS = [...WEEKDAYS];
const SETTINGS_KEYS = ["termChangeMonth", "subjectColors", "subjectColorExcluded", "subjectNames", "subjectNameExcluded", "weekdayColors", "holidayColor"];
const DATA_KEYS = ["schedules", "examData", "calendar", "overrides", "ToDo"];

const JSON_TAB_CONTENT = {
  calendar: {
    prompt: `あなたは学校の年間予定表をJSONに変換するアシスタントです。
添付した年間予定表の画像を読み取り、「calendar」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 日付は必ず YYYY-MM-DD 形式にする。
- 年間予定表に明示されている日付だけを登録する。表にない日付を推測して登録しない。
- 通常授業日は type を "A"、"B"、"C" のいずれかにする。
- 変則時間割日は type を "pattern" にする。
- 行事日は type を "special" にし、eventName に行事名を入れる。
- 考査日は type を "exam" にする。
- 行事の日には限目ごとの授業を登録しない。
- 変則時間割では patternItems を使用する。
- patternItems の source は "regular" または "custom"。
- regular の場合は、その日の何限目かを period、参照元の曜日を weekday、参照元の A/B/C を type、参照元の限目を sourcePeriod に指定する。
- custom の場合は、その限の授業を lesson.subject に直接入力する。
- 教科名は画像に書かれている表記をそのまま使う。
- 読み取れない教科名は推測しない。

出力例:
{
  "calendar": [
    { "date": "2026-10-05", "type": "A" },
    { "date": "2026-10-06", "type": "pattern", "patternItems": [
      { "period": 1, "source": "regular", "weekday": "水", "type": "A", "sourcePeriod": 2 },
      { "period": 2, "source": "custom", "lesson": { "subject": "特別授業" } }
    ] },
    { "date": "2026-10-07", "type": "special", "eventName": "文化祭" },
    { "date": "2026-10-16", "type": "exam" }
  ]
}`,
    schema: `calendar は、日付ごとの年間予定設定です。

各要素の基本形:
{
  "date": "2026-10-05",
  "type": "A"
}

type は次のいずれかです。
- A: A時間割
- B: B時間割
- C: C時間割
- pattern: 変則時間割
- special: 行事
- exam: 考査

行事:
{
  "date": "2026-10-07",
  "type": "special",
  "eventName": "文化祭"
}

変則時間割:
{
  "date": "2026-10-08",
  "type": "pattern",
  "patternItems": [
    {
      "period": 1,
      "source": "regular",
      "weekday": "水",
      "type": "A",
      "sourcePeriod": 2
    },
    {
      "period": 2,
      "source": "custom",
      "lesson": { "subject": "特別授業" }
    }
  ]
}
regular は通常時間割の指定、custom はその日だけの直接入力です。`
  },
  schedule: {
    prompt: `あなたは学校の通常時間割表をJSONに変換するアシスタントです。
添付した通常時間割表の画像を読み取り、「schedules」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 前期は schedules.firstTerm、後期は schedules.secondTerm に分ける。
- A/B/Cそれぞれについて、曜日ごとの時間割を作る。
- 曜日は 日、月、火、水、木、金、土 を使用する。
- 各曜日の1〜8限を指定する。
- 授業がない限は登録しない。
- 教科名は画像に書かれている表記をそのまま subject に入れる。
- 教員名や教室名は含めない。
- S/T/Uなどの学校内の記号も、画像に書かれているまま subject に記録する。
- 読み取れない教科名は推測しない。

出力例:
{
  "schedules": {
    "firstTerm": {
      "A": { "月": { "1": { "subject": "数学" } } },
      "B": {},
      "C": {}
    },
    "secondTerm": {
      "A": {},
      "B": {},
      "C": {}
    }
  }
}`,
    schema: `schedules は、曜日ごとの通常時間割です。

構造:
schedules
├ firstTerm
│ ├ A
│ ├ B
│ └ C
└ secondTerm
  ├ A
  ├ B
  └ C

A/B/C の中に曜日があり、曜日の中に1〜8限を入れます。

例:
{
  "schedules": {
    "secondTerm": {
      "A": {
        "水": {
          "1": { "subject": "数学α" },
          "2": { "subject": "S" },
          "3": { "subject": "Q" }
        }
      }
    }
  }
}`
  },
  exam: {
    prompt: `あなたは学校の考査時間割表をJSONに変換するアシスタントです。
添付した考査日程表の画像を読み取り、「examData」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 日付は必ず YYYY-MM-DD 形式にする。
- 日付ごとに、何限目が何の教科かを記録する。
- 考査の教科名は画像の表記をそのまま subject に入れる。
- 教員名や教室名は含めない。
- 通常時間割やA/B/Cは使用しない。
- 授業が存在しない限は登録しない。
- 読み取れない教科名は推測しない。

出力例:
{
  "examData": {
    "2026-10-16": {
      "1": { "subject": "数学" },
      "2": { "subject": "英語" },
      "3": { "subject": "国語" }
    }
  }
}`,
    schema: `examData は、考査日ごとの考査時間割です。

例:
{
  "examData": {
    "2026-10-16": {
      "1": { "subject": "数学" },
      "2": { "subject": "英語" }
    }
  }
}

この例では、2026-10-16 の1限が数学、2限が英語です。
考査日は通常の schedules を参照せず、examData の内容だけで表示されます。`
  },
  override: {
    prompt: `あなたは学校の時間割変更表をJSONに変換するアシスタントです。
添付した時間割変更表を読み取り、「overrides」だけを使ったJSONを作成してください。

ルール:
- JSON以外の文章は一切出力しない。
- 日付は必ず YYYY-MM-DD 形式にする。
- 時間割変更は、その日・その限の授業だけを変更する。
- 各日付の periods に、変更する限だけを入れる。
- 教科名は画像の表記をそのまま subject に入れる。
- 変更されない限は登録しない。
- 読み取れない教科名は推測しない。

出力例:
{
  "overrides": {
    "2026-10-15": {
      "periods": {
        "3": { "subject": "英語" }
      }
    },
    "2026-10-20": {
      "periods": {
        "1": { "subject": "数学" },
        "4": { "subject": "体育" }
      }
    }
  }
}`,
    schema: `overrides は、その日・その限だけの時間割変更です。

例:
{
  "overrides": {
    "2026-10-15": {
      "periods": {
        "3": { "subject": "英語" }
      }
    }
  }
}

これは 2026-10-15 の3限だけを上書きします。
年間予定の種類そのものは変更しません。
考査日の変更は overrides ではなく examData を使います。`
  },
  all: {
    prompt: `アプリの時間割関係データをJSONにまとめるアシスタントです。設定データは含めず、schedules / calendar / examData / overrides だけを使ったJSONを作成してください。`,
    schema: `「全体」のJSONは、設定を除いた時間割関係のデータ全体です。

構造:
{
  "schedules": {},
  "calendar": [],
  "examData": {},
  "overrides": {}
}

schedules:
前期・後期 × A/B/C × 曜日 × 1〜8限 の通常時間割です。

calendar:
日付ごとの A/B/C、変則、行事、考査を管理します。

examData:
考査日の限ごとの教科です。

overrides:
通常授業について、その日・その限だけを上書きします。

settings などのアプリ設定は含みません。`
  }
};

function emptyData() {
  return {
    version: 6,
    settings: {
      termChangeMonth: 10,
      subjectColors: {},
      subjectColorExcluded: [],
      subjectNames: {},
      subjectNameExcluded: [],
      weekdayColors: {
        "日": "#fff0f0",
        "月": "#ffffff",
        "火": "#ffffff",
        "水": "#ffffff",
        "木": "#ffffff",
        "金": "#ffffff",
        "土": "#f0f6ff"
      },
      holidayColor: "#ffdfe3"
    },
    schedules: {
      firstTerm: { A: {}, B: {}, C: {} },
      secondTerm: { A: {}, B: {}, C: {} }
    },
    examData: {},
    calendar: [],
    overrides: {},
    ToDo: []
  };
}

function isPlainObject(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function deepMerge(a, b) {
  if (!isPlainObject(a) || !isPlainObject(b)) return b;
  const out = { ...a };
  for (const [key, value] of Object.entries(b)) {
    out[key] = isPlainObject(value) && isPlainObject(out[key]) ? deepMerge(out[key], value) : value;
  }
  return out;
}

function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
function pad2(n) { return String(n).padStart(2, "0"); }

// 設定値は「元になる純色」として扱い、表示時だけ白を混ぜて薄くします。
function normalizeHexColor(value, fallback="#808080") {
  const hex = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : fallback;
}

function rgbToHsl(r,g,b) {
  r/=255; g/=255; b/=255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  const l=(max+min)/2;
  const d=max-min;
  if(d===0) return {h:0,s:0,l};
  const s=l>0.5 ? d/(2-max-min) : d/(max+min);
  let h;
  switch(max){
    case r: h=(g-b)/d+(g<b?6:0); break;
    case g: h=(b-r)/d+2; break;
    default: h=(r-g)/d+4;
  }
  return {h:h/6,s,l};
}

function hslToRgb(h,s,l) {
  if(s===0){ const v=Math.round(l*255); return [v,v,v]; }
  const hue2rgb=(p,q,t)=>{
    if(t<0)t+=1; if(t>1)t-=1;
    if(t<1/6)return p+(q-p)*6*t;
    if(t<1/2)return q;
    if(t<2/3)return p+(q-p)*(2/3-t)*6;
    return p;
  };
  const q=l<0.5 ? l*(1+s) : l+s-l*s;
  const p=2*l-q;
  return [
    Math.round(hue2rgb(p,q,h+1/3)*255),
    Math.round(hue2rgb(p,q,h)*255),
    Math.round(hue2rgb(p,q,h-1/3)*255)
  ];
}

function hexToRgb(hex) {
  const clean=normalizeHexColor(hex);
  return [parseInt(clean.slice(1,3),16),parseInt(clean.slice(3,5),16),parseInt(clean.slice(5,7),16)];
}

function rgbToHex(r,g,b) {
  return `#${[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,"0")).join("")}`;
}

function toPureColor(value) {
  const hex=normalizeHexColor(value);
  const [r,g,b]=hexToRgb(hex);
  const max=Math.max(r,g,b), min=Math.min(r,g,b);
  if(min >= 248) return "#ffffff";
  if(min <= 8 && max <= 8) return "#000000";
  if(max-min <= 10) return "#808080";
  const {h}=rgbToHsl(r,g,b);
  const [pr,pg,pb]=hslToRgb(h,1,0.5);
  return rgbToHex(pr,pg,pb);
}

function mixWithWhite(value, whiteRatio=0.84) {
  const [r,g,b]=hexToRgb(value);
  const ratio=clamp(Number(whiteRatio),0,1);
  return rgbToHex(
    r+(255-r)*ratio,
    g+(255-g)*ratio,
    b+(255-b)*ratio
  );
}

function displayColor(value) {
  return mixWithWhite(toPureColor(value), 0.88);
}

function pureColorFromInput(input) {
  if(input) input.value=toPureColor(input.value);
}
function isValidDateKey(v) { return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00`)); }
function toDateKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth()+1)}-${pad2(date.getDate())}`; }
function fromDateKey(key) { const [y,m,d] = key.split("-").map(Number); return new Date(y,m-1,d); }
function addDays(date, days) { const d = new Date(date); d.setDate(d.getDate()+days); return d; }
// 月単位でずらす。移動先の月に同じ日がなければ月末に丸める（3/31の1カ月前は2月末）。
function shiftMonths(date, months) {
  const d = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(date.getDate(), lastDay));
  return d;
}
function getMonday(date) { const d = new Date(date); d.setHours(0,0,0,0); const day = d.getDay(); d.setDate(d.getDate() + (day === 0 ? -6 : 1-day)); return d; }
function isSameDate(a,b) { return toDateKey(a) === toDateKey(b); }
function formatDateJP(date) { return `${date.getFullYear()}年${date.getMonth()+1}月${date.getDate()}日（${WEEKDAYS[date.getDay()]}）`; }
function getWeekdayKey(date) { return WEEKDAY_KEYS[date.getDay()]; }
function getTermForDate(date) {
  // 後期開始月以降、または前期開始月より前（1〜3月など）は後期。
  const month = date.getMonth() + 1;
  return (month >= appData.settings.termChangeMonth || month < FIRST_TERM_START_MONTH) ? "secondTerm" : "firstTerm";
}
function escapeHTML(value) { return String(value ?? "").replace(/[&<>'"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[ch])); }
function normalizeLesson(lesson) {
  if (!isPlainObject(lesson)) return null;
  const subject = String(lesson.subject || "").trim();
  return subject ? { subject } : null;
}
function cloneLesson(lesson) { return normalizeLesson(lesson); }
function makeLesson(subject="") {
  return normalizeLesson({ subject: String(subject).trim() });
}

// 祝日（バックアップに含めない。別キーにキャッシュしてオフラインでも表示できるようにする）
function loadHolidayCache() {
  try {
    const list = JSON.parse(localStorage.getItem(HOLIDAY_CACHE_KEY) || "[]");
    return new Set(Array.isArray(list) ? list.filter(isValidDateKey) : []);
  } catch (error) {
    return new Set();
  }
}
let holidaySet = loadHolidayCache();

function makeTodoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `todo-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
}

function normalizeTodo(todo) {
  if (!isPlainObject(todo)) return null;
  const content = String(todo.content ?? "").trim();
  const dueDate = String(todo.dueDate ?? "").trim();
  if (!content || !isValidDateKey(dueDate)) return null;
  const id = String(todo.id || makeTodoId()).trim();
  const subject = String(todo.subject || "").trim();
  const out = { id, content, dueDate };
  if (subject) out.subject = subject;
  if (todo.pinned === true) out.pinned = true;
  return out;
}

function sortTodos(items) {
  return [...items].sort((a,b)=>{
    const pinned = Number(Boolean(b.pinned)) - Number(Boolean(a.pinned));
    if (pinned) return pinned;
    const due = String(a.dueDate).localeCompare(String(b.dueDate));
    if (due) return due;
    return String(a.id).localeCompare(String(b.id));
  });
}

function getTodoSubjectColor(todo) {
  if (!todo?.subject) return null;
  const original = String(todo.subject).trim();
  const display = resolveSubject(original);
  const colors = appData.settings?.subjectColors || {};
  const color = colors[original] || colors[display] || null;
  return /^#[0-9a-fA-F]{6}$/.test(String(color || "")) ? displayColor(color) : null;
}

function toggleTodoPinned(id) {
  const todo = (appData.ToDo || []).find(item => item.id === id);
  if (!todo) return;
  todo.pinned = !todo.pinned;
  appData.ToDo = sortTodos(appData.ToDo || []);
  saveData();
}

function addTodoItem(content, dueDate, subject="") {
  const todo = normalizeTodo({ id: makeTodoId(), content, dueDate, subject });
  if (!todo) throw new Error("ToDoの内容または期限が正しくありません。");
  if (!Array.isArray(appData.ToDo)) appData.ToDo=[];
  appData.ToDo.push(todo);
  appData.ToDo=sortTodos(appData.ToDo);
  saveData();
  return todo;
}

function removeTodoItem(id) {
  appData.ToDo=(appData.ToDo || []).filter(todo=>todo.id!==id);
  saveData();
}

function getTodosForDate(dateKey, subject=null) {
  return sortTodos((appData.ToDo || []).filter(todo=>
    todo.dueDate===dateKey && (subject===null || todo.subject===subject)
  ));
}

function todoDisplayDate(dateKey) {
  const d=fromDateKey(dateKey);
  return `${d.getMonth()+1}/${d.getDate()}（${WEEKDAYS[d.getDay()]}）`;
}

function todoItemsHTML(items, emptyText="まだToDoはありません。", useSubjectColor=true, allowPin=true) {
  if (!items.length) return `<div class="muted todo-empty-message">${escapeHTML(emptyText)}</div>`;
  const todayKey=toDateKey(new Date());
  return items.map(todo=>{
    const overdue=todo.dueDate<todayKey;
    const subjectLabel=todo.subject ? escapeHTML(resolveSubject(todo.subject)) : "";
    const subjectColor=useSubjectColor ? getTodoSubjectColor(todo) : null;
    const style=subjectColor ? ` style="--todo-subject-color:${subjectColor};"` : "";
    return `<div class="todo-item${overdue ? " overdue" : ""}${todo.pinned ? " pinned" : ""}"${style}>
      <div class="todo-item-main">
        <div class="todo-item-content">${todo.pinned ? `<span class="todo-pinned-label" aria-label="固定済み">固定済み</span>` : ""}${escapeHTML(todo.content)}</div>
        <div class="todo-item-meta"><span>${escapeHTML(todoDisplayDate(todo.dueDate))}</span>${subjectLabel ? `<span>${subjectLabel}</span>` : ""}</div>
      </div>
      <div class="todo-item-actions">
        ${allowPin ? `<button type="button" class="secondary-button small-button todo-pin-button" data-toggle-todo-pin="${escapeHTML(todo.id)}">${todo.pinned ? "固定解除" : "固定"}</button>` : ""}
        <button type="button" class="remove-button todo-delete-button" data-delete-todo="${escapeHTML(todo.id)}">削除</button>
      </div>
    </div>`;
  }).join("");
}

function bindTodoItemActions(container, rerender) {
  if (!container || container.dataset.todoActionsBound === "1") return;
  container.dataset.todoActionsBound = "1";
  container.addEventListener("click", event => {
    const pinButton = event.target.closest?.("[data-toggle-todo-pin]");
    if (pinButton && container.contains(pinButton)) {
      event.preventDefault();
      event.stopPropagation();
      toggleTodoPinned(pinButton.dataset.toggleTodoPin);
      rerender();
      return;
    }
    const deleteButton = event.target.closest?.("[data-delete-todo]");
    if (deleteButton && container.contains(deleteButton)) {
      event.preventDefault();
      event.stopPropagation();
      if (!confirm("このToDoを削除しますか？")) return;
      removeTodoItem(deleteButton.dataset.deleteTodo);
      rerender();
    }
  });
}

function renderTodoList() {
  const el=document.getElementById("todo-list");
  if(!el) return;
  const items=sortTodos(appData.ToDo || []);
  el.innerHTML=`<div class="card todo-list-card">${todoItemsHTML(items, "登録されているToDoはありません。", true)}</div>`;
  bindTodoItemActions(el.firstElementChild, renderTodoList);
}

function openTodoAddModal(defaultDate=toDateKey(new Date())) {
  const overlay=document.getElementById("lesson-modal");
  const content=document.getElementById("modal-content");
  const subjectOptions=getSubjectListCandidates();
  content.innerHTML=`
    <h2 id="modal-title" class="edit-primary-title">ToDoを追加</h2>
    <div class="todo-modal-form">
      <div class="form-field full">
        <label for="todo-modal-content">名前（内容）</label>
        <input id="todo-modal-content" type="text" placeholder="例: 数学の課題を提出">
      </div>
      <div class="form-field">
        <label for="todo-modal-due">期限</label>
        <input id="todo-modal-due" type="date" value="${escapeHTML(defaultDate)}">
      </div>
      <div class="form-field">
        <label for="todo-modal-subject">教科（任意）</label>
        <select id="todo-modal-subject"><option value="">指定なし</option>${subjectOptions.map(subject=>`<option value="${escapeHTML(subject)}">${escapeHTML(resolveSubject(subject))}</option>`).join("")}</select>
      </div>
    </div>
    <div class="button-row">
      <button id="save-todo-modal" class="primary-button">ToDoを追加</button>
    </div>`;
  document.getElementById("save-todo-modal").addEventListener("click",()=>{
    const text=document.getElementById("todo-modal-content").value.trim();
    const due=document.getElementById("todo-modal-due").value;
    const subject=document.getElementById("todo-modal-subject").value;
    if(!text) return alert("名前（内容）を入力してください。");
    if(!isValidDateKey(due)) return alert("期限を入力してください。");
    addTodoItem(text,due,subject);
    closeModal();
    if(document.getElementById("view-todo")?.classList.contains("active-view")) renderTodoList();
    if(document.getElementById("view-timetable")?.classList.contains("active-view")) renderWeek();
  });
  overlay.classList.remove("hidden");
}

function buildTodoModalSection(dateKey, subject=null) {
  const items=getTodosForDate(dateKey, subject);
  const title=subject ? `ToDo（${resolveSubject(subject)}）` : "ToDo";
  const emptyText=subject ? "この日・この教科のToDoはありません。" : "この日のToDoはありません。";
  return `<div class="todo-modal-section" data-todo-date="${escapeHTML(dateKey)}" data-todo-subject="${escapeHTML(subject || "")}">
    <div class="edit-change-label">${escapeHTML(title)}</div>
    <div id="todo-inline-list" class="todo-inline-list">${todoItemsHTML(items, emptyText, false, false)}</div>
    <div class="todo-inline-row">
      <input id="todo-inline-content" type="text" placeholder="ToDoの内容">
      <button type="button" id="todo-inline-add" class="secondary-button small-button todo-inline-add">追加</button>
    </div>
  </div>`;
}

function bindTodoModalSection(dateKey, subject=null) {
  const add=document.getElementById("todo-inline-add");
  const input=document.getElementById("todo-inline-content");
  const list=document.getElementById("todo-inline-list");
  if(!add || !input || !list) return;
  const refresh=()=>{
    list.innerHTML=todoItemsHTML(getTodosForDate(dateKey,subject), subject ? "この日・この教科のToDoはありません。" : "この日のToDoはありません。", false, false);
  };
  bindTodoItemActions(list, refresh);
  add.addEventListener("click",()=>{
    const text=input.value.trim();
    if(!text) return alert("ToDoの内容を入力してください。");
    addTodoItem(text,dateKey,subject || "");
    input.value="";
    refresh();
    if(document.getElementById("view-todo")?.classList.contains("active-view")) renderTodoList();
  });
}

function normalizePeriodTable(table) {
  const out = {};
  if (!isPlainObject(table)) return out;
  for (let p=1;p<=PERIODS;p++) {
    const lesson = normalizeLesson(table[String(p)]);
    if (lesson) out[String(p)] = lesson;
  }
  return out;
}

function normalizeScheduleTable(table) {
  const out = { A: {}, B: {}, C: {} };
  if (!isPlainObject(table)) return out;
  for (const type of ["A","B","C"]) {
    const source = isPlainObject(table[type]) ? table[type] : {};
    for (const day of WEEKDAY_KEYS) out[type][day] = normalizePeriodTable(source[day]);
  }
  return out;
}

function normalizePatternItem(item, fallbackPeriod = 1) {
  if (!isPlainObject(item)) return null;
  const period = Number(item.period ?? fallbackPeriod);
  if (!Number.isInteger(period) || period < 1 || period > PERIODS) return null;
  const source = item.source === "custom" ? "custom" : "regular";
  if (source === "custom") {
    const lesson = normalizeLesson(item.lesson);
    if (!lesson) return null;
    return { period, source: "custom", lesson };
  }
  const weekday = WEEKDAY_KEYS.includes(item.weekday) ? item.weekday : null;
  const type = ["A","B","C"].includes(item.type) ? item.type : null;
  const sourcePeriod = Number(item.sourcePeriod ?? item.period);
  if (!weekday || !type || !Number.isInteger(sourcePeriod) || sourcePeriod < 1 || sourcePeriod > PERIODS) return null;
  return { period, source: "regular", weekday, type, sourcePeriod };
}

function normalizeCalendarEntry(entry) {
  if (!entry || !isValidDateKey(entry.date)) return null;
  const out = { date: entry.date };
  const rawType = typeof entry.type === "string" ? entry.type.trim() : "";
  if (["A","B","C"].includes(rawType)) {
    out.type = rawType;
  } else if (rawType === "special") {
    out.type = "special";
    out.eventName = String(entry.eventName || "").trim();
  } else if (rawType === "exam") {
    out.type = "exam";
  } else if (rawType === "pattern") {
    const items = Array.isArray(entry.patternItems)
      ? entry.patternItems.map((item,i)=>normalizePatternItem(item,i+1)).filter(Boolean)
      : [];
    if (!items.length) return null;
    out.type = "pattern";
    out.patternItems = items;
  } else {
    return null;
  }
  return out;
}

function normalizeOverride(override) {
  const out = { periods:{} };
  if (!isPlainObject(override)) return out;
  if (isPlainObject(override.periods)) out.periods = override.periods;
  return out;
}

function collectSubjects(data) {
  const set = new Set();
  const visit = value => {
    if (!isPlainObject(value)) return;
    for (const item of Object.values(value)) {
      if (item && typeof item.subject === "string" && item.subject.trim()) set.add(item.subject.trim());
    }
  };
  const schedules = data?.schedules || {};
  for (const term of ["firstTerm", "secondTerm"]) {
    for (const type of ["A", "B", "C"]) {
      for (const day of WEEKDAY_KEYS) visit(schedules?.[term]?.[type]?.[day]);
    }
  }
  for (const value of Object.values(data?.examData || {})) visit(value);
  for (const value of Object.values(data?.overrides || {})) visit(value?.periods);
  for (const entry of data?.calendar || []) {
    if (Array.isArray(entry?.patternItems)) {
      for (const item of entry.patternItems) if (item?.source === "custom") visit({ "1": item.lesson });
    }
  }
  return [...set];
}

function ensureSubjectColors(data) {
  if (!isPlainObject(data) || !isPlainObject(data.settings)) return data;
  data.settings.subjectColors = isPlainObject(data.settings.subjectColors) ? data.settings.subjectColors : {};
  data.settings.subjectColorExcluded = Array.isArray(data.settings.subjectColorExcluded)
    ? [...new Set(data.settings.subjectColorExcluded.map(v => String(v).trim()).filter(Boolean))]
    : [];

  const excluded = new Set(data.settings.subjectColorExcluded);
  for (const subject of collectSubjects(data)) {
    if (!subject || excluded.has(subject)) continue;
    if (!Object.prototype.hasOwnProperty.call(data.settings.subjectColors, subject)) {
      data.settings.subjectColors[subject] = "#808080";
    }
  }
  return data;
}

// 既知のキーだけを取り込む。未知のキー（祝日・旧設定・任意のキー）は保存データに残らない。
function normalizeData(data) {
  const source = isPlainObject(data) ? data : {};
  const base = emptyData();
  const sourceSettings = isPlainObject(source.settings) ? source.settings : {};
  const picked = { settings: {} };
  for (const key of SETTINGS_KEYS) if (key in sourceSettings) picked.settings[key] = sourceSettings[key];
  for (const key of DATA_KEYS) if (key in source) picked[key] = source[key];
  const merged = deepMerge(base, picked);
  merged.version = 6;
  merged.settings.termChangeMonth = clamp(Number(merged.settings.termChangeMonth) || 10, FIRST_TERM_START_MONTH, 12);
  merged.settings.subjectColors = isPlainObject(merged.settings.subjectColors) ? merged.settings.subjectColors : {};
  // 色の値は HTML 属性や style に使うため、#RRGGBB 形式以外は既定色に置き換える。
  for (const [subject, color] of Object.entries(merged.settings.subjectColors)) {
    if (!/^#[0-9a-fA-F]{6}$/.test(String(color))) merged.settings.subjectColors[subject] = "#808080";
    else merged.settings.subjectColors[subject] = toPureColor(color);
  }
  merged.settings.subjectNames = isPlainObject(merged.settings.subjectNames) ? merged.settings.subjectNames : {};
  merged.settings.subjectNameExcluded = Array.isArray(merged.settings.subjectNameExcluded)
    ? [...new Set(merged.settings.subjectNameExcluded.map(v => String(v).trim()).filter(Boolean))]
    : [];
  merged.settings.subjectColorExcluded = Array.isArray(merged.settings.subjectColorExcluded)
    ? [...new Set(merged.settings.subjectColorExcluded.map(v => String(v).trim()).filter(Boolean))]
    : [];

  merged.settings.weekdayColors = isPlainObject(merged.settings.weekdayColors) ? merged.settings.weekdayColors : {};
  for (const day of WEEKDAY_KEYS) {
    const color = merged.settings.weekdayColors[day];
    merged.settings.weekdayColors[day] = toPureColor(/^#[0-9a-fA-F]{6}$/.test(String(color || "")) ? color : base.settings.weekdayColors[day]);
  }
  merged.settings.holidayColor = toPureColor(/^#[0-9a-fA-F]{6}$/.test(String(merged.settings.holidayColor || "")) ? merged.settings.holidayColor : base.settings.holidayColor);
  merged.schedules = {
    firstTerm: normalizeScheduleTable(merged.schedules?.firstTerm),
    secondTerm: normalizeScheduleTable(merged.schedules?.secondTerm)
  };
  merged.examData = isPlainObject(merged.examData) ? merged.examData : {};
  for (const [date, exam] of Object.entries(merged.examData)) merged.examData[date] = normalizePeriodTable(exam);
  merged.calendar = Array.isArray(merged.calendar)
    ? merged.calendar.map(normalizeCalendarEntry).filter(Boolean).sort((a,b)=>a.date.localeCompare(b.date))
    : [];
  const overrides = {};
  if (isPlainObject(merged.overrides)) {
    for (const [date, value] of Object.entries(merged.overrides)) {
      if (!isValidDateKey(date)) continue;
      const normalizedOverride = normalizeOverride(value);
      normalizedOverride.periods = normalizePeriodTable(normalizedOverride.periods);
      overrides[date] = normalizedOverride;
    }
  }
  merged.overrides = overrides;
  merged.ToDo = Array.isArray(merged.ToDo)
    ? merged.ToDo.map(todo=>normalizeTodo(todo)).filter(Boolean)
    : [];
  merged.ToDo = sortTodos(merged.ToDo);

  // 現在の時間割データに存在しない教科は、除外リストからも自動的に整理する。
  // 将来その教科が再登録されたときは、通常どおり自動で設定欄へ追加される。
  const activeSubjects = new Set(collectSubjects(merged));
  merged.settings.subjectColorExcluded = merged.settings.subjectColorExcluded.filter(subject => activeSubjects.has(subject));
  merged.settings.subjectNameExcluded = merged.settings.subjectNameExcluded.filter(subject => activeSubjects.has(subject));

  for (const subject of merged.settings.subjectColorExcluded) {
    delete merged.settings.subjectColors[subject];
  }

  ensureSubjectColors(merged);
  return merged;
}

function loadData() {
  let raw;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch (error) {
    alert("保存データを読み込めませんでした（ブラウザのストレージが使えない状態の可能性があります）。");
    throw error;
  }
  if (!raw) return emptyData();
  try { return normalizeData(JSON.parse(raw)); }
  catch (error) {
    console.error(error);
    alert("保存データが壊れているため読み込めませんでした。初期状態で起動します。次にデータを保存すると、元のデータは上書きされます。");
    return emptyData();
  }
}

let appData = loadData();
let currentWeekStart = getMonday(new Date());
let timetableDisplayMode = "date";
let selectedSubjectForList = "";

function saveData() {
  appData = normalizeData(appData);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
    refreshBackupJSON();
  } catch (error) {
    alert("データを保存できませんでした（ストレージの容量不足、またはブラウザの設定の可能性があります）。");
    throw error;
  }
}

function getCalendarEntry(dateKey) { return appData.calendar.find(x => x.date === dateKey) || null; }
function resolveSubject(subject) { return subject ? (appData.settings.subjectNames[subject] || subject) : ""; }
function subjectColor(subject) {
  const actual = resolveSubject(subject);
  const base = appData.settings.subjectColors[subject] || appData.settings.subjectColors[actual] || "#808080";
  return displayColor(base);
}
function getRegularLesson(date, type, period, weekdayOverride = null) {
  const term = getTermForDate(date);
  const weekday = weekdayOverride || getWeekdayKey(date);
  return cloneLesson(appData.schedules?.[term]?.[type]?.[weekday]?.[String(period)] || null);
}

function buildPatternSchedule(date, patternItems) {
  const periods = {};
  for (let i=0;i<patternItems.length;i++) {
    const item = normalizePatternItem(patternItems[i], i+1);
    if (!item) continue;
    if (item.source === "custom") periods[item.period] = cloneLesson(item.lesson);
    else periods[item.period] = getRegularLesson(date, item.type, item.sourcePeriod, item.weekday);
  }
  return periods;
}

function getResolvedSchedule(date) {
  const dateKey = toDateKey(date);
  const entry = getCalendarEntry(dateKey);
  const override = appData.overrides[dateKey] || null;

  // 未入力日は未入力のまま。Aへの暗黙フォールバックはしない。
  const type = entry?.type || null;
  let eventName = entry?.eventName || null;
  const patternItems = entry?.patternItems || null;

  const periods = {};
  let label = "未入力";

  if (type === "exam") {
    const exam = appData.examData[dateKey] || {};
    for (let p=1;p<=PERIODS;p++) periods[p] = cloneLesson(exam[String(p)] || null);
    label = "考査";
  } else if (type === "special") {
    eventName = eventName || "行事";
    label = "行事";
  } else if (type === "pattern") {
    Object.assign(periods, buildPatternSchedule(date, patternItems || []));
    label = "変則";
  } else if (["A","B","C"].includes(type)) {
    for (let p=1;p<=PERIODS;p++) periods[p] = getRegularLesson(date, type, p);
    label = `${type}・${getWeekdayKey(date)}`;
  }

  // 考査日は examData を唯一の授業データ源とし、overrides は適用しない。
  if (type !== "exam") {
    for (let p=1;p<=PERIODS;p++) if (override?.periods?.[String(p)]) periods[p] = cloneLesson(override.periods[String(p)]);
  }
  const shownEventName = type === "special" ? eventName : null;
  return { periods, label, type, eventName: shownEventName };
}

function isHoliday(date) {
  return holidaySet.has(toDateKey(date));
}

function getDayHeaderColor(date) {
  if (isHoliday(date)) return displayColor(appData.settings.holidayColor);
  return displayColor(appData.settings.weekdayColors[getWeekdayKey(date)] || "#ffffff");
}

function scrollTodayIntoView() {
  if (timetableDisplayMode !== "date") return;

  // 日付だけで週に含まれるか判定する（日曜のように時刻込みで比較すると
  // 「その日の0:00」を過ぎた時点で週末扱いになってしまうため）。
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekStart = new Date(currentWeekStart);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = addDays(weekStart, 6);
  weekEnd.setHours(0, 0, 0, 0);
  if (today < weekStart || today > weekEnd) return;

  const section = document.querySelector("#view-timetable .day-section.today");
  if (!section) return;

  const adjust = () => {
    const header = document.querySelector(".app-header");
    const headerOffset = header ? header.getBoundingClientRect().height + 12 : 12;
    const desiredTop = section.getBoundingClientRect().top + window.scrollY - headerOffset;
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetTop = Math.min(Math.max(0, desiredTop), maxScroll);
    window.scrollTo({ top: targetTop, behavior: "auto" });
  };

  // 描画直後とレイアウト確定後の2回調整して、スマホSafariでも位置を安定させる。
  requestAnimationFrame(() => {
    adjust();
    requestAnimationFrame(adjust);
  });
}

function renderWeek() {
  const container = document.getElementById("view-timetable");
  if (timetableDisplayMode === "subject") {
    renderSubjectList(container);
    return;
  }

  const today = new Date();
  const end = addDays(currentWeekStart, 6);
  document.getElementById("week-range").textContent = `${currentWeekStart.getFullYear()}年${currentWeekStart.getMonth()+1}月${currentWeekStart.getDate()}日〜${end.getMonth()+1}月${end.getDate()}日`;
  document.getElementById("timetable-mode-toggle").textContent = "教科別";
  container.innerHTML = "";

  for (let i=0;i<7;i++) {
    const date = addDays(currentWeekStart,i);
    const resolved = getResolvedSchedule(date);
    const section = document.createElement("section");
    const isToday = isSameDate(date,today);
    section.className = `day-section day-section-editable${isToday ? " today" : ""}`;
    section.title = "タップしてこの日の設定を変更";
    section.addEventListener("click", () => openDayDetailModal(date));

    const header = document.createElement("div");
    header.className = `day-header${isSameDate(date,today) ? " today" : ""}`;
    header.style.background = getDayHeaderColor(date);
    if (isHoliday(date)) header.classList.add("holiday");
    header.innerHTML = `<span class="day-name">${WEEKDAYS[date.getDay()]}</span><span class="day-date">${date.getMonth()+1}/${date.getDate()}</span>${resolved.type === "exam" ? `<span class="day-status-badge exam">考査</span>` : ""}<span class="day-meta">${resolved.type === "exam" ? "" : escapeHTML(resolved.label)}</span>`;
    section.appendChild(header);

    const list = document.createElement("div");
    list.className = "lesson-list";
    let hasLesson = false;

    if (resolved.eventName) {
      const ev = document.createElement("div");
      ev.className = "event-card";
      ev.textContent = resolved.eventName;
      list.appendChild(ev);
    }

    for (let p=1;p<=PERIODS;p++) {
      const lesson = resolved.periods[p];
      if (lesson) hasLesson = true;
      if (resolved.eventName && !lesson) continue;
      const card = document.createElement("button");
      card.className = `lesson-card${lesson ? "" : " empty"}`;
      if (lesson) card.style.background = subjectColor(lesson.subject);
      const overridden = Boolean(appData.overrides?.[toDateKey(date)]?.periods?.[String(p)]);
      card.innerHTML = lesson
        ? `<div class="period">${p}時間目</div>${overridden ? `<div class="lesson-status">変更済み</div>` : ""}<div class="lesson-title">${escapeHTML(resolveSubject(lesson.subject) || "（教科未設定）")}</div>`
        : `<div class="period">${p}時間目</div><div class="lesson-title">—</div>`;
      card.addEventListener("click", (event) => {
        event.stopPropagation();
        openLessonModal(date,p,lesson,resolved.label);
      });
      list.appendChild(card);
    }
    if (!hasLesson) list.setAttribute("aria-label", resolved.type === null ? "年間予定未入力" : "授業データがありません");
    section.appendChild(list);
    container.appendChild(section);
  }
}

function getSubjectListCandidates() {
  const set = new Set();
  const addLesson = lesson => {
    if (lesson && typeof lesson.subject === "string" && lesson.subject.trim()) set.add(lesson.subject.trim());
  };
  for (const term of ["firstTerm","secondTerm"]) {
    for (const type of ["A","B","C"]) {
      for (const day of WEEKDAY_KEYS) {
        const table = appData.schedules?.[term]?.[type]?.[day] || {};
        for (const lesson of Object.values(table)) addLesson(lesson);
      }
    }
  }
  for (const entry of appData.calendar || []) {
    if (entry.type !== "pattern" || !Array.isArray(entry.patternItems)) continue;
    for (const item of entry.patternItems) {
      if (item?.source !== "regular") continue;
      addLesson(getRegularLesson(fromDateKey(entry.date), item.type, Number(item.sourcePeriod), item.weekday));
    }
  }
  for (const override of Object.values(appData.overrides || {})) {
    for (const lesson of Object.values(override?.periods || {})) addLesson(lesson);
  }
  return [...set].sort((a,b)=>String(resolveSubject(a)).localeCompare(String(resolveSubject(b)),"ja"));
}

function isSubjectOccurrenceEligible(date, period, resolved) {
  const dateKey = toDateKey(date);
  const lesson = resolved.periods[period];
  if (!lesson || !lesson.subject) return false;
  if (resolved.type === "exam" || resolved.type === "special") return false;

  // その限に対する override は、元の種類に関係なく通常の授業として対象にする。
  if (appData.overrides?.[dateKey]?.periods?.[String(period)]) return true;

  if (["A","B","C"].includes(resolved.type)) return true;
  if (resolved.type !== "pattern") return false;

  const entry = getCalendarEntry(dateKey);
  const item = Array.isArray(entry?.patternItems) ? entry.patternItems.find(x=>Number(x?.period)===period) : null;
  return item?.source === "regular";
}

function collectSubjectOccurrences(subject) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const futureKeys = [];
  const allDates = new Set();
  for (const entry of appData.calendar || []) if (isValidDateKey(entry.date)) allDates.add(entry.date);
  for (const date of Object.keys(appData.overrides || {})) if (isValidDateKey(date)) allDates.add(date);
  const sortedDates = [...allDates].sort();
  const targetSubject = String(subject || "").trim();
  for (const key of sortedDates) {
    const date = fromDateKey(key);
    if (date < today) continue;
    const entry = getCalendarEntry(key);
    if (entry?.type === "exam" || entry?.type === "special") continue;
    const resolved = getResolvedSchedule(date);
    const periods = [];
    for (let p=1;p<=PERIODS;p++) {
      const lesson = resolved.periods[p];
      if (!isSubjectOccurrenceEligible(date,p,resolved)) continue;
      if (String(lesson.subject).trim() !== targetSubject) continue;
      periods.push(p);
    }
    if (periods.length) futureKeys.push({dateKey:key,date,periods});
  }
  return futureKeys;
}

function renderSubjectList(container) {
  const candidates = getSubjectListCandidates();
  if (!selectedSubjectForList || !candidates.includes(selectedSubjectForList)) selectedSubjectForList = candidates[0] || "";
  document.getElementById("week-range").textContent = "教科別の授業一覧";
  document.getElementById("timetable-mode-toggle").textContent = "日付別";
  document.getElementById("prev-week").hidden = true;
  document.getElementById("today-button").hidden = true;
  document.getElementById("next-week").hidden = true;
  container.innerHTML = "";

  const panel = document.createElement("div");
  panel.className = "subject-list-panel";

  const selectorCard = document.createElement("div");
  selectorCard.className = "card subject-selector-card";
  selectorCard.innerHTML = `<div class="form-field"><label for="subject-list-select">教科</label><select id="subject-list-select"><option value="">${candidates.length ? "選択してください" : "教科がありません"}</option>${candidates.map(subject=>`<option value="${escapeHTML(subject)}" ${subject===selectedSubjectForList?"selected":""}>${escapeHTML(resolveSubject(subject))}</option>`).join("")}</select></div><p class="muted">今日から先の授業を近い日付順に表示します。考査・行事・変則時間割のカスタム授業は含みません。</p>`;
  panel.appendChild(selectorCard);

  const listCard = document.createElement("div");
  listCard.className = "card subject-occurrence-card";
  const selectedLabel = resolveSubject(selectedSubjectForList) || selectedSubjectForList;
  listCard.innerHTML = `<h3>${escapeHTML(selectedLabel || "教科を選択してください")}</h3>`;
  const occurrences = selectedSubjectForList ? collectSubjectOccurrences(selectedSubjectForList) : [];
  if (!occurrences.length) {
    listCard.insertAdjacentHTML("beforeend", `<div class="muted subject-empty-message">今後の授業予定はありません。</div>`);
  } else {
    const rows = document.createElement("div");
    rows.className = "subject-occurrence-list";
    rows.innerHTML = occurrences.map(item=>{
      const date = item.date;
      const dayLabel = WEEKDAYS[date.getDay()];
      const periodLabel = item.periods.map(p=>`${p}限`).join("・");
      const overridden = item.periods.some(p=>Boolean(appData.overrides?.[item.dateKey]?.periods?.[String(p)]));
      const matchingTodos = getTodosForDate(item.dateKey, selectedSubjectForList);
      const todoText = matchingTodos.length
        ? `<div class="subject-occurrence-todos" aria-label="この日のToDo">${matchingTodos.map(todo => `<div>${escapeHTML(todo.content)}</div>`).join("")}</div>`
        : "";
      return `<div class="subject-occurrence-row"><div class="subject-occurrence-main"><span class="subject-occurrence-date">${date.getMonth()+1}/${date.getDate()}（${dayLabel}）</span><span class="subject-occurrence-period">${periodLabel}</span>${overridden ? `<span class="subject-occurrence-status">変更済み</span>` : ""}</div>${todoText}</div>`;
    }).join("");
    listCard.appendChild(rows);
  }
  panel.appendChild(listCard);
  container.appendChild(panel);

  const select=document.getElementById("subject-list-select");
  select.addEventListener("change",()=>{
    selectedSubjectForList=select.value;
    renderWeek();
  });
}

function openDayDetailModal(date) {
  const overlay = document.getElementById("lesson-modal");
  const content = document.getElementById("modal-content");
  const dateKey = toDateKey(date);
  const existing = getCalendarEntry(dateKey);

  content.innerHTML = `
    <h2 id="modal-title" class="edit-primary-title">${escapeHTML(formatDateJP(date))}</h2>
    ${buildTodoModalSection(dateKey)}
    <div class="edit-change-section">
      <div class="edit-change-label">変更</div>
      <div class="day-detail-form">
      <div class="form-field">
        <label for="day-detail-type">種類を変更</label>
        <select id="day-detail-type">
          <option value="">未入力</option>
          <option value="A">A</option>
          <option value="B">B</option>
          <option value="C">C</option>
          <option value="pattern">変則</option>
          <option value="special">行事</option>
          <option value="exam">考査</option>
        </select>
      </div>
      <div id="day-detail-pattern-wrap" class="form-field full" hidden>
        <label>変則時間割を変更</label>
        <div id="day-detail-pattern-editor" class="pattern-editor"></div>
        <div class="pattern-help">各行は「その日の1〜8限」です。通常時間割から参照するか、カスタムで直接授業を入力できます。</div>
      </div>
      <div id="day-detail-special-wrap" class="form-field full" hidden>
        <label for="day-detail-special">行事名を変更</label>
        <input id="day-detail-special" type="text" placeholder="例: 文化祭、体育祭">
      </div>
        <p id="day-detail-exam-help" class="muted" hidden>考査の各限の教科は「考査」から入力・変更します。この画面では、この日を考査日にするかどうかだけ変更できます。</p>
      </div>
    </div>
    <div class="button-row">
      <button id="save-day-detail" class="primary-button">この日の設定を保存</button>
      <button id="delete-day-detail" class="danger-button">年間予定設定を削除</button>
    </div>`;

  const typeInput = document.getElementById("day-detail-type");
  const patternWrap = document.getElementById("day-detail-pattern-wrap");
  const specialWrap = document.getElementById("day-detail-special-wrap");
  const examHelp = document.getElementById("day-detail-exam-help");
  const specialInput = document.getElementById("day-detail-special");
  typeInput.value = existing?.type || "";
  specialInput.value = existing?.eventName || "";

  function defaultPatternItems() {
    return Array.from({length: PERIODS}, (_, i) => ({
      period: i + 1, source: "", weekday: "", type: "", sourcePeriod: ""
    }));
  }

  function existingPatternItems() {
    if (Array.isArray(existing?.patternItems) && existing.patternItems.length) return existing.patternItems;
    return null;
  }

  function drawPatternEditor(items) {
    const editor = document.getElementById("day-detail-pattern-editor");
    const current = Array.isArray(items) ? items : [];
    editor.innerHTML = Array.from({length: PERIODS}, (_, i) => {
      const p = i + 1;
      const raw = current.find(x => Number(x?.period) === p);
      const item = raw || defaultPatternItems()[i];
      const custom = item.source === "custom";
      const lesson = item.lesson || {};
      return `<div class="pattern-row" data-pattern-row="${p}">
        <div class="pattern-target">${p}限</div>
        <select data-pattern-source title="入力方法"><option value="" ${!item.source ? "selected" : ""}>選択</option><option value="regular" ${item.source === "regular" ? "selected" : ""}>通常</option><option value="custom" ${custom ? "selected" : ""}>カスタム</option></select>
        <select data-pattern-weekday title="曜日">${WEEKDAY_KEYS.map(d => `<option value="${d}" ${d === item.weekday ? "selected" : ""}>${d}</option>`).join("")}</select>
        <select data-pattern-type title="パターン">${["A","B","C"].map(t => `<option value="${t}" ${t === item.type ? "selected" : ""}>${t}</option>`).join("")}</select>
        <select data-pattern-source-period title="参照元の限目">${Array.from({length: PERIODS}, (_, j) => `<option value="${j + 1}" ${j + 1 === Number(item.sourcePeriod || p) ? "selected" : ""}>${j + 1}</option>`).join("")}</select>
        <div class="pattern-custom-fields" ${custom ? "" : "hidden"}>
          <input data-pattern-custom-field="subject" type="text" value="${escapeHTML(lesson.subject || "")}" placeholder="教科">
        </div>
      </div>`;
    }).join("");

    const refreshRow = row => {
      const source = row.querySelector("[data-pattern-source]").value;
      const custom = source === "custom";
      const disabled = source !== "regular";
      row.querySelectorAll("[data-pattern-weekday], [data-pattern-type], [data-pattern-source-period]").forEach(x => x.disabled = disabled);
      row.querySelector(".pattern-custom-fields").hidden = !custom;
    };
    editor.querySelectorAll(".pattern-row").forEach(row => {
      refreshRow(row);
      row.querySelector("[data-pattern-source]").addEventListener("change", () => refreshRow(row));
    });
  }

  function updateDayDetailVisibility() {
    const type = typeInput.value;
    patternWrap.hidden = type !== "pattern";
    specialWrap.hidden = type !== "special";
    examHelp.hidden = type !== "exam";
    if (type === "pattern") drawPatternEditor(existingPatternItems());
  }

  typeInput.addEventListener("change", updateDayDetailVisibility);
  updateDayDetailVisibility();
  bindTodoModalSection(dateKey);

  document.getElementById("save-day-detail").addEventListener("click", () => {
    const type = typeInput.value;
    if (!type) {
      appData.calendar = appData.calendar.filter(x => x.date !== dateKey);
      saveData();
      closeModal();
      renderWeek();
      return;
    }

    const entry = { date: dateKey, type };
    if (type === "pattern") {
      const items = [];
      document.querySelectorAll("#day-detail-pattern-editor .pattern-row").forEach(row => {
        const period = Number(row.dataset.patternRow);
        const source = row.querySelector("[data-pattern-source]").value;
        if (source === "custom") {
          const subject = row.querySelector('[data-pattern-custom-field="subject"]').value.trim();
          if (subject) items.push({period, source:"custom", lesson:{subject}});
        } else if (source === "regular") {
          const weekday = row.querySelector("[data-pattern-weekday]").value;
          const typeValue = row.querySelector("[data-pattern-type]").value;
          const sourcePeriod = Number(row.querySelector("[data-pattern-source-period]").value);
          if (WEEKDAY_KEYS.includes(weekday) && ["A","B","C"].includes(typeValue) && Number.isInteger(sourcePeriod) && sourcePeriod >= 1 && sourcePeriod <= PERIODS) {
            items.push({ period, source:"regular", weekday, type:typeValue, sourcePeriod });
          }
        }
      });
      if (!items.length) return alert("変則時間割を少なくとも1限指定してください。");
      entry.patternItems = items;
    }
    if (type === "special") {
      const name = specialInput.value.trim();
      if (!name) return alert("行事名を入力してください。");
      entry.eventName = name;
    }
    const normalized = normalizeCalendarEntry(entry);
    if (!normalized) return alert("入力内容を確認してください。");
    const index = appData.calendar.findIndex(x => x.date === dateKey);
    if (index >= 0) appData.calendar[index] = normalized;
    else appData.calendar.push(normalized);
    saveData();
    closeModal();
    renderWeek();
  });

  document.getElementById("delete-day-detail").addEventListener("click", () => {
    if (!getCalendarEntry(dateKey)) return alert("この日に年間予定の設定はありません。");
    if (!confirm(`${dateKey} の年間予定設定を削除しますか？`)) return;
    appData.calendar = appData.calendar.filter(x => x.date !== dateKey);
    saveData();
    closeModal();
    renderWeek();
  });

  overlay.classList.remove("hidden");
}

function openLessonModal(date, period, lesson, label) {
  const overlay = document.getElementById("lesson-modal");
  const content = document.getElementById("modal-content");
  const dateKey = toDateKey(date);
  const periodKey = String(period);
  const entry = getCalendarEntry(dateKey);
  const isExamDay = entry?.type === "exam";

  if (isExamDay) {
    const exam = appData.examData?.[dateKey] || {};
    const currentExamLesson = exam[periodKey] || null;
    const subject = currentExamLesson?.subject || lesson?.subject || "";
    const title = resolveSubject(subject) || "（教科未設定）";

    content.innerHTML = `
      <div class="modal-context">${escapeHTML(formatDateJP(date))}・${period}時間目</div>
      <h2 id="modal-title" class="edit-primary-title">${escapeHTML(title)}</h2>
      ${buildTodoModalSection(dateKey, subject || null)}
      <div class="edit-change-section">
        <div class="edit-change-label">変更</div>
        <div class="lesson-edit-form">
          <div class="form-field">
            <label for="lesson-edit-subject">考査の教科を変更</label>
            <input id="lesson-edit-subject" type="text" value="${escapeHTML(subject)}" placeholder="教科">
          </div>
        </div>
      </div>
      <p class="muted">この変更は、この日の考査時間割（<code>examData</code>）に直接保存されます。</p>
      <div class="button-row">
        <button id="save-lesson-edit" class="primary-button">考査を保存</button>
        ${currentExamLesson ? `<button id="reset-lesson-edit" class="secondary-button">この限の考査を削除</button>` : ""}
      </div>`;

    bindTodoModalSection(dateKey, subject || null);

    document.getElementById("save-lesson-edit").addEventListener("click", () => {
      const newSubject = document.getElementById("lesson-edit-subject").value.trim();
      const currentExam = isPlainObject(appData.examData?.[dateKey]) ? { ...appData.examData[dateKey] } : {};

      if (newSubject) currentExam[periodKey] = { subject: newSubject };
      else delete currentExam[periodKey];

      if (Object.keys(currentExam).length) appData.examData[dateKey] = normalizePeriodTable(currentExam);
      else delete appData.examData[dateKey];

      const idx = appData.calendar.findIndex(x => x.date === dateKey);
      const examEntry = { date: dateKey, type: "exam" };
      if (idx >= 0) appData.calendar[idx] = examEntry;
      else appData.calendar.push(examEntry);

      saveData();
      closeModal();
      renderWeek();
    });

    if (currentExamLesson) {
      document.getElementById("reset-lesson-edit").addEventListener("click", () => {
        const currentExam = isPlainObject(appData.examData?.[dateKey]) ? { ...appData.examData[dateKey] } : {};
        delete currentExam[periodKey];
        if (Object.keys(currentExam).length) appData.examData[dateKey] = normalizePeriodTable(currentExam);
        else delete appData.examData[dateKey];
        saveData();
        closeModal();
        renderWeek();
      });
    }

    overlay.classList.remove("hidden");
    return;
  }

  const isOverridden = Boolean(appData.overrides?.[dateKey]?.periods?.[periodKey]);
  const displayedLesson = lesson || {};
  const title = resolveSubject(displayedLesson.subject) || "（教科未設定）";

  content.innerHTML = `
    <div class="modal-context">${escapeHTML(formatDateJP(date))}・${period}時間目</div>
    <h2 id="modal-title" class="edit-primary-title">${escapeHTML(title)}</h2>
    ${buildTodoModalSection(dateKey, displayedLesson.subject || null)}
    <div class="edit-change-section">
      <div class="edit-change-label">変更</div>
      <div class="lesson-edit-form">
        <div class="form-field">
          <label for="lesson-edit-subject">この限の教科を変更</label>
          <input id="lesson-edit-subject" type="text" value="${escapeHTML(displayedLesson.subject || "")}" placeholder="教科">
        </div>
      </div>
    </div>
    ${isOverridden ? `<div class="override-notice">この授業は変更済みです。</div>` : ""}
    <p class="muted">この変更は、この日・この限だけの時間割変更として <code>overrides</code> に保存されます。</p>
    <div class="button-row">
      <button id="save-lesson-edit" class="primary-button">この授業の変更を保存</button>
      ${isOverridden ? `<button id="reset-lesson-edit" class="secondary-button">変更を削除して元に戻す</button>` : ""}
    </div>`;

  bindTodoModalSection(dateKey, displayedLesson.subject || null);

  document.getElementById("save-lesson-edit").addEventListener("click", () => {
    const subject = document.getElementById("lesson-edit-subject").value;
    const editedLesson = makeLesson(subject);

    const obj = normalizeOverride(appData.overrides[dateKey] || {});
    if (editedLesson) {
      obj.periods[periodKey] = editedLesson;
      appData.overrides[dateKey] = obj;
    } else {
      delete obj.periods[periodKey];
      if (Object.keys(obj.periods).length) appData.overrides[dateKey] = obj;
      else delete appData.overrides[dateKey];
    }

    saveData();
    closeModal();
    renderWeek();
  });

  if (isOverridden) {
    document.getElementById("reset-lesson-edit").addEventListener("click", () => {
      const obj = normalizeOverride(appData.overrides[dateKey] || {});
      delete obj.periods[periodKey];
      if (Object.keys(obj.periods).length) appData.overrides[dateKey] = obj;
      else delete appData.overrides[dateKey];
      saveData();
      closeModal();
      renderWeek();
    });
  }

  overlay.classList.remove("hidden");
}

function closeModal() { document.getElementById("lesson-modal").classList.add("hidden"); }

function lessonFieldsHTML(lesson=null) {
  return `<input data-field="subject" type="text" value="${escapeHTML(lesson?.subject || "")}" placeholder="教科">`;
}

function renderManualPanels() {
  renderCalendarPanel();
  renderSchedulePanel();
  renderExamPanel();
  renderOverridePanel();
}

function renderCalendarPanel() {
  const el = document.getElementById("manual-calendar");
  el.innerHTML = `<div class="card">
    <h3>年間予定を設定</h3>
    <p class="muted">年間予定を入力してください。これをもとに時間割が表示されます。</p>
    <div class="form-grid">
      <div class="form-field"><label>日付</label><input id="calendar-date" type="date"></div>
      <div class="form-field"><label>種類</label><select id="calendar-type">
        <option value="A">A</option><option value="B">B</option><option value="C">C</option>
        <option value="pattern">変則</option><option value="special">行事</option><option value="exam">考査</option>
      </select></div>
      <div class="form-field full" id="calendar-pattern-wrap" style="display:none">
        <label>変則時間割</label>
        <div id="calendar-pattern-editor" class="pattern-editor"></div>
        <div class="pattern-help">各行は「その日の1〜8限」を表します。通常時間割から曜日・A/B/C・参照元の限目を選ぶか、カスタムで直接授業を入力できます。</div>
      </div>
      <div class="form-field full" id="calendar-special-wrap" style="display:none"><label>行事名・予定内容</label><input id="calendar-special" type="text" placeholder="例: 文化祭、体育祭"></div>
    </div>
    <div class="button-row"><button id="save-calendar-entry" class="primary-button">保存</button><button id="remove-calendar-entry" class="danger-button">この日の年間予定設定を削除</button></div>
  </div>
  <details class="card registered-details"><summary>登録済み日付</summary><div id="calendar-entry-list" class="settings-list compact-settings-list"></div></details>`;

  const dateInput = document.getElementById("calendar-date");
  const typeInput = document.getElementById("calendar-type");
  const patternWrap = document.getElementById("calendar-pattern-wrap");
  const specialWrap = document.getElementById("calendar-special-wrap");
  dateInput.value = toDateKey(new Date());

  function getDefaultPatternItems(){
    return Array.from({length:PERIODS},(_,i)=>({period:i+1,source:"",weekday:"",type:"",sourcePeriod:""}));
  }

  function getPatternItemsForEditor(existing){
    if (Array.isArray(existing?.patternItems) && existing.patternItems.length) return existing.patternItems;
    return null;
  }

  function renderPatternEditor(items){
    const editor=document.getElementById("calendar-pattern-editor");
    const current=Array.isArray(items)?items:[];
    editor.innerHTML=Array.from({length:PERIODS},(_,i)=>{
      const p=i+1;
      const raw=current.find(x=>Number(x?.period)===p);
      const item=raw||getDefaultPatternItems()[i];
      const custom=item.source==="custom";
      const lesson=item.lesson||{};
      return `<div class="pattern-row" data-pattern-row="${p}">
        <div class="pattern-target">${p}限</div>
        <select data-pattern-source title="入力方法"><option value="" ${!item.source?"selected":""}>選択</option><option value="regular" ${item.source==="regular"?"selected":""}>通常</option><option value="custom" ${custom?"selected":""}>カスタム</option></select>
        <select data-pattern-weekday title="曜日">${WEEKDAY_KEYS.map(d=>`<option value="${d}" ${d===item.weekday?"selected":""}>${d}</option>`).join("")}</select>
        <select data-pattern-type title="パターン">${["A","B","C"].map(t=>`<option value="${t}" ${t===item.type?"selected":""}>${t}</option>`).join("")}</select>
        <select data-pattern-source-period title="参照元の限目">${Array.from({length:PERIODS},(_,j)=>`<option value="${j+1}" ${j+1===Number(item.sourcePeriod||p)?"selected":""}>${j+1}</option>`).join("")}</select>
        <div class="pattern-custom-fields" ${custom?"":"hidden"}>
          <input data-pattern-custom-field="subject" type="text" value="${escapeHTML(lesson.subject||"")}" placeholder="教科">
        </div>
      </div>`;
    }).join("");

    const refreshRow=(row)=>{
      const source=row.querySelector("[data-pattern-source]").value;
      const custom=source==="custom";
      const disabled=source!=="regular";
      row.querySelectorAll("[data-pattern-weekday], [data-pattern-type], [data-pattern-source-period]").forEach(x=>x.disabled=disabled);
      row.querySelector(".pattern-custom-fields").hidden=!custom;
    };
    editor.querySelectorAll(".pattern-row").forEach(row=>{
      refreshRow(row);
      row.querySelector("[data-pattern-source]").addEventListener("change",()=>refreshRow(row));
    });
  }

  function loadSelectedDate(){
    const existing=getCalendarEntry(dateInput.value);
    typeInput.value=existing?.type||"A";
    document.getElementById("calendar-special").value=existing?.eventName||"";
    renderPatternEditor(getPatternItemsForEditor(existing));
    updateVisibility();
  }

  function updateVisibility(){
    patternWrap.style.display=typeInput.value==="pattern"?"block":"none";
    specialWrap.style.display=typeInput.value==="special"?"block":"none";
  }

  dateInput.addEventListener("change",loadSelectedDate);
  typeInput.addEventListener("change",updateVisibility);
  loadSelectedDate();

  document.getElementById("save-calendar-entry").addEventListener("click",()=>{
    const date=dateInput.value, type=typeInput.value;
    if(!isValidDateKey(date)) return alert("日付を入力してください。");
    const entry={date,type};
    if(type==="pattern") {
      const items=[];
      document.querySelectorAll("#calendar-pattern-editor .pattern-row").forEach(row=>{
        const period=Number(row.dataset.patternRow);
        const source=row.querySelector("[data-pattern-source]").value;
        if(source==="custom") {
          const subject=row.querySelector('[data-pattern-custom-field="subject"]').value.trim();
          if(subject) items.push({period,source:"custom",lesson:{subject}});
        } else if (source === "regular") {
          const weekday=row.querySelector("[data-pattern-weekday]").value;
          const typeValue=row.querySelector("[data-pattern-type]").value;
          const sourcePeriod=Number(row.querySelector("[data-pattern-source-period]").value);
          if(WEEKDAY_KEYS.includes(weekday) && ["A","B","C"].includes(typeValue) && Number.isInteger(sourcePeriod) && sourcePeriod>=1 && sourcePeriod<=PERIODS){
            items.push({period,source:"regular",weekday,type:typeValue,sourcePeriod});
          }
        }
      });
      if(!items.length)return alert("変則時間割を少なくとも1限指定してください。");
      entry.patternItems=items;
    }
    if(type==="special") {
      const name=document.getElementById("calendar-special").value.trim();
      if(!name)return alert("行事名を入力してください。");
      entry.eventName=name;
    }
    const normalized=normalizeCalendarEntry(entry); if(!normalized)return alert("入力内容を確認してください。");
    const idx=appData.calendar.findIndex(x=>x.date===date);
    if(idx>=0)appData.calendar[idx]=normalized; else appData.calendar.push(normalized);
    saveData(); renderCalendarPanel();
  });

  document.getElementById("remove-calendar-entry").addEventListener("click",()=>{
    const date=dateInput.value;
    if(!isValidDateKey(date))return;
    if(!getCalendarEntry(date))return alert("この日に登録はありません。");
    if(!confirm(`${date} の年間予定設定を削除しますか？`))return;
    appData.calendar=appData.calendar.filter(x=>x.date!==date);
    saveData(); renderCalendarPanel();
  });

  renderCalendarEntryList();
}

function renderCalendarEntryList() {
  const el=document.getElementById("calendar-entry-list"); if(!el)return;
  const items=[...appData.calendar].sort((a,b)=>a.date.localeCompare(b.date));
  if(!items.length){el.innerHTML=`<div class="muted">まだ登録されていません。未入力の日はここに出ません。</div>`;return;}
  el.innerHTML=items.map((item,index)=>{
    let label=item.type;
    if(item.type==="special") label=`行事: ${item.eventName||""}`;
    else if(item.type==="pattern") {
      const parts=Array.isArray(item.patternItems)
        ? item.patternItems.map(x=>x.source==="custom"?`${x.period}限:カスタム`:`${x.period}限:${x.weekday||""}${x.type||""}${x.sourcePeriod||x.period}`).join(" / ")
        : "";
      label=parts||"変則";
    } else if(item.type==="exam") label="考査";
    return `<div class="item-row"><div><strong>${escapeHTML(item.date)}</strong><div class="muted">${escapeHTML(label)}</div></div><button class="remove-button" data-remove-calendar="${index}">削除</button></div>`;
  }).join("");
  el.querySelectorAll("[data-remove-calendar]").forEach(btn=>btn.addEventListener("click",()=>{const date=items[Number(btn.dataset.removeCalendar)].date;appData.calendar=appData.calendar.filter(x=>x.date!==date);saveData();renderCalendarPanel();}));
}

function renderSchedulePanel() {
  const el=document.getElementById("manual-schedule");
  el.innerHTML=`<div class="card"><h3>通常時間割の設定</h3><p class="muted">クラスごとのごとの時間割表を設定してください。</p><div class="form-grid"><div class="form-field"><label>学期</label><select id="schedule-term"><option value="firstTerm">前期</option><option value="secondTerm">後期</option></select></div><div class="form-field"><label>パターン</label><select id="schedule-type"><option value="A">A</option><option value="B">B</option><option value="C">C</option></select></div><div class="form-field full"><label>曜日</label><div id="schedule-weekday-tabs" class="sub-segmented weekday-tabs"></div></div></div><div class="period-head"></div><div id="schedule-periods"></div><div class="button-row"><button id="save-normal-schedule" class="primary-button">この曜日の時間割を保存</button></div></div>`;
  const term=document.getElementById("schedule-term"), type=document.getElementById("schedule-type"), periods=document.getElementById("schedule-periods"), tabs=document.getElementById("schedule-weekday-tabs");
  let activeWeekday="月";
  tabs.innerHTML=WEEKDAY_KEYS.map(day=>`<button type="button" class="sub-tab${day===activeWeekday?" active":""}" data-schedule-weekday="${day}">${day}</button>`).join("");
  tabs.querySelectorAll("[data-schedule-weekday]").forEach(btn=>btn.addEventListener("click",()=>{activeWeekday=btn.dataset.scheduleWeekday;tabs.querySelectorAll("[data-schedule-weekday]").forEach(x=>x.classList.toggle("active",x.dataset.scheduleWeekday===activeWeekday));draw();}));
  function draw(){const data=appData.schedules?.[term.value]?.[type.value]?.[activeWeekday]||{};periods.innerHTML=Array.from({length:PERIODS},(_,i)=>{const p=i+1;const lesson=data[String(p)]||null;return `<div class="period-editor"><div class="period-number">${p}</div>${lessonFieldsHTML(lesson)}</div>`;}).join("");}
  term.addEventListener("change",draw); type.addEventListener("change",draw); draw();
  document.getElementById("save-normal-schedule").addEventListener("click",()=>{const obj={};periods.querySelectorAll(".period-editor").forEach((row,index)=>{const input=row.querySelector('input[data-field="subject"]');const lesson=makeLesson(input.value);if(lesson)obj[String(index+1)]=lesson;});appData.schedules[term.value][type.value][activeWeekday]=obj;saveData();alert(`${activeWeekday}曜日の${type.value}時間割を保存しました。`);});
}

function renderExamPanel() {
  const el=document.getElementById("manual-exam");
  el.innerHTML=`<div class="card"><h3>考査時間割の設定</h3><p class="muted">日付を指定し、その日の考査時間割の設定してください。</p><div class="form-field"><label>日付</label><input id="exam-date" type="date"></div><div class="period-head"><span></span></div><div id="exam-periods"></div><div class="button-row"><button id="save-exam" class="primary-button">考査を保存</button><button id="delete-exam" class="danger-button">この日の考査を削除</button></div></div><details class="card registered-details"><summary>登録済み考査</summary><div id="exam-list" class="settings-list compact-settings-list"></div></details>`;
  const date=document.getElementById("exam-date"),periods=document.getElementById("exam-periods"); date.value=toDateKey(new Date());
  function draw(){const exam=appData.examData[date.value]||{};periods.innerHTML=Array.from({length:PERIODS},(_,i)=>{const p=i+1;const lesson=exam[String(p)]||null;return `<div class="period-editor exam-period-editor"><div class="period-number">${p}</div>${lessonFieldsHTML(lesson)}</div>`;}).join("");}
  date.addEventListener("change",draw); draw();
  document.getElementById("save-exam").addEventListener("click",()=>{if(!isValidDateKey(date.value))return alert("日付を入力してください。");const exam={};periods.querySelectorAll(".period-editor").forEach((row,index)=>{const input=row.querySelector("input[data-field=subject]");const subject=input.value.trim();if(subject)exam[String(index+1)]={subject};});if(!Object.keys(exam).length)return alert("少なくとも1限は教科を入力してください。");appData.examData[date.value]=exam;const idx=appData.calendar.findIndex(x=>x.date===date.value);const entry={date:date.value,type:"exam"};if(idx>=0)appData.calendar[idx]=entry;else appData.calendar.push(entry);saveData();renderExamPanel();renderCalendarPanel();alert("考査を保存しました。");});
  document.getElementById("delete-exam").addEventListener("click",()=>{if(!appData.examData[date.value])return alert("この日に考査データはありません。");if(!confirm(`${date.value} の考査を削除しますか？`))return;delete appData.examData[date.value];appData.calendar=appData.calendar.filter(x=>x.date!==date.value || x.type!=="exam");saveData();renderExamPanel();renderCalendarPanel();});
  renderExamList();
}
function renderExamList(){const el=document.getElementById("exam-list");if(!el)return;const entries=Object.entries(appData.examData).sort(([a],[b])=>a.localeCompare(b));if(!entries.length){el.innerHTML=`<div class="muted">まだ登録されていません。</div>`;return;}el.innerHTML=entries.map(([date,exam])=>{const subjects=Object.entries(exam).map(([p,l])=>`${p}限:${escapeHTML(resolveSubject(l.subject)||l.subject||"—")}`).join(" / ");return `<div class="item-row"><div><strong>${escapeHTML(date)}</strong><div class="muted">${subjects}</div></div><button class="remove-button" data-remove-exam="${escapeHTML(date)}">削除</button></div>`;}).join("");el.querySelectorAll("[data-remove-exam]").forEach(btn=>btn.addEventListener("click",()=>{const date=btn.dataset.removeExam;if(!confirm(`${date} の考査を削除しますか？`))return;delete appData.examData[date];appData.calendar=appData.calendar.filter(x=>x.date!==date || x.type!=="exam");saveData();renderExamPanel();renderCalendarPanel();}));}

function renderOverridePanel() {
  const el=document.getElementById("manual-override");
  el.innerHTML=`<div class="card"><h3>時間割変更を入力</h3><p class="muted">設定した時間のみが上書きされて表示されます。</p><div class="form-field"><label>日付</label><input id="override-date" type="date"></div><h4>変更する授業</h4><div class="form-grid"><div class="form-field"><label>時間</label><select id="override-period">${Array.from({length:PERIODS},(_,i)=>`<option value="${i+1}">${i+1}時間目</option>`).join("")}</select></div><div class="form-field full"><label>教科</label><input id="override-subject" type="text" placeholder="教科"></div></div><div class="button-row"><button id="save-override" class="primary-button">変更を保存</button><button id="clear-override" class="danger-button">この日の変更を削除</button></div></div><details class="card registered-details"><summary>登録済み変更</summary><div id="override-list" class="settings-list compact-settings-list"></div></details>`;
  const date=document.getElementById("override-date"), period=document.getElementById("override-period");
  date.value=toDateKey(new Date());
  function loadExisting(){
    const o=appData.overrides[date.value];
    loadOverrideLessonInputs(o?.periods?.[period.value]);
  }
  date.addEventListener("change",loadExisting);
  period.addEventListener("change",()=>loadOverrideLessonInputs(appData.overrides[date.value]?.periods?.[period.value]));
  loadExisting();
  document.getElementById("save-override").addEventListener("click",()=>{
    const key=date.value;
    if(!isValidDateKey(key))return alert("日付を入力してください。");
    if(getCalendarEntry(key)?.type === "exam") return alert("考査日は『考査』から変更してください。考査の変更は examData に保存されます。");
    const obj=normalizeOverride(appData.overrides[key]||{});
    const p=period.value;
    const lesson=makeLesson(document.getElementById("override-subject").value);
    if(lesson)obj.periods[p]=lesson; else delete obj.periods[p];
    if(!Object.keys(obj.periods).length) delete appData.overrides[key]; else appData.overrides[key]=obj;
    saveData();
    renderOverridePanel();
    alert("変更を保存しました。");
  });
  document.getElementById("clear-override").addEventListener("click",()=>{
    const key=date.value;
    if(!appData.overrides[key])return alert("この日に変更はありません。");
    if(!confirm(`${key} の変更をすべて削除しますか？`))return;
    delete appData.overrides[key];
    saveData();
    renderOverridePanel();
  });
  renderOverrideList();
}
function loadOverrideLessonInputs(lesson){document.getElementById("override-subject").value=lesson?.subject||"";}
function renderOverrideList(){const el=document.getElementById("override-list");if(!el)return;const entries=Object.entries(appData.overrides).sort(([a],[b])=>a.localeCompare(b));if(!entries.length){el.innerHTML=`<div class="muted">まだ登録されていません。</div>`;return;}el.innerHTML=entries.map(([date,o])=>{const periods=Object.entries(o.periods||{}).sort(([a],[b])=>Number(a)-Number(b)).map(([p,l])=>`${p}限:${escapeHTML(resolveSubject(l.subject)||l.subject||"—")}`).join(" / ");return `<div class="item-row"><div><strong>${escapeHTML(date)}</strong><div class="muted">${periods||"個別変更なし"}</div></div><button class="remove-button" data-remove-override="${escapeHTML(date)}">削除</button></div>`;}).join("");el.querySelectorAll("[data-remove-override]").forEach(btn=>btn.addEventListener("click",()=>{delete appData.overrides[btn.dataset.removeOverride];saveData();renderOverridePanel();}));}


function renderSettings(){
  const month=document.getElementById("term-change-month");
  // 後期開始月は4月（前期開始月）から選べる。
  month.innerHTML=Array.from({length:12-FIRST_TERM_START_MONTH+1},(_,i)=>{
    const m=FIRST_TERM_START_MONTH+i;
    return `<option value="${m}">${m}月</option>`;
  }).join("");
  month.value=String(appData.settings.termChangeMonth);
  renderSubjectColors();
  renderSubjectNames();
  renderWeekdayColors();
  renderHolidays();
}

function renderSubjectColors(){
  const el=document.getElementById("subject-colors-list");
  ensureSubjectColors(appData);
  const subjects=Object.keys(appData.settings.subjectColors).sort((a,b)=>a.localeCompare(b,"ja"));
  if(!subjects.length){
    el.innerHTML=`<div class="muted">色設定から除外されている教科以外は、自動でここに表示されます。</div>`;
    return;
  }
  el.innerHTML=subjects.map((s,i)=>`<div class="color-row"><input data-color-name="${escapeHTML(s)}" type="text" value="${escapeHTML(s)}" readonly><input data-color-value="${i}" type="color" value="${toPureColor(appData.settings.subjectColors[s]||"#808080")}"><button class="remove-button" data-remove-color="${i}">削除</button></div>`).join("");
  el.querySelectorAll('input[type="color"]').forEach(input=>input.addEventListener("input",()=>pureColorFromInput(input)));
  el.querySelectorAll("[data-remove-color]").forEach(btn=>btn.addEventListener("click",()=>{
    const row=el.querySelectorAll(".color-row")[Number(btn.dataset.removeColor)];
    if(!row)return;
    const name=row.querySelector("[data-color-name]").value.trim();
    if(!name)return;
    delete appData.settings.subjectColors[name];
    if(!appData.settings.subjectColorExcluded.includes(name)) appData.settings.subjectColorExcluded.push(name);
    saveData();
    renderSubjectColors();
  }));
}

document.getElementById("add-subject-color").addEventListener("click",()=>{
  const name=prompt("教科名を入力してください（例: 数学）");
  const trimmed=String(name||"").trim();
  if(!trimmed)return;
  appData.settings.subjectColorExcluded=appData.settings.subjectColorExcluded.filter(v=>v!==trimmed);
  appData.settings.subjectColors[trimmed]="#808080";
  saveData();
  renderSubjectColors();
});

document.getElementById("save-subject-colors").addEventListener("click",()=>{
  const list=document.getElementById("subject-colors-list");
  const previousNames=new Set(Object.keys(appData.settings.subjectColors));
  const next={};
  list.querySelectorAll(".color-row").forEach(row=>{
    const name=row.querySelector("[data-color-name]").value.trim();
    const color=toPureColor(row.querySelector("input[type=color]").value);
    if(name)next[name]=color;
  });
  const visible=new Set(Object.keys(next));
  const excluded=new Set(appData.settings.subjectColorExcluded);
  for(const oldName of previousNames){
    if(!visible.has(oldName)) excluded.add(oldName);
  }
  for(const visibleName of visible) excluded.delete(visibleName);
  appData.settings.subjectColors=next;
  appData.settings.subjectColorExcluded=[...excluded];
  ensureSubjectColors(appData);
  saveData();
  renderSubjectColors();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("教科の色を保存しました。");
});

function renderSubjectNames(){
  const el=document.getElementById("subject-names-list");
  if(!el)return;

  appData.settings.subjectNameExcluded=Array.isArray(appData.settings.subjectNameExcluded)
    ? [...new Set(appData.settings.subjectNameExcluded.map(v=>String(v).trim()).filter(Boolean))]
    : [];

  const excluded=new Set(appData.settings.subjectNameExcluded);
  const subjects=new Set([
    ...collectSubjects(appData),
    ...Object.keys(appData.settings.subjectNames || {})
  ]);
  const entries=[...subjects].filter(s=>s && !excluded.has(s)).sort((a,b)=>a.localeCompare(b,"ja"));

  if(!entries.length){
    el.innerHTML=`<div class="muted">時間割に教科が登録されると、ここに自動で表示されます。削除した教科は「教科を追加」から再登録できます。</div>`;
    return;
  }

  el.innerHTML=entries.map((original,i)=>{
    const display=appData.settings.subjectNames[original] || original;
    return `<div class="subject-name-row">
      <span class="subject-original" title="時間割データ上の元の名前">${escapeHTML(original)}</span>
      <input data-subject-original="${i}" data-original-value="${escapeHTML(original)}" type="text" value="${escapeHTML(display)}" placeholder="表示する教科名">
      <div class="subject-name-actions">
        <button class="remove-button" data-reset-subject-name="${i}">戻す</button>
        <button class="remove-button delete-subject-name-button" data-delete-subject-name="${i}">削除</button>
      </div>
    </div>`;
  }).join("");

  el.querySelectorAll("[data-reset-subject-name]").forEach(btn=>btn.addEventListener("click",()=>{
    const rows=el.querySelectorAll(".subject-name-row");
    const row=rows[Number(btn.dataset.resetSubjectName)];
    if(!row)return;
    const original=row.querySelector("input").dataset.originalValue;
    delete appData.settings.subjectNames[original];
    saveData();
    renderSubjectNames();
    if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  }));

  el.querySelectorAll("[data-delete-subject-name]").forEach(btn=>btn.addEventListener("click",()=>{
    const rows=el.querySelectorAll(".subject-name-row");
    const row=rows[Number(btn.dataset.deleteSubjectName)];
    if(!row)return;
    const original=row.querySelector("input").dataset.originalValue;
    if(!appData.settings.subjectNameExcluded.includes(original)) appData.settings.subjectNameExcluded.push(original);
    delete appData.settings.subjectNames[original];
    saveData();
    renderSubjectNames();
  }));
}

document.getElementById("add-subject-name").addEventListener("click",()=>{
  const original=prompt("元の教科名を入力してください（例: S、数学α、英語R）");
  const trimmed=String(original||"").trim();
  if(!trimmed)return;
  appData.settings.subjectNameExcluded=Array.isArray(appData.settings.subjectNameExcluded)
    ? appData.settings.subjectNameExcluded.filter(v=>v!==trimmed)
    : [];
  const current=appData.settings.subjectNames[trimmed] || trimmed;
  const display=prompt(`「${trimmed}」を時間割上で何と表示しますか？`,current);
  if(display===null)return;
  appData.settings.subjectNames[trimmed]=String(display).trim() || trimmed;
  saveData();
  renderSubjectNames();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
});

document.getElementById("save-subject-names").addEventListener("click",()=>{
  const list=document.getElementById("subject-names-list"),next={};
  list.querySelectorAll(".subject-name-row").forEach(row=>{
    const input=row.querySelector("input");
    const original=input.dataset.originalValue;
    const display=input.value.trim();
    if(original && display && display!==original)next[original]=display;
  });
  // 現在の一覧に存在する設定だけを保存し、戻したものは削除する。
  appData.settings.subjectNames=next;
  saveData();
  renderSubjectNames();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("教科名を保存しました。");
});

function renderWeekdayColors(){
  const el=document.getElementById("weekday-colors-list");
  if(!el)return;
  el.innerHTML=WEEKDAY_KEYS.map(day=>`<div class="weekday-color-row"><span class="weekday-label">${day}曜日</span><input type="color" data-weekday-color="${day}" value="${toPureColor(appData.settings.weekdayColors[day]||"#ffffff")}"></div>`).join("");
  el.querySelectorAll("[data-weekday-color]").forEach(input=>input.addEventListener("input",()=>pureColorFromInput(input)));
}

document.getElementById("save-weekday-colors").addEventListener("click",()=>{
  document.querySelectorAll("[data-weekday-color]").forEach(input=>{
    appData.settings.weekdayColors[input.dataset.weekdayColor]=toPureColor(input.value);
  });
  saveData();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("曜日の色を保存しました。");
});

function renderHolidays(){
  const color=document.getElementById("holiday-color");
  if(color){
    color.value=toPureColor(appData.settings.holidayColor);
    color.oninput=()=>pureColorFromInput(color);
  }
}

document.getElementById("save-holiday-color").addEventListener("click",()=>{
  appData.settings.holidayColor=toPureColor(document.getElementById("holiday-color").value);
  saveData();
  if(document.getElementById("view-timetable").classList.contains("active-view"))renderWeek();
  alert("祝日の色を保存しました。");
});

// 祝日は起動のたびにAPIから取得し、メモリ上（holidaySet）で保持する。
// アプリ本体のデータ・バックアップには含めない。取得に失敗した場合は前回のキャッシュを使う。
async function syncHolidaysFromAPI(){
  try {
    const response=await fetch(HOLIDAY_API_URL,{cache:"no-store"});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const data=await response.json();
    if(!data || typeof data !== "object" || Array.isArray(data)) throw new Error("祝日データの形式が不正です。");
    const dates=Object.keys(data).filter(isValidDateKey).sort();
    if(!dates.length) throw new Error("祝日データが空です。");
    holidaySet=new Set(dates);
    try { localStorage.setItem(HOLIDAY_CACHE_KEY, JSON.stringify(dates)); } catch (error) { console.warn("祝日キャッシュを保存できませんでした。",error); }
    if(document.getElementById("view-timetable").classList.contains("active-view")) renderWeek();
  } catch(error) {
    console.warn("祝日APIの自動取得に失敗しました。保存済みの祝日キャッシュを使用します。",error);
  }
}
document.getElementById("save-term-settings").addEventListener("click",()=>{appData.settings.termChangeMonth=Number(document.getElementById("term-change-month").value);saveData();alert("学期設定を保存しました。");});
document.getElementById("export-data").addEventListener("click",()=>{const blob=new Blob([getBackupJSONString()],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=`timetable-backup-${toDateKey(new Date())}.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);});
document.getElementById("copy-backup-data").addEventListener("click",async()=>{
  refreshBackupJSON();
  const output=document.getElementById("backup-json-output");
  if(!output)return;
  try {
    await navigator.clipboard.writeText(output.value);
    alert("バックアップJSONをコピーしました。");
  } catch(error) {
    output.focus();
    output.select();
    alert("自動コピーに失敗しました。選択されたJSONをコピーしてください。");
  }
});
document.getElementById("import-backup-data").addEventListener("click",()=>{
  const input=document.getElementById("backup-json-input");
  const status=document.getElementById("backup-import-status");
  const text=(input?.value||"").trim();
  if(!text){
    if(status){status.textContent="バックアップJSONを貼り付けてください。";status.className="status-box status-error";}
    return;
  }
  let parsed;
  try {
    parsed=JSON.parse(text);
  } catch(error) {
    if(status){status.textContent=`読み込みエラー: ${error.message}`;status.className="status-box status-error";}
    return;
  }
  const validBackup=
    isPlainObject(parsed) &&
    isPlainObject(parsed.settings) &&
    isPlainObject(parsed.schedules) &&
    Array.isArray(parsed.calendar) &&
    isPlainObject(parsed.examData) &&
    isPlainObject(parsed.overrides) &&
    (parsed.ToDo === undefined || Array.isArray(parsed.ToDo));
  if(!validBackup){
    if(status){status.textContent="バックアップJSONの形式が正しくありません。『バックアップ出力』で出力した全文を使用してください。";status.className="status-box status-error";}
    return;
  }
  if(!confirm("バックアップを読み込むと、現在の時間割・年間予定・考査・時間割変更・設定がすべてバックアップの内容に置き換わります。現在のデータは上書きされます。続行しますか？")) return;
  try {
    appData=normalizeData(parsed);
    saveData();
    renderManualPanels();
    renderTodoList();
    renderSettings();
    refreshJSONEditor();
    renderWeek();
    if(status){status.textContent="バックアップを読み込み、現在のデータを置き換えました。";status.className="status-box status-ok";}
  } catch(error) {
    console.error(error);
    if(status){status.textContent=`バックアップの読み込みに失敗しました: ${error.message}`;status.className="status-box status-error";}
  }
});

function getRetentionCutoffDate(){
  const choice=document.getElementById("data-retention-period")?.value || "1year";
  const base=new Date();
  base.setHours(0,0,0,0);
  if(choice === "custom") return document.getElementById("data-delete-before")?.value || "";
  const monthsByChoice={ "1month":1, "3months":3, "6months":6, "1year":12, "2years":24 };
  return toDateKey(shiftMonths(base, -(monthsByChoice[choice] ?? 12)));
}

function updateRetentionDateUI(){
  const choice=document.getElementById("data-retention-period")?.value || "1year";
  const customWrap=document.getElementById("data-delete-before-wrap");
  const info=document.getElementById("data-delete-before-info");
  if(customWrap) customWrap.hidden=choice!=="custom";
  const cutoff=getRetentionCutoffDate();
  if(info){
    info.textContent=cutoff
      ? `${cutoff} より前の年間予定・考査・時間割変更を削除します。週間時間割は削除されません。`
      : "削除する基準日を指定してください。";
  }
}

function deleteOldTimeData(){
  const cutoff=getRetentionCutoffDate();
  if(!isValidDateKey(cutoff)) return alert("削除する基準日を入力してください。");

  const oldCalendar=appData.calendar.filter(entry=>entry.date<cutoff);
  const oldExamKeys=Object.keys(appData.examData||{}).filter(date=>isValidDateKey(date) && date<cutoff);
  const oldOverrideKeys=Object.keys(appData.overrides||{}).filter(date=>isValidDateKey(date) && date<cutoff);
  const total=oldCalendar.length+oldExamKeys.length+oldOverrideKeys.length;
  if(!total) return alert(`${cutoff} より前に削除できるデータはありません。`);

  const confirmed=confirm(
    `${cutoff} より前のデータを完全に削除します。\n\n` +
    `年間予定: ${oldCalendar.length}件\n` +
    `考査: ${oldExamKeys.length}日分\n` +
    `時間割変更: ${oldOverrideKeys.length}日分\n\n` +
    `週間時間割は削除されません。\nこの操作は元に戻せません。続行しますか？`
  );
  if(!confirmed) return;

  appData.calendar=appData.calendar.filter(entry=>entry.date>=cutoff);
  for(const date of oldExamKeys) delete appData.examData[date];
  for(const date of oldOverrideKeys) delete appData.overrides[date];
  saveData();
  renderManualPanels();
  renderSettings();
  refreshJSONEditor();
  if(document.getElementById("view-timetable").classList.contains("active-view")) renderWeek();
  alert(`過去データを削除しました。${total}件のデータを削除しました。`);
}

document.getElementById("data-retention-period").addEventListener("change",updateRetentionDateUI);
document.getElementById("data-delete-before").addEventListener("change",updateRetentionDateUI);
document.getElementById("delete-old-data").addEventListener("click",deleteOldTimeData);

document.getElementById("reset-data").addEventListener("click",()=>{
  if(!confirm("時間割・年間予定・考査・変更・設定をすべて初期化します。元に戻せません。続行しますか？"))return;
  localStorage.removeItem(STORAGE_KEY);
  appData=emptyData();
  saveData();
  renderManualPanels();
  renderTodoList();
  renderSettings();
  refreshJSONEditor();
  alert("初期化しました。");
});

function resetJSONExamManualDrafts(){
  JSON_SHARE_STATE.exam.manualDrafts={};
  JSON_SHARE_STATE.exam.manualDate=toDateKey(new Date());
  JSON_SHARE_STATE.exam.manualRenderedDate=JSON_SHARE_STATE.exam.manualDate;
  JSON_SHARE_STATE.exam.manualOpen=false;
}

function switchView(name){
  const leavingInput=document.body.dataset.currentView==="input" && name!=="input";
  if(leavingInput) resetJSONExamManualDrafts();
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active-view"));
  document.getElementById(`view-${name}`).classList.add("active-view");
  document.querySelectorAll(".nav-item").forEach(btn=>btn.classList.toggle("active",btn.dataset.view===name));
  document.body.dataset.currentView=name;
  const titles={timetable:"時間割",todo:"ToDo",input:"予定入力",settings:"設定"};
  document.getElementById("page-title").textContent=titles[name]||"時間割";
  if(name!=="timetable"){
    document.getElementById("prev-week").hidden=false;
    document.getElementById("today-button").hidden=false;
    document.getElementById("next-week").hidden=false;
  }
  if(name==="timetable")renderWeek();
  if(name==="todo")renderTodoList();
  if(name==="input")renderManualPanels();
  if(name==="settings")renderSettings();
  window.scrollTo({top:0,behavior:"smooth"});
}
function switchInputTab(name){
  document.querySelectorAll("[data-input-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.inputTab===name));
  document.querySelectorAll(".input-tab").forEach(tab=>tab.classList.remove("active-input-tab"));
  document.getElementById(`input-tab-${name}`).classList.add("active-input-tab");
  if(name === "json") refreshJSONEditor();
}
function switchManualTab(name){document.querySelectorAll("[data-manual-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.manualTab===name));document.querySelectorAll(".manual-panel").forEach(panel=>panel.classList.remove("active-panel"));document.getElementById(`manual-${name}`).classList.add("active-panel");}

document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>switchView(btn.dataset.view)));
document.getElementById("todo-add-button").addEventListener("click",()=>openTodoAddModal());
document.getElementById("timetable-mode-toggle").addEventListener("click",()=>{
  timetableDisplayMode = timetableDisplayMode === "date" ? "subject" : "date";
  const prev=document.getElementById("prev-week"), today=document.getElementById("today-button"), next=document.getElementById("next-week");
  if(timetableDisplayMode === "subject"){ prev.hidden=true; today.hidden=true; next.hidden=true; } else { prev.hidden=false; today.hidden=false; next.hidden=false; }
  renderWeek();
});
document.querySelectorAll("[data-input-tab]").forEach(btn=>btn.addEventListener("click",()=>switchInputTab(btn.dataset.inputTab)));
document.querySelectorAll("[data-manual-tab]").forEach(btn=>btn.addEventListener("click",()=>switchManualTab(btn.dataset.manualTab)));
document.getElementById("prev-week").addEventListener("click",()=>{currentWeekStart=addDays(currentWeekStart,-7);renderWeek();});
document.getElementById("next-week").addEventListener("click",()=>{currentWeekStart=addDays(currentWeekStart,7);renderWeek();});
document.getElementById("today-button").addEventListener("click",()=>{currentWeekStart=getMonday(new Date());renderWeek();scrollTodayIntoView();});
document.getElementById("modal-close").addEventListener("click",closeModal);
document.getElementById("lesson-modal").addEventListener("click",e=>{if(e.target.id==="lesson-modal")closeModal();});
window.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal();});

let currentJSONTab = "calendar";
const JSON_SHARE_STATE = {
  calendar: { mode: "all", start: "", end: "" },
  schedule: { term: "all", type: "all" },
  exam: { mode: "all", manualOpen: false, manualDate: toDateKey(new Date()), manualRenderedDate: toDateKey(new Date()), manualDrafts: {} }
};
const JSON_TAB_CONFIG = {
  calendar: {
    title: "年間予定 のJSON",
    help: "localStorageの calendar 部分だけを編集します。A / B / C / 変則 / 行事 / 考査 の日付設定を扱います。",
    key: "calendar"
  },
  schedule: {
    title: "通常時間割 のJSON",
    help: "localStorageの schedules 部分だけを編集します。前期・後期、A / B / C、曜日別の通常時間割を扱います。",
    key: "schedules"
  },
  exam: {
    title: "考査 のJSON",
    help: "localStorageの examData 部分だけを編集します。日付ごとの各限の考査教科を扱います。",
    key: "examData"
  },
  override: {
    title: "時間割変更 のJSON",
    help: "localStorageの overrides 部分だけを編集します。年間予定を変えず、限単位の変更だけを扱います。",
    key: "overrides"
  },
  all: {
    title: "全体 のJSON",
    help: "設定を除いた、時間割関係のデータ全体です。年間予定・通常時間割・考査・時間割変更をまとめて扱います。",
    key: null
  }
};

function getCalendarShareObject(){
  const state=JSON_SHARE_STATE.calendar;
  if(state.mode === "all") return { calendar: appData.calendar || [] };

  const start=state.start, end=state.end;
  if(!isValidDateKey(start) || !isValidDateKey(end)) throw new Error("年間予定の範囲指定では、開始日と終了日を入力してください。");
  if(start > end) throw new Error("年間予定の開始日は終了日以前にしてください。");

  return {
    calendar: (appData.calendar || []).filter(entry => entry.date >= start && entry.date <= end)
  };
}

function getScheduleShareObject(){
  const state=JSON_SHARE_STATE.schedule;
  const termKeys=state.term === "all" ? ["firstTerm","secondTerm"] : [state.term];
  const typeKeys=state.type === "all" ? ["A","B","C"] : [state.type];
  const schedules={};

  for(const term of termKeys){
    schedules[term]={};
    for(const type of typeKeys){
      schedules[term][type]=appData.schedules?.[term]?.[type] || {};
    }
  }
  return { schedules };
}

function getJSONExamDraft(date){
  if(Object.prototype.hasOwnProperty.call(JSON_SHARE_STATE.exam.manualDrafts,date)) return JSON_SHARE_STATE.exam.manualDrafts[date];
  const saved=appData.examData?.[date] || {};
  const draft={};
  for(let p=1;p<=PERIODS;p++){
    const subject=String(saved[String(p)]?.subject || "").trim();
    if(subject) draft[String(p)]={subject};
  }
  JSON_SHARE_STATE.exam.manualDrafts[date]=draft;
  return draft;
}

function captureJSONExamManualDraft(targetDate=null){
  const dateInput=document.getElementById("json-exam-manual-date");
  const date=targetDate || dateInput?.value || "";
  if(!isValidDateKey(date)) return;
  const rows=document.querySelectorAll("#json-exam-manual-periods .exam-period-editor");
  if(!rows.length) return;
  const exam={};
  rows.forEach((row,index)=>{
    const input=row.querySelector('input[data-field="subject"]');
    const subject=input?.value?.trim() || "";
    if(subject) exam[String(index+1)]={subject};
  });
  JSON_SHARE_STATE.exam.manualDrafts[date]=exam;
  JSON_SHARE_STATE.exam.manualDate=dateInput?.value || date;
}

function drawJSONExamManualDraft(){
  const dateInput=document.getElementById("json-exam-manual-date");
  const periods=document.getElementById("json-exam-manual-periods");
  if(!dateInput || !periods) return;
  const date=dateInput.value;
  JSON_SHARE_STATE.exam.manualRenderedDate=date;
  const draft=getJSONExamDraft(date);
  periods.innerHTML=Array.from({length:PERIODS},(_,i)=>{
    const p=i+1;
    return `<div class="period-editor exam-period-editor"><div class="period-number">${p}</div>${lessonFieldsHTML(draft[String(p)]||null)}</div>`;
  }).join("");
  periods.querySelectorAll('input[data-field="subject"]').forEach(input=>input.addEventListener("input",()=>{
    captureJSONExamManualDraft();
    refreshJSONShare();
  }));
}

function toggleJSONExamManualEditor(){
  if(JSON_SHARE_STATE.exam.manualOpen){
    captureJSONExamManualDraft();
    JSON_SHARE_STATE.exam.manualOpen=false;
    JSON_SHARE_STATE.exam.mode="all";
  } else {
    JSON_SHARE_STATE.exam.manualOpen=true;
    JSON_SHARE_STATE.exam.mode="manual";
  }
  // 手入力欄の各限の入力欄は renderJSONShareControls の中で描画される。
  renderJSONShareControls();
  refreshJSONShare();
}

function getExamManualShareObject(){
  captureJSONExamManualDraft();
  const drafts=JSON_SHARE_STATE.exam.manualDrafts || {};
  const examData={};
  for(const [date,exam] of Object.entries(drafts).sort(([a],[b])=>a.localeCompare(b))){
    if(!isValidDateKey(date) || !isPlainObject(exam) || !Object.keys(exam).length) continue;
    examData[date]=exam;
  }
  if(!Object.keys(examData).length) throw new Error("JSON出力用の手入力欄に、少なくとも1日の考査教科を入力してください。");
  return {examData};
}

function getJSONShareObject(){
  switch(currentJSONTab){
    case "calendar": return getCalendarShareObject();
    case "schedule": return getScheduleShareObject();
    case "exam":
      return JSON_SHARE_STATE.exam.mode === "manual"
        ? getExamManualShareObject()
        : { examData: appData.examData || {} };
    case "override": return { overrides: appData.overrides || {} };
    default: return getTimetableOnlyJSONObject();
  }
}

function renderJSONShareControls(){
  const controls=document.getElementById("json-share-controls");
  if(!controls) return;
  const refreshButton=document.getElementById("json-refresh-share");
  if(refreshButton) refreshButton.hidden=["calendar","schedule","exam"].includes(currentJSONTab);

  if(currentJSONTab === "calendar"){
    const state=JSON_SHARE_STATE.calendar;
    controls.innerHTML=`
      <div class="json-share-control-group">
        <div class="json-share-control-title">年間予定の出力範囲</div>
        <div class="json-share-control-row">
          <label>開始日<input id="json-calendar-start" type="date" value="${escapeHTML(state.start)}"></label>
          <span class="json-share-range-separator">〜</span>
          <label>終了日<input id="json-calendar-end" type="date" value="${escapeHTML(state.end)}"></label>
        </div>
        <div class="button-row json-share-button-row">
          <button id="json-calendar-range" class="primary-button small-button">範囲を表示</button>
          <button id="json-calendar-all" class="secondary-button small-button">全文を表示</button>
        </div>
      </div>`;
    controls.querySelector("#json-calendar-range").addEventListener("click",()=>{
      JSON_SHARE_STATE.calendar={
        mode:"range",
        start:controls.querySelector("#json-calendar-start").value,
        end:controls.querySelector("#json-calendar-end").value
      };
      refreshJSONShare();
    });
    controls.querySelector("#json-calendar-all").addEventListener("click",()=>{
      JSON_SHARE_STATE.calendar={mode:"all",start:"",end:""};
      renderJSONShareControls();
      refreshJSONShare();
    });
    return;
  }

  if(currentJSONTab === "schedule"){
    const state=JSON_SHARE_STATE.schedule;
    controls.innerHTML=`
      <div class="json-share-control-group">
        <div class="json-share-control-title">通常時間割の出力対象</div>
        <div class="json-share-control-row json-share-select-row">
          <label>学期
            <select id="json-schedule-term">
              <option value="all" ${state.term==="all"?"selected":""}>すべて</option>
              <option value="firstTerm" ${state.term==="firstTerm"?"selected":""}>前期</option>
              <option value="secondTerm" ${state.term==="secondTerm"?"selected":""}>後期</option>
            </select>
          </label>
          <label>パターン
            <select id="json-schedule-type">
              <option value="all" ${state.type==="all"?"selected":""}>すべて</option>
              <option value="A" ${state.type==="A"?"selected":""}>A</option>
              <option value="B" ${state.type==="B"?"selected":""}>B</option>
              <option value="C" ${state.type==="C"?"selected":""}>C</option>
            </select>
          </label>
        </div>
        <div class="button-row json-share-button-row">
          <button id="json-schedule-apply" class="primary-button small-button">この条件で表示</button>
          <button id="json-schedule-all" class="secondary-button small-button">全文を表示</button>
        </div>
      </div>`;
    controls.querySelector("#json-schedule-apply").addEventListener("click",()=>{
      JSON_SHARE_STATE.schedule={
        term:controls.querySelector("#json-schedule-term").value,
        type:controls.querySelector("#json-schedule-type").value
      };
      refreshJSONShare();
    });
    controls.querySelector("#json-schedule-all").addEventListener("click",()=>{
      JSON_SHARE_STATE.schedule={term:"all",type:"all"};
      renderJSONShareControls();
      refreshJSONShare();
    });
    return;
  }

  if(currentJSONTab === "exam"){
    const state=JSON_SHARE_STATE.exam;
    controls.innerHTML=`
      <div class="json-share-control-group">
        <div class="json-share-control-title">考査時間割の出力</div>
        <p class="muted json-share-note">登録済みの全文を出力するほか、JSON出力専用の手入力欄で複数日の考査をまとめて作成できます。</p>
        <div class="button-row json-share-button-row">
          <button id="json-exam-manual" class="primary-button small-button">${state.manualOpen ? "手入力を閉じる" : "手入力を出力"}</button>
          ${state.manualOpen ? "" : `<button id="json-exam-all" class="secondary-button small-button">全文を表示</button>`}
        </div>
        ${state.manualOpen ? `
          <div id="json-exam-manual-editor" class="json-exam-manual-editor">
            <p class="muted json-share-note">ここで入力した考査はアプリ本体には保存されません。予定入力を閉じるまで一時保存され、日付を切り替えて複数日分をまとめてJSON出力できます。</p>
            <div class="form-field">
              <label for="json-exam-manual-date">日付</label>
              <input id="json-exam-manual-date" type="date" value="${escapeHTML(state.manualDate)}">
            </div>
            <div class="period-head"><span></span></div>
            <div id="json-exam-manual-periods"></div>
          </div>` : ""}
      </div>`;
    controls.querySelector("#json-exam-manual").addEventListener("click",()=>toggleJSONExamManualEditor());
    // 手入力欄が開いているときは「全文を表示」ボタンが存在しない。
    controls.querySelector("#json-exam-all")?.addEventListener("click",()=>{
      captureJSONExamManualDraft();
      state.mode="all";
      refreshJSONShare();
    });
    if(state.manualOpen){
      controls.querySelector("#json-exam-manual-date").addEventListener("change",()=>{
        const dateInput=controls.querySelector("#json-exam-manual-date");
        // changeイベント発火時には、dateInput.valueはすでに新しい日付になっている。
        // そのため、画面に表示していた直前の日付を使って現在の入力を保存する。
        captureJSONExamManualDraft(JSON_SHARE_STATE.exam.manualRenderedDate);
        state.manualDate=dateInput.value;
        drawJSONExamManualDraft();
        refreshJSONShare();
      });
      drawJSONExamManualDraft();
    }
    return;
  }

  if(currentJSONTab === "override"){
    controls.innerHTML=`<div class="json-share-control-group json-share-control-simple">時間割変更は現在、登録済みの全文を出力します。</div>`;
    return;
  }

  controls.innerHTML=`<div class="json-share-control-group json-share-control-simple">全体JSONは全文を出力します。</div>`;
}

function getTimetableOnlyJSONObject(){
  return {
    schedules: appData.schedules || {},
    calendar: appData.calendar || [],
    examData: appData.examData || {},
    overrides: appData.overrides || {}
  };
}

function getTimetableOnlyJSONFromParsed(parsed){
  if(!isPlainObject(parsed)) throw new Error("全体のJSONはオブジェクト形式で入力してください。");
  const keys=["schedules","calendar","examData","overrides"];
  if(!keys.some(key=>Object.prototype.hasOwnProperty.call(parsed,key))){
    throw new Error("全体のJSONには、schedules / calendar / examData / overrides のいずれかを含めてください。");
  }
  const source={};
  for(const key of keys){
    if(Object.prototype.hasOwnProperty.call(parsed,key)) source[key]=parsed[key];
  }
  return source;
}

function getJSONSectionFromParsed(tab, parsed){
  const config=JSON_TAB_CONFIG[tab]||JSON_TAB_CONFIG.calendar;
  if(config.key===null){
    return getTimetableOnlyJSONFromParsed(parsed);
  }

  if(config.key === "calendar") {
    if(Array.isArray(parsed)) return { calendar: parsed };
    if(!isPlainObject(parsed) || !Array.isArray(parsed.calendar)) throw new Error('年間予定は { "calendar": [...] } の形式で入力してください。');
    return { calendar: parsed.calendar };
  }

  if(config.key === "schedules") {
    if(isPlainObject(parsed) && isPlainObject(parsed.schedules)) return { schedules: parsed.schedules };
    if(isPlainObject(parsed) && (parsed.firstTerm || parsed.secondTerm)) return { schedules: parsed };
    throw new Error('通常時間割は { "schedules": {...} } の形式で入力してください。');
  }

  if(config.key === "examData") {
    if(isPlainObject(parsed) && isPlainObject(parsed.examData)) return { examData: parsed.examData };
    if(isPlainObject(parsed)) return { examData: parsed };
    throw new Error('考査は { "examData": {...} } の形式で入力してください。');
  }

  if(config.key === "overrides") {
    if(isPlainObject(parsed) && isPlainObject(parsed.overrides)) return { overrides: parsed.overrides };
    if(isPlainObject(parsed)) return { overrides: parsed };
    throw new Error('時間割変更は { "overrides": {...} } の形式で入力してください。');
  }

  throw new Error("JSONの種類が不正です。");
}

function mergeJSONSection(incoming){
  const key=JSON_TAB_CONFIG[currentJSONTab]?.key;
  // 先に形式を検証し、そのタブが扱うキーだけを取り込む（settings や ToDo は混入させない）。
  const section=getJSONSectionFromParsed(currentJSONTab,incoming);
  if(key===null) return mergeImportedData(appData,section);

  if(key === "calendar") {
    const map=new Map((appData.calendar||[]).map(x=>[x.date,x]));
    for(const item of section.calendar){
      const entry=normalizeCalendarEntry(item);
      if(!entry) continue;
      map.set(entry.date,entry);
    }
    appData.calendar=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
    return normalizeData(appData);
  }

  appData[key]=deepMerge(appData[key]||{},section[key]);
  return normalizeData(appData);
}

function replaceJSONSection(parsed){
  const normalized=getJSONSectionFromParsed(currentJSONTab,parsed);
  const key=JSON_TAB_CONFIG[currentJSONTab]?.key;
  if(key===null){
    const next={...appData};
    for(const dataKey of ["schedules","calendar","examData","overrides"]){
      next[dataKey]=Object.prototype.hasOwnProperty.call(normalized,dataKey) ? normalized[dataKey] : emptyData()[dataKey];
    }
    return normalizeData(next);
  }
  const next={...appData,[key]:normalized[key]};
  return normalizeData(next);
}

function refreshJSONEditor(){
  const config=JSON_TAB_CONFIG[currentJSONTab]||JSON_TAB_CONFIG.calendar;
  const content=JSON_TAB_CONTENT[currentJSONTab]||JSON_TAB_CONTENT.calendar;
  document.querySelectorAll("[data-json-tab]").forEach(btn=>btn.classList.toggle("active",btn.dataset.jsonTab===currentJSONTab));
  const title=document.getElementById("json-editor-title");
  const help=document.getElementById("json-editor-help");
  const input=document.getElementById("json-input");
  const prompt=document.getElementById("ai-prompt");
  const schema=document.getElementById("schema-example");
  if(title) title.textContent=config.title;
  if(help) help.textContent=config.help;
  if(prompt) prompt.textContent=content.prompt;
  if(schema) schema.textContent=content.schema;
  // 入力欄は常に空にしておき、現在のデータは下の共有用JSONだけに表示する。
  if(input) input.value="";
  renderJSONShareControls();
  refreshJSONShare();
}

function refreshJSONShare(){
  const output=document.getElementById("json-share-output");
  if(!output) return;
  try {
    output.value=JSON.stringify(getJSONShareObject(),null,2);
  } catch(error) {
    output.value="";
    notify(`出力エラー: ${error.message}`,true);
  }
}

function refreshBackupJSON(){
  const output=document.getElementById("backup-json-output");
  if(output) output.value=getBackupJSONString();
}

function getBackupJSONString(){
  return JSON.stringify(appData,null,2);
}

function switchJSONTab(name){
  if(!JSON_TAB_CONFIG[name]) return;
  currentJSONTab=name;
  refreshJSONEditor();
  notify("");
}

document.getElementById("json-replace").addEventListener("click",()=>importJSON(false));
document.getElementById("json-merge").addEventListener("click",()=>importJSON(true));
document.querySelectorAll("[data-json-tab]").forEach(btn=>btn.addEventListener("click",()=>switchJSONTab(btn.dataset.jsonTab)));
document.getElementById("json-refresh-share").addEventListener("click",()=>{
  refreshJSONShare();
  notify("共有用JSONを全文の最新状態に更新しました。");
});
document.getElementById("json-copy-share").addEventListener("click",async()=>{
  const output=document.getElementById("json-share-output");
  if(!output)return;
  try {
    await navigator.clipboard.writeText(output.value);
    notify("共有用JSONをコピーしました。");
  } catch(error) {
    output.focus();
    output.select();
    notify("自動コピーに失敗しました。選択されたJSONをコピーしてください。",true);
  }
});
document.getElementById("copy-prompt").addEventListener("click",async()=>{try{await navigator.clipboard.writeText((JSON_TAB_CONTENT[currentJSONTab]||JSON_TAB_CONTENT.calendar).prompt);notify("プロンプトをコピーしました。");}catch(e){notify("コピーに失敗しました。手動で選択してください。",true);}});
function notify(message,isError=false){const el=document.getElementById("json-status");if(!el)return;el.textContent=message;el.className=`status-box ${isError?"status-error":"status-ok"}`;}
function importJSON(merge){
  const input=document.getElementById("json-input").value.trim();
  if(!input)return notify("JSONを貼り付けてください。",true);
  try {
    const parsed=JSON.parse(input);
    if(!merge){
      const tabTitle=JSON_TAB_CONFIG[currentJSONTab]?.title?.replace(/\s*のJSON$/, "") || "この項目";
      const confirmed=confirm(`「${tabTitle}」の全文が置換されます。現在登録されているこの項目のデータは、貼り付けたJSONの内容で完全に置き換えられます。続行しますか？`);
      if(!confirmed) return notify("置換をキャンセルしました。");
    }
    appData=merge?mergeJSONSection(parsed):replaceJSONSection(parsed);
    saveData();
    renderManualPanels();
    renderSettings();
    refreshJSONEditor();
    notify(merge?"追加・更新しました。":"置換しました。");
    if(document.getElementById("view-timetable").classList.contains("active-view")) renderWeek();
  } catch(error) {
    notify(`読み込みエラー: ${error.message}`,true);
  }
}

function mergeImportedData(current,incoming){const out=deepMerge(current,incoming);if(Array.isArray(incoming.calendar)){const map=new Map((current.calendar||[]).map(x=>[x.date,x]));for(const x of incoming.calendar){const n=normalizeCalendarEntry(x);if(n)map.set(n.date,n);}out.calendar=[...map.values()].sort((a,b)=>a.date.localeCompare(b.date));}if(isPlainObject(incoming.examData))out.examData=deepMerge(current.examData||{},incoming.examData);if(isPlainObject(incoming.overrides))out.overrides=deepMerge(current.overrides||{},incoming.overrides);if(isPlainObject(incoming.schedules))out.schedules=deepMerge(current.schedules||{},incoming.schedules);return normalizeData(out);}

refreshJSONEditor();
renderWeek();renderTodoList();renderManualPanels();renderSettings();
refreshBackupJSON();
updateRetentionDateUI();
void syncHolidaysFromAPI();
