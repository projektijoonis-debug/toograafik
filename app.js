'use strict';

const EMPLOYEES = ['Mari','Jaan','Kati','Toomas','Anna','Liis','Peeter','Siim','Eva','Maret'];

const COLORS = [
  {bg:'#E6F1FB',text:'#185FA5'},
  {bg:'#EAF3DE',text:'#3B6D11'},
  {bg:'#FAEEDA',text:'#854F0B'},
  {bg:'#EEEDFE',text:'#534AB7'},
  {bg:'#E1F5EE',text:'#0F6E56'},
  {bg:'#FAECE7',text:'#993C1D'},
  {bg:'#FBEAF0',text:'#993556'},
  {bg:'#F1EFE8',text:'#5F5E5A'},
  {bg:'#E8F8FF',text:'#0C5C7C'},
  {bg:'#FFF8E8',text:'#7A4F00'},
];

const MONTHS = ['Jaanuar','Veebruar','Märts','Aprill','Mai','Juuni',
  'Juuli','August','September','Oktoober','November','Detsember'];
const DAYS = ['E','T','K','N','R','L','P'];
const DAYS_FULL = ['Pühapäev','Esmaspäev','Teisipäev','Kolmapäev','Neljapäev','Reede','Laupäev'];

const today = new Date();

let state = {
  view: 'manager',
  year: today.getFullYear(),
  month: today.getMonth(),
  shifts: {},
  swapRequests: [],
  modal: null,
  selectedEmployee: EMPLOYEES[0],
};

function shiftKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function empColor(emp) {
  return COLORS[EMPLOYEES.indexOf(emp) % COLORS.length];
}

// Seed some demo shifts
function initDemoShifts() {
  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const pairs = [
    ['Mari','08:00','16:00'],
    ['Jaan','16:00','00:00'],
    ['Kati','08:00','16:00'],
    ['Toomas','12:00','20:00'],
    ['Anna','08:00','16:00'],
    ['Liis','07:00','15:00'],
  ];
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(y, m, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const key = shiftKey(y, m, d);
    state.shifts[key] = [];
    const count = 2 + Math.floor(Math.random() * 3);
    const chosen = [...pairs].sort(() => Math.random() - 0.5).slice(0, count);
    chosen.forEach(([emp, start, end]) => {
      state.shifts[key].push({ emp, start, end, id: uid() });
    });
  }
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Persist to localStorage
function save() {
  try {
    localStorage.setItem('graafik_shifts', JSON.stringify(state.shifts));
    localStorage.setItem('graafik_swaps', JSON.stringify(state.swapRequests));
  } catch(e) {}
}

function load() {
  try {
    const s = localStorage.getItem('graafik_shifts');
    const w = localStorage.getItem('graafik_swaps');
    if (s) state.shifts = JSON.parse(s);
    if (w) state.swapRequests = JSON.parse(w);
  } catch(e) {}
}

// --- RENDER ---

function render() {
  const app = document.getElementById('app');
  app.className = 'app';
  app.innerHTML = buildHeader() + buildBody();
  if (state.modal) {
    document.body.insertAdjacentHTML('beforeend', buildModal());
  }
  attachEvents();
}

function buildHeader() {
  return `
  <div class="header">
    <div class="title">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      Töögraafik
    </div>
    <div class="nav">
      <button id="prev-month">&#8249;</button>
      <span class="month-label">${MONTHS[state.month]} ${state.year}</span>
      <button id="next-month">&#8250;</button>
    </div>
    <div class="view-toggle">
      <button class="view-btn ${state.view==='manager'?'active':''}" data-view="manager">Juht</button>
      <button class="view-btn ${state.view==='worker'?'active':''}" data-view="worker">Töötaja</button>
    </div>
  </div>`;
}

function buildBody() {
  return state.view === 'manager' ? buildManagerView() : buildWorkerView();
}

// --- MANAGER VIEW ---

function buildManagerView() {
  return `
  <div class="top-bar">
    <button class="add-btn" id="add-shift-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Lisa vahetus
    </button>
  </div>
  ${buildCalendar()}
  ${buildSwapRequests()}`;
}

function buildCalendar() {
  const y = state.year, m = state.month;
  const firstDow = new Date(y, m, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const dim = new Date(y, m+1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();

  let cells = '';

  for (let i = 0; i < offset; i++) {
    cells += `<div class="cal-cell other-month"><div class="day-num">${prevDim - offset + i + 1}</div></div>`;
  }

  for (let d = 1; d <= dim; d++) {
    const isToday = today.getFullYear()===y && today.getMonth()===m && today.getDate()===d;
    const key = shiftKey(y, m, d);
    const dayShifts = state.shifts[key] || [];
    const visible = dayShifts.slice(0, 3);
    const extra = dayShifts.length - 3;

    const pills = visible.map(s => {
      const c = empColor(s.emp);
      return `<span class="shift-pill" style="background:${c.bg};color:${c.text}" data-shiftid="${s.id}" data-key="${key}">${s.emp} ${s.start}</span>`;
    }).join('');

    cells += `<div class="cal-cell${isToday?' today':''}" data-addday="${d}">
      <div class="day-num">${d}</div>
      ${pills}
      ${extra > 0 ? `<span class="more-tag">+${extra} veel</span>` : ''}
    </div>`;
  }

  const total = offset + dim;
  const tail = (7 - total % 7) % 7;
  for (let i = 1; i <= tail; i++) {
    cells += `<div class="cal-cell other-month"><div class="day-num">${i}</div></div>`;
  }

  return `
  <div class="calendar">
    <div class="cal-head">${DAYS.map(d => `<div>${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
  </div>`;
}

function buildSwapRequests() {
  const pending = state.swapRequests.filter(r => r.status === 'pending');
  if (!pending.length) return '';
  return `
  <div class="section-head">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
    Vahetuse taotlused (${pending.length})
  </div>
  ${pending.map(r => `
    <div class="swap-req">
      <div>
        <div class="swap-info">${r.emp} — ${r.fromKey} → ${r.toKey}</div>
        <div class="swap-meta">${r.fromStart}–${r.fromEnd}</div>
      </div>
      <div class="swap-actions">
        <button class="approve" data-approve="${r.id}">✓ Kinnita</button>
        <button class="reject" data-reject="${r.id}">✕ Keeldu</button>
      </div>
    </div>`).join('')}`;
}

// --- WORKER VIEW ---

function buildWorkerView() {
  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const myShifts = [];

  for (let d = 1; d <= dim; d++) {
    const key = shiftKey(y, m, d);
    const s = (state.shifts[key] || []).find(x => x.emp === state.selectedEmployee);
    if (s) myShifts.push({ d, key, s });
  }

  const myReqs = state.swapRequests.filter(r => r.emp === state.selectedEmployee);
  const c = empColor(state.selectedEmployee);

  return `
  <div class="top-bar">
    <select id="emp-select">
      ${EMPLOYEES.map(e => `<option${e===state.selectedEmployee?' selected':''}>${e}</option>`).join('')}
    </select>
    <button class="add-btn" id="req-swap-btn">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
      Taotle vahetust
    </button>
  </div>
  <div class="worker-section">
    ${myShifts.length === 0
      ? `<div class="empty-msg">Sellel kuul vahetusi pole</div>`
      : myShifts.map(({ d, key, s }) => {
          const isToday = today.getFullYear()===y && today.getMonth()===m && today.getDate()===d;
          const dow = new Date(y, m, d).getDay();
          return `<div class="emp-row">
            <div class="emp-date">${DAYS_FULL[dow]}, ${d}. ${MONTHS[m].slice(0,3)}${isToday ? ' <span class="badge badge-info">Täna</span>' : ''}</div>
            <div class="emp-shifts">
              <span class="emp-shift-tag" style="background:${c.bg};color:${c.text}">${s.start} – ${s.end}</span>
            </div>
          </div>`;
        }).join('')
    }
  </div>
  ${myReqs.length > 0 ? `
    <div class="section-head">Minu taotlused</div>
    <div class="worker-section">
      ${myReqs.map(r => `
        <div class="swap-req">
          <div>
            <div class="swap-info">${r.fromKey} → ${r.toKey}</div>
            <div class="swap-meta">${r.fromStart}–${r.fromEnd}</div>
          </div>
          <span class="badge ${r.status==='pending'?'badge-warn':'badge-ok'}">${r.status==='pending'?'Ootel':'Kinnitatud'}</span>
        </div>`).join('')}
    </div>` : ''}`;
}

// --- MODALS ---

function buildModal() {
  const m = state.modal;

  if (m.type === 'add') {
    const defDate = `${state.year}-${String(state.month+1).padStart(2,'0')}-${String(m.day||today.getDate()).padStart(2,'0')}`;
    return `<div class="modal-bg" id="modal-bg">
      <div class="modal">
        <h3>Lisa vahetus</h3>
        <label>Töötaja</label>
        <select id="m-emp">${EMPLOYEES.map(e=>`<option>${e}</option>`).join('')}</select>
        <label>Kuupäev</label>
        <input type="date" id="m-date" value="${defDate}">
        <label>Algus</label>
        <input type="time" id="m-start" value="08:00">
        <label>Lõpp</label>
        <input type="time" id="m-end" value="16:00">
        <div class="modal-actions">
          <button class="btn-secondary" id="modal-cancel">Tühista</button>
          <button class="btn-primary" id="modal-save">Lisa</button>
        </div>
      </div>
    </div>`;
  }

  if (m.type === 'edit') {
    return `<div class="modal-bg" id="modal-bg">
      <div class="modal">
        <h3>${m.shift.emp} — ${m.key}</h3>
        <label>Algus</label>
        <input type="time" id="m-start" value="${m.shift.start}">
        <label>Lõpp</label>
        <input type="time" id="m-end" value="${m.shift.end}">
        <div class="modal-actions">
          <button class="btn-danger" id="modal-delete">Kustuta</button>
          <button class="btn-secondary" id="modal-cancel">Tühista</button>
          <button class="btn-primary" id="modal-save">Salvesta</button>
        </div>
      </div>
    </div>`;
  }

  if (m.type === 'swap') {
    const y = state.year, mo = state.month;
    const dim = new Date(y, mo+1, 0).getDate();
    const myShifts = [];
    for (let d = 1; d <= dim; d++) {
      const key = shiftKey(y, mo, d);
      const s = (state.shifts[key] || []).find(x => x.emp === state.selectedEmployee);
      if (s) myShifts.push({ key, d, s });
    }
    if (!myShifts.length) {
      return `<div class="modal-bg" id="modal-bg">
        <div class="modal">
          <h3>Taotle vahetust</h3>
          <p style="color:var(--text2);font-size:14px;margin-top:0.5rem">Sul pole sellel kuul ühtegi vahetust.</p>
          <div class="modal-actions">
            <button class="btn-secondary" id="modal-cancel">Sulge</button>
          </div>
        </div>
      </div>`;
    }
    const defTo = `${y}-${String(mo+1).padStart(2,'0')}-${String(myShifts[0].d).padStart(2,'0')}`;
    return `<div class="modal-bg" id="modal-bg">
      <div class="modal">
        <h3>Taotle vahetust</h3>
        <label>Minu vahetus (millest)</label>
        <select id="m-from">
          ${myShifts.map(x=>`<option value="${x.key}|${x.s.start}|${x.s.end}|${x.s.id}">${x.d}. ${MONTHS[mo].slice(0,3)} — ${x.s.start}–${x.s.end}</option>`).join('')}
        </select>
        <label>Soovitud kuupäev (millele)</label>
        <input type="date" id="m-todate" value="${defTo}">
        <div class="modal-actions">
          <button class="btn-secondary" id="modal-cancel">Tühista</button>
          <button class="btn-primary" id="modal-save">Saada taotlus</button>
        </div>
      </div>
    </div>`;
  }

  return '';
}

// --- EVENTS ---

function attachEvents() {
  on('prev-month', 'click', () => {
    state.month--;
    if (state.month < 0) { state.month = 11; state.year--; }
    render();
  });

  on('next-month', 'click', () => {
    state.month++;
    if (state.month > 11) { state.month = 0; state.year++; }
    render();
  });

  qsa('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view;
    render();
  }));

  on('add-shift-btn', 'click', () => {
    state.modal = { type: 'add', day: today.getDate() };
    render();
  });

  qsa('[data-addday]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('[data-shiftid]')) return;
      state.modal = { type: 'add', day: parseInt(cell.dataset.addday) };
      render();
    });
  });

  qsa('[data-shiftid]').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const key = pill.dataset.key;
      const id = pill.dataset.shiftid;
      const shift = (state.shifts[key] || []).find(s => s.id === id);
      if (shift) { state.modal = { type: 'edit', key, shift }; render(); }
    });
  });

  qsa('[data-approve]').forEach(b => b.addEventListener('click', () => {
    const r = state.swapRequests.find(x => x.id === b.dataset.approve);
    if (r) { r.status = 'approved'; save(); render(); }
  }));

  qsa('[data-reject]').forEach(b => b.addEventListener('click', () => {
    state.swapRequests = state.swapRequests.filter(x => x.id !== b.dataset.reject);
    save(); render();
  }));

  on('emp-select', 'change', e => {
    state.selectedEmployee = e.target.value;
    render();
  });

  on('req-swap-btn', 'click', () => {
    state.modal = { type: 'swap' };
    render();
  });

  // Modal close on bg click
  const bg = document.getElementById('modal-bg');
  if (bg) bg.addEventListener('click', e => {
    if (e.target === bg) { state.modal = null; render(); }
  });

  on('modal-cancel', 'click', () => { state.modal = null; render(); });

  on('modal-save', 'click', () => {
    const m = state.modal;

    if (m.type === 'add') {
      const emp = document.getElementById('m-emp').value;
      const dateVal = document.getElementById('m-date').value;
      const start = document.getElementById('m-start').value;
      const end = document.getElementById('m-end').value;
      if (!dateVal || !start || !end) return;
      const [y, mo, d] = dateVal.split('-').map(Number);
      const key = shiftKey(y, mo-1, d);
      if (!state.shifts[key]) state.shifts[key] = [];
      // Prevent duplicate employee on same day
      if (!state.shifts[key].find(s => s.emp === emp)) {
        state.shifts[key].push({ emp, start, end, id: uid() });
      } else {
        // Update existing
        const existing = state.shifts[key].find(s => s.emp === emp);
        existing.start = start; existing.end = end;
      }
      state.year = y; state.month = mo - 1;

    } else if (m.type === 'edit') {
      const start = document.getElementById('m-start').value;
      const end = document.getElementById('m-end').value;
      const s = (state.shifts[m.key] || []).find(x => x.id === m.shift.id);
      if (s) { s.start = start; s.end = end; }

    } else if (m.type === 'swap') {
      const fromEl = document.getElementById('m-from');
      const toDateEl = document.getElementById('m-todate');
      if (!fromEl || !toDateEl) return;
      const [fromKey, fromStart, fromEnd] = fromEl.value.split('|');
      const toDateVal = toDateEl.value;
      if (!toDateVal) return;
      const [y, mo, d] = toDateVal.split('-').map(Number);
      const toKey = shiftKey(y, mo-1, d);
      state.swapRequests.push({
        id: uid(),
        emp: state.selectedEmployee,
        fromKey, fromStart, fromEnd,
        toKey,
        status: 'pending'
      });
    }

    save();
    state.modal = null;
    render();
  });

  on('modal-delete', 'click', () => {
    const m = state.modal;
    if (state.shifts[m.key]) {
      state.shifts[m.key] = state.shifts[m.key].filter(s => s.id !== m.shift.id);
    }
    save();
    state.modal = null;
    render();
  });
}

function on(id, event, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, fn);
}

function qsa(sel) {
  return Array.from(document.querySelectorAll(sel));
}

// --- INIT ---
load();
if (Object.keys(state.shifts).length === 0) initDemoShifts();
render();
