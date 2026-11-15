/**
 * script.js — Family Memories Dashboard
 * ─────────────────────────────────────────────────────────────
 * Responsibilities:
 *   1. Sidebar navigation & mobile drawer
 *   2. Section switching (Overview / Tasks / Calendar / Board /
 *      Birthdays / Contacts / Budget / Documents /
 *      Housekeeping / Kitchen)
 *   3. Mini calendar widget with task-dot indicators
 *   4. Full CRUD: Create · Read · Update · Delete tasks
 *   5. Active ↔ Completed toggle
 *   6. Dynamic filters (All / Active / Completed)
 *   7. localStorage persistence
 *   8. Toast notifications
 *   9. Board (Kanban) view
 *  10. Dashboard stats & glance widgets
 * ─────────────────────────────────────────────────────────────
 */

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */

/** @type {Task[]} In-memory tasks, mirrored to localStorage */
let tasks = [];

/** Current filter used in the Overview task panel: 'all' | 'active' | 'completed' */
let currentFilter = 'all';

/** ID of the task being edited, or null when creating */
let editingId = null;

/** Currently active section key */
let currentSection = 'overview';

/** Calendar state: which month/year is displayed */
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();   // 0-indexed

/* ══════════════════════════════════════════════════════════════
   DOM REFERENCES
══════════════════════════════════════════════════════════════ */

// Form
const taskForm    = document.getElementById('taskForm');
const titleInput  = document.getElementById('taskTitle');
const descInput   = document.getElementById('taskDesc');
const dateInput   = document.getElementById('taskDate');
const titleError  = document.getElementById('titleError');
const submitBtn   = document.getElementById('submitBtn');
const submitLabel = document.getElementById('submitLabel');
const cancelBtn   = document.getElementById('cancelBtn');
const formTitle   = document.getElementById('formTitle');

// Task list (overview section)
const taskListEl    = document.getElementById('taskList');
const emptyState    = document.getElementById('emptyState');
const emptyTitle    = document.getElementById('emptyTitle');
const emptyDesc     = document.getElementById('emptyDesc');
const statsLabel    = document.getElementById('statsLabel');

// Stats
const statTotal     = document.getElementById('statTotal');
const statActive    = document.getElementById('statActive');
const statCompleted = document.getElementById('statCompleted');
const glanceTask    = document.getElementById('glanceTaskCount');

// Nav
const navTaskText         = document.getElementById('navTaskText');
const sidebarTaskBadge    = document.getElementById('sidebarTaskBadge');
const topbarTitle         = document.getElementById('topbarTitle');
const topbarDate          = document.getElementById('topbarDate');

// Toast
const toastContainer = document.getElementById('toastContainer');

// Sidebar
const sidebar        = document.getElementById('sidebar');
const sidebarOverlay = document.getElementById('sidebarOverlay');
const sidebarToggle  = document.getElementById('sidebarToggle');

// All filter buttons (overview panel)
const filterBtns = document.querySelectorAll(
  '#section-overview .filter-btn'
);

// Calendar (mini, in overview)
const miniCalendarEl  = document.getElementById('miniCalendar');
const calMonthLabel   = document.getElementById('calMonthLabel');
const calPrevBtn      = document.getElementById('calPrev');
const calNextBtn      = document.getElementById('calNext');

// Calendar (full page)
const fullCalendarEl  = document.getElementById('fullCalendar');
const calMonthLabel2  = document.getElementById('calMonthLabel2');
const calPrevBtn2     = document.getElementById('calPrev2');
const calNextBtn2     = document.getElementById('calNext2');
const calTasksForDay  = document.getElementById('calTasksForDay');
const calDayTitle     = document.getElementById('calDayTitle');

/* ══════════════════════════════════════════════════════════════
   TASK TYPEDEF
══════════════════════════════════════════════════════════════ */

/**
 * @typedef {Object} Task
 * @property {string}  id          - Unique ID
 * @property {string}  title       - Task title (required)
 * @property {string}  description - Optional description
 * @property {string}  date        - Optional YYYY-MM-DD date
 * @property {boolean} completed   - Completion status
 * @property {number}  createdAt   - Unix timestamp ms
 */

/* ══════════════════════════════════════════════════════════════
   PERSISTENCE
══════════════════════════════════════════════════════════════ */

const STORAGE_KEY = 'familyMemories_tasks';

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

/* ══════════════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════════════ */

/** Generate a unique task ID */
function generateId() {
  return `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Format a YYYY-MM-DD string to a readable label.
 * Parses as local date to avoid UTC day-shift.
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-US', {
      weekday: 'short', year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return dateStr; }
}

/** Build an SVG icon element (XSS-safe DOM approach) */
function buildSvgIcon(pathD, classes) {
  const svg  = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  svg.setAttribute('class', classes);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.setAttribute('d', pathD);
  svg.appendChild(path);
  return svg;
}

/* ══════════════════════════════════════════════════════════════
   SIDEBAR NAVIGATION
══════════════════════════════════════════════════════════════ */

/** Section meta-data: title shown in topbar */
const SECTION_META = {
  overview:     'Overview',
  calendar:     'Calendar',
  tasks:        'Tasks',
  board:        'Board',
  birthdays:    'Birthdays',
  contacts:     'Contacts',
  budget:       'Budget',
  documents:    'Documents',
  housekeeping: 'Housekeeping',
  kitchen:      'Kitchen',
};

/**
 * Switch the visible section and update sidebar active state.
 * Called from inline onclick attributes in HTML.
 * @param {string} sectionKey
 */
function switchSection(sectionKey) {
  if (!SECTION_META[sectionKey]) return;

  currentSection = sectionKey;

  // ── Show / hide section pages ──
  document.querySelectorAll('.section-page').forEach((el) => {
    el.classList.remove('active-section');
  });
  const target = document.getElementById(`section-${sectionKey}`);
  if (target) target.classList.add('active-section');

  // ── Update sidebar active item ──
  document.querySelectorAll('.sidebar-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === sectionKey);
  });

  // ── Topbar title ──
  topbarTitle.textContent = SECTION_META[sectionKey];

  // ── Close mobile sidebar ──
  sidebar.classList.remove('open');
  sidebarOverlay.classList.add('hidden');

  // ── Section-specific init ──
  if (sectionKey === 'board')    renderBoard();
  if (sectionKey === 'calendar') renderFullCalendar();
  if (sectionKey === 'tasks')    renderTasksPage();

  // Render placeholder sections
  const placeholders = [
    'birthdays', 'contacts', 'budget', 'documents', 'housekeeping', 'kitchen',
  ];
  if (placeholders.includes(sectionKey)) renderPlaceholder(sectionKey);
}

/** Render the placeholder content for household sections */
function renderPlaceholder(sectionKey) {
  const wrapper = document.querySelector(
    `#section-${sectionKey} .placeholder-section`
  );
  if (!wrapper) return;

  // Clear existing dynamic content (title + desc) if any
  const existing = wrapper.querySelectorAll('.ph-title, .ph-desc, .ph-cta');
  existing.forEach((el) => el.remove());

  const title = document.createElement('h2');
  title.className = 'ph-title';
  title.style.cssText = 'font-size:1.1rem;font-weight:800;color:#39352F;margin-bottom:.4rem;';
  title.textContent = wrapper.dataset.title || sectionKey;

  const desc = document.createElement('p');
  desc.className = 'ph-desc';
  desc.style.cssText = 'font-size:.85rem;color:#81766C;max-width:28rem;margin:0 auto 1.5rem;line-height:1.65;';
  desc.textContent = wrapper.dataset.desc || '';

  const cta = document.createElement('span');
  cta.className = 'ph-cta';
  cta.style.cssText = 'display:inline-block;padding:.4rem 1rem;background:#FFF0E4;color:#E88B61;border-radius:9999px;font-size:.75rem;font-weight:700;border:1.5px solid #F8DCC8;';
  cta.textContent = 'Coming Soon';

  wrapper.appendChild(title);
  wrapper.appendChild(desc);
  wrapper.appendChild(cta);
}

/* ══════════════════════════════════════════════════════════════
   MOBILE SIDEBAR DRAWER
══════════════════════════════════════════════════════════════ */

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('open');
  sidebarOverlay.classList.toggle('hidden', !sidebar.classList.contains('open'));
});

sidebarOverlay.addEventListener('click', () => {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.add('hidden');
});

/* ══════════════════════════════════════════════════════════════
   CRUD OPERATIONS
══════════════════════════════════════════════════════════════ */

/**
 * Add a new task.
 * @param {string} title
 * @param {string} description
 * @param {string} date YYYY-MM-DD or ''
 */
function addTask(title, description, date) {
  /** @type {Task} */
  const task = {
    id:          generateId(),
    title:       title.trim(),
    description: description.trim(),
    date,
    completed:   false,
    createdAt:   Date.now(),
  };
  tasks.unshift(task);
  saveTasks();
  render();
  showToast('Task added successfully!', 'success');
}

/**
 * Update an existing task's editable fields.
 * @param {string} id
 * @param {string} newTitle
 * @param {string} newDesc
 * @param {string} newDate
 */
function updateTask(id, newTitle, newDesc, newDate) {
  tasks = tasks.map((t) =>
    t.id === id
      ? { ...t, title: newTitle.trim(), description: newDesc.trim(), date: newDate }
      : t
  );
  saveTasks();
  render();
  showToast('Task updated!', 'info');
}

/**
 * Delete a task permanently (called after confirmation).
 * @param {string} id
 */
function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
  showToast('Task deleted.', 'danger');
}

/**
 * Toggle Active ↔ Completed.
 * @param {string} id
 */
function toggleComplete(id) {
  tasks = tasks.map((t) =>
    t.id === id ? { ...t, completed: !t.completed } : t
  );
  saveTasks();
  render();

  const updated = tasks.find((t) => t.id === id);
  showToast(
    updated.completed ? 'Task completed! ✓' : 'Task marked as active.',
    updated.completed ? 'success' : 'warning'
  );
}

/* ══════════════════════════════════════════════════════════════
   FILTER
══════════════════════════════════════════════════════════════ */

/**
 * Return tasks filtered by `currentFilter`.
 * @returns {Task[]}
 */
function getFilteredTasks() {
  switch (currentFilter) {
    case 'active':    return tasks.filter((t) => !t.completed);
    case 'completed': return tasks.filter((t) =>  t.completed);
    default:          return tasks;
  }
}

/* ══════════════════════════════════════════════════════════════
   MAIN RENDER
══════════════════════════════════════════════════════════════ */

/** Master render — called after every state mutation */
function render() {
  updateStats();
  renderTaskList();
  renderMiniCalendar();

  // Keep board / tasks page in sync if visible
  if (currentSection === 'board')  renderBoard();
  if (currentSection === 'tasks')  renderTasksPage();
  if (currentSection === 'calendar') renderFullCalendar();
}

/* ── Stats ── */
function updateStats() {
  const total     = tasks.length;
  const active    = tasks.filter((t) => !t.completed).length;
  const completed = tasks.filter((t) =>  t.completed).length;

  animateStat(statTotal,     total);
  animateStat(statActive,    active);
  animateStat(statCompleted, completed);

  // Navbar + sidebar badge
  navTaskText.textContent = `${total} task${total !== 1 ? 's' : ''}`;
  if (active > 0) {
    sidebarTaskBadge.textContent = active;
    sidebarTaskBadge.classList.remove('hidden');
  } else {
    sidebarTaskBadge.classList.add('hidden');
  }

  // Filter bar label
  statsLabel.textContent = `${active} active · ${completed} done`;

  // Glance widget — active tasks count
  if (glanceTask) glanceTask.textContent = active;
}

function animateStat(el, value) {
  if (el && el.textContent !== String(value)) {
    el.textContent = value;
    el.classList.remove('stat-pop');
    void el.offsetWidth;  // reflow to restart animation
    el.classList.add('stat-pop');
  }
}

/* ── Overview Task List ── */
function renderTaskList() {
  const filtered = getFilteredTasks();

  if (filtered.length === 0) {
    taskListEl.innerHTML = '';
    showEmptyState(emptyTitle, emptyDesc);
    emptyState.classList.remove('hidden');
    return;
  }

  emptyState.classList.add('hidden');
  taskListEl.innerHTML = '';
  filtered.forEach((t) => taskListEl.appendChild(buildTaskCard(t)));
}

/**
 * Update empty-state text to match the active filter.
 * @param {HTMLElement} titleEl
 * @param {HTMLElement} descEl
 */
function showEmptyState(titleEl, descEl) {
  const msgs = {
    active:    ['No Active Tasks',    'All caught up! Every task has been completed.'],
    completed: ['No Completed Tasks', 'Complete a task and it will appear here.'],
    all:       ['No Tasks Yet',       'Start adding your family activities.'],
  };
  const [t, d] = msgs[currentFilter] || msgs.all;
  if (titleEl) titleEl.textContent = t;
  if (descEl)  descEl.textContent  = d;
}

/* ── Tasks page (full page view) ── */
function renderTasksPage() {
  const list2       = document.getElementById('taskList2');
  const empty2      = document.getElementById('emptyState2');
  const statsLabel2 = document.getElementById('statsLabel2');
  if (!list2) return;

  const active    = tasks.filter((t) => !t.completed).length;
  const completed = tasks.filter((t) =>  t.completed).length;
  if (statsLabel2) statsLabel2.textContent = `${active} active · ${completed} done`;

  // Determine filter from tasks-page filter buttons
  const activeFilterBtn = document.querySelector('.filter-tasks-page.filter-active');
  const tasksPageFilter = activeFilterBtn ? activeFilterBtn.dataset.filter : 'all';

  let visible;
  if (tasksPageFilter === 'active')    visible = tasks.filter((t) => !t.completed);
  else if (tasksPageFilter === 'completed') visible = tasks.filter((t) => t.completed);
  else visible = tasks;

  if (visible.length === 0) {
    list2.innerHTML = '';
    if (empty2) empty2.classList.remove('hidden');
    return;
  }

  if (empty2) empty2.classList.add('hidden');
  list2.innerHTML = '';
  visible.forEach((t) => list2.appendChild(buildTaskCard(t)));
}

/* ═══════════════════════════════════════════════════════════
   BUILD TASK CARD  (DOM-based, XSS-safe — uses textContent)
═══════════════════════════════════════════════════════════ */

/**
 * Build a complete task card element.
 * @param {Task} task
 * @returns {HTMLElement}
 */
function buildTaskCard(task) {
  const article = document.createElement('article');
  article.className = `task-card${task.completed ? ' is-completed' : ''}`;
  article.dataset.id = task.id;

  /* Checkbox */
  const cb = document.createElement('input');
  cb.type      = 'checkbox';
  cb.className = 'task-checkbox';
  cb.checked   = task.completed;
  cb.setAttribute('aria-label', `Mark "${task.title}" as ${task.completed ? 'active' : 'completed'}`);
  cb.addEventListener('change', () => toggleComplete(task.id));

  /* Content */
  const content = document.createElement('div');
  content.className = 'flex-1 min-w-0';

  // Title row
  const titleRow = document.createElement('div');
  titleRow.className = 'flex items-center gap-2 flex-wrap';

  const titleEl = document.createElement('span');
  titleEl.className   = 'task-title';
  titleEl.textContent = task.title;

  titleRow.appendChild(titleEl);
  titleRow.appendChild(buildStatusBadge(task.completed));
  content.appendChild(titleRow);

  // Description
  if (task.description) {
    const d = document.createElement('p');
    d.className   = 'task-desc';
    d.textContent = task.description;
    content.appendChild(d);
  }

  // Date
  if (task.date) {
    const dateEl = document.createElement('p');
    dateEl.className = 'task-date';
    dateEl.appendChild(
      buildSvgIcon(
        'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z',
        'w-3 h-3'
      )
    );
    const dateText = document.createElement('span');
    dateText.textContent = formatDate(task.date);
    dateEl.appendChild(dateText);
    content.appendChild(dateEl);
  }

  /* Actions */
  const actions = document.createElement('div');
  actions.className = 'flex items-center gap-1 flex-shrink-0 self-start mt-0.5';
  actions.appendChild(buildActionButton('edit',   task.id));
  actions.appendChild(buildActionButton('delete', task.id));

  article.appendChild(cb);
  article.appendChild(content);
  article.appendChild(actions);
  return article;
}

/** Build the Active / Completed badge */
function buildStatusBadge(completed) {
  const badge = document.createElement('span');
  if (completed) {
    /* Sage Green */
    badge.textContent = 'Completed';
    badge.style.cssText = `
      font-size:.6rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:#536B55; background:#EEF4EE;
      padding:.12rem .5rem; border-radius:9999px; border:1px solid #B8D8B8;
      white-space:nowrap;
    `;
  } else {
    /* Peach */
    badge.textContent = 'Active';
    badge.style.cssText = `
      font-size:.6rem; font-weight:700; text-transform:uppercase;
      letter-spacing:.06em; color:#C8694A; background:#FFF0E4;
      padding:.12rem .5rem; border-radius:9999px; border:1px solid #F8DCC8;
      white-space:nowrap;
    `;
  }
  return badge;
}

/** Build an edit or delete icon button */
function buildActionButton(type, taskId) {
  const btn = document.createElement('button');
  btn.type      = 'button';
  btn.className = `task-action-btn ${type}-btn`;
  btn.dataset.id = taskId;

  const icons = {
    edit:   'M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.415.586H8v-2.414A2 2 0 019 13z',
    delete: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0a1 1 0 00-1-1h-4a1 1 0 00-1 1H5',
  };

  btn.setAttribute('aria-label', type === 'edit' ? 'Edit task' : 'Delete task');
  btn.title = type === 'edit' ? 'Edit' : 'Delete';
  btn.appendChild(buildSvgIcon(icons[type], 'w-3.5 h-3.5'));

  if (type === 'edit')   btn.addEventListener('click', () => startEdit(taskId));
  if (type === 'delete') btn.addEventListener('click', () => confirmDelete(taskId));

  return btn;
}

/* ══════════════════════════════════════════════════════════════
   BOARD VIEW  (Kanban)
══════════════════════════════════════════════════════════════ */

function renderBoard() {
  const todoCol       = document.getElementById('boardTodo');
  const doneCol       = document.getElementById('boardDone');
  const todoCount     = document.getElementById('boardTodoCount');
  const doneCount     = document.getElementById('boardDoneCount');
  if (!todoCol || !doneCol) return;

  const activeTasks    = tasks.filter((t) => !t.completed);
  const completedTasks = tasks.filter((t) =>  t.completed);

  if (todoCount) todoCount.textContent = activeTasks.length;
  if (doneCount) doneCount.textContent = completedTasks.length;

  todoCol.innerHTML = '';
  doneCol.innerHTML = '';

  if (activeTasks.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-xs text-center py-6';
    p.style.color = '#81766C';
    p.textContent = 'No active tasks. Add one above!';
    todoCol.appendChild(p);
  } else {
    activeTasks.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'board-task-card';
      card.textContent = t.title;
      todoCol.appendChild(card);
    });
  }

  if (completedTasks.length === 0) {
    const p = document.createElement('p');
    p.className = 'text-xs text-center py-6';
    p.style.color = '#81766C';
    p.textContent = 'No completed tasks yet.';
    doneCol.appendChild(p);
  } else {
    completedTasks.forEach((t) => {
      const card = document.createElement('div');
      card.className = 'board-task-card done';
      card.textContent = t.title;
      doneCol.appendChild(card);
    });
  }
}

/* ══════════════════════════════════════════════════════════════
   MINI CALENDAR  (Overview right column)
══════════════════════════════════════════════════════════════ */

/** Set of YYYY-MM-DD strings that have at least one task */
function getTaskDateSet() {
  return new Set(tasks.filter((t) => t.date).map((t) => t.date));
}

/**
 * Render a month calendar into a container.
 * @param {HTMLElement} container
 * @param {HTMLElement} labelEl
 * @param {number} year
 * @param {number} month  0-indexed
 * @param {Function} [onDayClick]  callback(dateStr)
 */
function renderCalendar(container, labelEl, year, month, onDayClick) {
  if (!container) return;

  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DOW = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  if (labelEl) labelEl.textContent = `${MONTHS[month]} ${year}`;

  const taskDates = getTaskDateSet();
  const today     = new Date();
  const todayStr  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  // First day-of-week of the month, and total days
  const firstDow  = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  container.innerHTML = '';

  // Day-of-week header row
  const dowRow = document.createElement('div');
  dowRow.className = 'cal-dow-row';
  DOW.forEach((d) => {
    const cell = document.createElement('div');
    cell.className   = 'cal-dow';
    cell.textContent = d;
    dowRow.appendChild(cell);
  });
  container.appendChild(dowRow);

  // Day grid
  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  // Leading empty cells
  for (let i = 0; i < firstDow; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day cal-other-month';
    grid.appendChild(empty);
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    cell.textContent = d;

    if (dateStr === todayStr)         cell.classList.add('cal-today');
    if (taskDates.has(dateStr))       cell.classList.add('has-task');

    if (onDayClick) {
      cell.addEventListener('click', () => onDayClick(dateStr, cell));
    }

    grid.appendChild(cell);
  }

  container.appendChild(grid);
}

/** Render / refresh the mini calendar in the Overview section */
function renderMiniCalendar() {
  renderCalendar(miniCalendarEl, calMonthLabel, calYear, calMonth);
}

/** Render the full-page calendar */
function renderFullCalendar() {
  renderCalendar(fullCalendarEl, calMonthLabel2, calYear, calMonth, handleCalDayClick);
}

/** Handle a day click on the full-page calendar */
function handleCalDayClick(dateStr, cellEl) {
  if (!calTasksForDay || !calDayTitle) return;

  // Clear previous selection highlight
  document.querySelectorAll('#fullCalendar .cal-day').forEach((el) => {
    el.classList.remove('cal-selected');
  });
  cellEl.classList.add('cal-selected');

  // Find tasks on this date
  const dayTasks = tasks.filter((t) => t.date === dateStr);
  calDayTitle.textContent = formatDate(dateStr);
  calTasksForDay.classList.remove('hidden');

  // Remove old task items from the day panel
  calTasksForDay.querySelectorAll('.cal-task-item').forEach((el) => el.remove());

  if (dayTasks.length === 0) {
    const none = document.createElement('p');
    none.className = 'cal-task-item text-xs';
    none.style.color = '#81766C';
    none.textContent = 'No tasks on this day.';
    calTasksForDay.appendChild(none);
  } else {
    dayTasks.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'cal-task-item';
      row.style.cssText = `
        display:flex; align-items:center; gap:.5rem;
        font-size:.78rem; padding:.35rem .5rem;
        background:${t.completed ? '#EEF4EE' : '#EAF6F8'};
        border-radius:.4rem; border:1px solid ${t.completed ? '#B8D8B8' : '#C8E8ED'};
      `;
      const dot = document.createElement('span');
      dot.style.cssText = `width:7px;height:7px;border-radius:50%;flex-shrink:0;background:${t.completed ? '#536B55' : '#E88B61'};`;
      const label = document.createElement('span');
      label.style.cssText = t.completed ? 'text-decoration:line-through;color:#94a3b8;' : 'color:#39352F;font-weight:600;';
      label.textContent = t.title;
      row.appendChild(dot);
      row.appendChild(label);
      calTasksForDay.appendChild(row);
    });
  }
}

/* Calendar nav buttons */
function prevMonth(e) {
  e.stopPropagation();
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderMiniCalendar();
  if (currentSection === 'calendar') renderFullCalendar();
}

function nextMonth(e) {
  e.stopPropagation();
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderMiniCalendar();
  if (currentSection === 'calendar') renderFullCalendar();
}

if (calPrevBtn)  calPrevBtn.addEventListener('click',  prevMonth);
if (calNextBtn)  calNextBtn.addEventListener('click',  nextMonth);
if (calPrevBtn2) calPrevBtn2.addEventListener('click', prevMonth);
if (calNextBtn2) calNextBtn2.addEventListener('click', nextMonth);

/* ══════════════════════════════════════════════════════════════
   FORM — CREATE & EDIT MODES
══════════════════════════════════════════════════════════════ */

/**
 * Put the form into "Edit" mode for the given task.
 * @param {string} id
 */
function startEdit(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  editingId = id;

  titleInput.value = task.title;
  descInput.value  = task.description;
  dateInput.value  = task.date || '';

  formTitle.textContent   = 'Edit Task';
  submitLabel.textContent = 'Save Changes';
  submitBtn.classList.add('edit-mode');
  cancelBtn.classList.remove('hidden');

  // Switch to overview so the form is visible
  if (currentSection !== 'overview') switchSection('overview');

  // Scroll the form into view
  const formCard = document.getElementById('formCard');
  if (formCard) formCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  titleInput.focus();
}

/** Reset form to "Create" mode */
function resetForm() {
  editingId = null;
  taskForm.reset();
  titleError.classList.add('hidden');
  formTitle.textContent   = 'Add New Task';
  submitLabel.textContent = 'Add Task';
  submitBtn.classList.remove('edit-mode');
  cancelBtn.classList.add('hidden');
}

/** Validate that the title is non-empty */
function validateTitle() {
  if (!titleInput.value.trim()) {
    titleError.classList.remove('hidden');
    titleInput.focus();
    return false;
  }
  titleError.classList.add('hidden');
  return true;
}

/* ══════════════════════════════════════════════════════════════
   DELETE CONFIRMATION
══════════════════════════════════════════════════════════════ */

function confirmDelete(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  if (window.confirm(`Delete "${task.title}"?\n\nThis cannot be undone.`)) {
    deleteTask(id);
  }
}

/* ══════════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════════ */

/**
 * Display a self-dismissing toast notification.
 * @param {string} message
 * @param {'success'|'info'|'warning'|'danger'} type
 */
function showToast(message, type = 'info') {
  const iconPaths = {
    success: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
    info:    'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    warning: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
    danger:  'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
  };

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const iconWrap = document.createElement('div');
  iconWrap.className = 'toast-icon';
  iconWrap.appendChild(buildSvgIcon(iconPaths[type] || iconPaths.info, 'w-3.5 h-3.5'));

  const msg = document.createElement('span');
  msg.textContent = message;
  msg.style.flex  = '1';

  toast.appendChild(iconWrap);
  toast.appendChild(msg);
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3000);
}

/* ══════════════════════════════════════════════════════════════
   EVENT LISTENERS
══════════════════════════════════════════════════════════════ */

/* Form submit */
taskForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!validateTitle()) return;

  const title = titleInput.value;
  const desc  = descInput.value;
  const date  = dateInput.value;

  if (editingId) {
    updateTask(editingId, title, desc, date);
  } else {
    addTask(title, desc, date);
  }
  resetForm();
});

/* Cancel edit */
cancelBtn.addEventListener('click', resetForm);

/* Clear title error on typing */
titleInput.addEventListener('input', () => {
  if (titleInput.value.trim()) titleError.classList.add('hidden');
});

/* Overview filter buttons */
filterBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterBtns.forEach((b) => b.classList.remove('filter-active'));
    btn.classList.add('filter-active');
    currentFilter = btn.dataset.filter;
    renderTaskList();
  });
});

/* Tasks-page filter buttons */
document.querySelectorAll('.filter-tasks-page').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-tasks-page').forEach((b) =>
      b.classList.remove('filter-active')
    );
    btn.classList.add('filter-active');
    renderTasksPage();
  });
});

/* ══════════════════════════════════════════════════════════════
   TOPBAR DATE
══════════════════════════════════════════════════════════════ */

function setTopbarDate() {
  if (!topbarDate) return;
  topbarDate.textContent = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
}

/* ══════════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════════ */

function init() {
  tasks = loadTasks();
  setTopbarDate();
  render();
  // Render placeholders for household sections at startup
  ['birthdays','contacts','budget','documents','housekeeping','kitchen'].forEach(
    renderPlaceholder
  );
}

init();
