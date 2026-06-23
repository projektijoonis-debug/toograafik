'use strict';

const MONTHS = ['Jaanuar','Veebruar','Märts','Aprill','Mai','Juuni',
  'Juuli','August','September','Oktoober','November','Detsember'];
const DAYS = ['E','T','K','N','R','L','P'];
const DAYS_FULL = ['Pühapäev','Esmaspäev','Teisipäev','Kolmapäev','Neljapäev','Reede','Laupäev'];

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

const today = new Date();

let state = {
  view: 'manager',
  year: today.getFullYear(),
  month: today.getMonth(),
  shifts: {},
  swapRequests: [],
  modal: null,
  selectedEmployee: null,
  employees: ['Mari','Jaan','Kati','Toomas','Anna','Liis','Peeter','Siim','Eva','Maret'],
};

// ---- UTILS ----

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function shiftKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function empColor(emp) {
  const idx = state.employees.indexOf(emp);
  return COLORS[(idx < 0 ? 0 : idx) % COLORS.length];
}

// ---- PERSIST ----

function save() {
  try {
    localStorage.setItem('g_shifts', JSON.stringify(state.shifts));
    localStorage.setItem('g_swaps', JSON.stringify(state.swapRequests));
    localStorage.setItem('g_employees', JSON.stringify(state.employees));
  } catch(e) {}
}

function load() {
  try {
    const s = localStorage.getItem('g_shifts');
    const w = localStorage.getItem('g_swaps');
    const e = localStorage.getItem('g_employees');
    if (s) state.shifts = JSON.parse(s);
    if (w) state.swapRequests = JSON.parse(w);
    if (e) state.employees = JSON.parse(e);
  } catch(e) {}
  if (!state.selectedEmployee || !state.employees.includes(state.selectedEmployee)) {
    state.selectedEmployee = state.employees[0] || null;
  }
}

function initDemo() {
  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const pairs = [
    ['Mari','08:00','16:00'],['Jaan','16:00','00:00'],['Kati','08:00','16:00'],
    ['Toomas','12:00','20:00'],['Anna','08:00','16:00'],['Liis','07:00','15:00'],
  ];
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(y, m, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const key = shiftKey(y, m, d);
    state.shifts[key] = [];
    const count = 2 + Math.floor(Math.random() * 3);
    [...pairs].sort(() => Math.random()-0.5).slice(0, count).forEach(([emp,start,end]) => {
      state.shifts[key].push({emp, start, end, id: uid()});
    });
  }
}

// ---- RENDER ----
// Everything renders into ONE container div so modal buttons are always in the DOM
// when attachEvents() runs.

function render() {
  document.getElementById('app').innerHTML =
    `<div class="app">${buildHeader()}${buildBody()}${state.modal ? buildModal() : ''}</div>`;
  attachEvents();
}

function buildHeader() {
  return `<div class="header">
    <div class="title">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      Töögraafik
    </div>
    <div class="nav">
      <button id="btn-prev">&#8249;</button>
      <span class="month-label">${MONTHS[state.month]} ${state.year}</span>
      <button id="btn-next">&#8250;</button>
    </div>
    <div class="view-toggle">
      <button class="view-btn${state.view==='manager'?' active':''}" data-view="manager">Juht</button>
      <button class="view-btn${state.view==='worker'?' active':''}" data-view="worker">Töötaja</button>
    </div>
  </div>`;
}

function buildBody() {
  return state.view === 'manager' ? buildManagerView() : buildWorkerView();
}

// ---- MANAGER ----

function buildManagerView() {
  return `
  <div class="top-bar">
    <button class="add-btn" id="btn-add-shift">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Lisa vahetus
    </button>
    <button class="add-btn" id="btn-manage-emp" style="background:var(--bg2);color:var(--text);border:0.5px solid var(--border2);">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      Töötajad (${state.employees.length})
    </button>
  </div>
  ${buildCalendar()}
  ${buildSwapSection()}`;
}

function buildCalendar() {
  const y = state.year, m = state.month;
  const firstDow = new Date(y, m, 1).getDay();
  const offset = firstDow === 0 ? 6 : firstDow - 1;
  const dim = new Date(y, m+1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();
  let cells = '';

  for (let i = 0; i < offset; i++) {
    cells += `<div class="cal-cell other-month"><div class="day-num">${prevDim-offset+i+1}</div></div>`;
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
      <div class="day-num">${d}</div>${pills}
      ${extra > 0 ? `<span class="more-tag">+${extra} veel</span>` : ''}
    </div>`;
  }
  const tail = (7 - (offset+dim)%7) % 7;
  for (let i = 1; i <= tail; i++) {
    cells += `<div class="cal-cell other-month"><div class="day-num">${i}</div></div>`;
  }
  return `<div class="calendar">
    <div class="cal-head">${DAYS.map(d=>`<div>${d}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
  </div>`;
}

function buildSwapSection() {
  const pending = state.swapRequests.filter(r => r.status === 'pending');
  if (!pending.length) return '';
  return `<div class="section-head">Vahetuse taotlused (${pending.length})</div>
  ${pending.map(r => `<div class="swap-req">
    <div>
      <div class="swap-info">${r.emp} &mdash; ${r.fromKey} &rarr; ${r.toKey}</div>
      <div class="swap-meta">${r.fromStart}&ndash;${r.fromEnd}</div>
    </div>
    <div class="swap-actions">
      <button class="approve" data-approve="${r.id}">✓ Kinnita</button>
      <button class="reject" data-reject="${r.id}">✕ Keeldu</button>
    </div>
  </div>`).join('')}`;
}

// ---- WORKER ----

function buildWorkerView() {
  if (!state.employees.length) {
    return `<div class="empty-msg">Töötajaid pole lisatud. Juhi vaates lisa töötajaid.</div>`;
  }
  const emp = state.selectedEmployee || state.employees[0];
  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const myShifts = [];
  for (let d = 1; d <= dim; d++) {
    const key = shiftKey(y, m, d);
    const s = (state.shifts[key]||[]).find(x => x.emp === emp);
    if (s) myShifts.push({d, key, s});
  }
  const c = empColor(emp);
  const myReqs = state.swapRequests.filter(r => r.emp === emp);

  return `<div class="top-bar">
    <select id="emp-select">
      ${state.employees.map(e => `<option${e===emp?' selected':''}>${e}</option>`).join('')}
    </select>
    <button class="add-btn" id="btn-req-swap">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
      </svg>
      Taotle vahetust
    </button>
  </div>
  <div class="worker-section">
    ${myShifts.length === 0
      ? `<div class="empty-msg">Sellel kuul vahetusi pole</div>`
      : myShifts.map(({d, s}) => {
          const isToday = today.getFullYear()===y && today.getMonth()===m && today.getDate()===d;
          const dow = new Date(y,m,d).getDay();
          return `<div class="emp-row">
            <div class="emp-date">${DAYS_FULL[dow]}, ${d}. ${MONTHS[m].slice(0,3)}${isToday?' <span class="badge badge-info">Täna</span>':''}</div>
            <div class="emp-shifts"><span class="emp-shift-tag" style="background:${c.bg};color:${c.text}">${s.start} &ndash; ${s.end}</span></div>
          </div>`;
        }).join('')}
  </div>
  ${myReqs.length ? `<div class="section-head">Minu taotlused</div>
  <div class="worker-section">
    ${myReqs.map(r => `<div class="swap-req">
      <div><div class="swap-info">${r.fromKey} &rarr; ${r.toKey}</div><div class="swap-meta">${r.fromStart}&ndash;${r.fromEnd}</div></div>
      <span class="badge ${r.status==='pending'?'badge-warn':'badge-ok'}">${r.status==='pending'?'Ootel':'Kinnitatud'}</span>
    </div>`).join('')}
  </div>` : ''}`;
}

// ---- MODALS ----

function buildModal() {
  const m = state.modal;

  if (m.type === 'add') {
    const defDate = `${state.year}-${String(state.month+1).padStart(2,'0')}-${String(m.day||today.getDate()).padStart(2,'0')}`;
    return `<div class="modal-bg" id="modal-bg">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Lisa vahetus</h3>
        <label for="m-emp">Töötaja</label>
        <select id="m-emp">
          ${state.employees.map(e=>`<option>${e}</option>`).join('')}
        </select>
        <label for="m-date">Kuupäev</label>
        <input type="date" id="m-date" value="${defDate}">
        <label for="m-start">Algus</label>
        <input type="time" id="m-start" value="08:00">
        <label for="m-end">Lõpp</label>
        <input type="time" id="m-end" value="16:00">
        <div class="modal-actions">
          <button class="btn-secondary" id="btn-cancel">Tühista</button>
          <button class="btn-primary" id="btn-save">Lisa</button>
        </div>
      </div>
    </div>`;
  }

  if (m.type === 'edit') {
    return `<div class="modal-bg" id="modal-bg">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>${m.shift.emp} &mdash; ${m.key}</h3>
        <label for="m-start">Algus</label>
        <input type="time" id="m-start" value="${m.shift.start}">
        <label for="m-end">Lõpp</label>
        <input type="time" id="m-end" value="${m.shift.end}">
        <div class="modal-actions">
          <button class="btn-danger" id="btn-delete">Kustuta</button>
          <button class="btn-secondary" id="btn-cancel">Tühista</button>
          <button class="btn-primary" id="btn-save">Salvesta</button>
        </div>
      </div>
    </div>`;
  }

  if (m.type === 'swap') {
    const y = state.year, mo = state.month;
    const dim = new Date(y, mo+1, 0).getDate();
    const emp = state.selectedEmployee || state.employees[0];
    const myShifts = [];
    for (let d = 1; d <= dim; d++) {
      const key = shiftKey(y, mo, d);
      const s = (state.shifts[key]||[]).find(x => x.emp === emp);
      if (s) myShifts.push({key, d, s});
    }
    if (!myShifts.length) {
      return `<div class="modal-bg" id="modal-bg">
        <div class="modal" role="dialog" aria-modal="true">
          <h3>Taotle vahetust</h3>
          <p style="color:var(--text2);font-size:14px;margin-top:0.5rem">Sul pole sellel kuul ühtegi vahetust, mida vahetada.</p>
          <div class="modal-actions">
            <button class="btn-secondary" id="btn-cancel">Sulge</button>
          </div>
        </div>
      </div>`;
    }
    const defTo = `${y}-${String(mo+1).padStart(2,'0')}-${String(myShifts[0].d).padStart(2,'0')}`;
    return `<div class="modal-bg" id="modal-bg">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Taotle vahetust</h3>
        <label for="m-from">Minu vahetus (millest)</label>
        <select id="m-from">
          ${myShifts.map(x=>`<option value="${x.key}|${x.s.start}|${x.s.end}">${x.d}. ${MONTHS[mo].slice(0,3)} &mdash; ${x.s.start}&ndash;${x.s.end}</option>`).join('')}
        </select>
        <label for="m-todate">Soovitud kuupäev (millele)</label>
        <input type="date" id="m-todate" value="${defTo}">
        <div class="modal-actions">
          <button class="btn-secondary" id="btn-cancel">Tühista</button>
          <button class="btn-primary" id="btn-save">Saada taotlus</button>
        </div>
      </div>
    </div>`;
  }

  if (m.type === 'employees') {
    return `<div class="modal-bg" id="modal-bg">
      <div class="modal" role="dialog" aria-modal="true">
        <h3>Töötajate haldus</h3>
        <div id="emp-list" style="margin-bottom:12px">
          ${state.employees.map((e,i) => `<div class="emp-list-row">
            <span style="font-size:14px;color:var(--text);flex:1">${e}</span>
            <button class="btn-icon" data-remove-emp="${i}" title="Kustuta">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>`).join('')}
        </div>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="text" id="new-emp-name" placeholder="Uus nimi..." style="flex:1">
          <button class="btn-primary" id="btn-add-emp" style="white-space:nowrap">Lisa</button>
        </div>
        <div class="modal-actions">
          <button class="btn-secondary" id="btn-cancel">Sulge</button>
        </div>
      </div>
    </div>`;
  }

  return '';
}

// ---- EVENTS ----

function attachEvents() {
  // Navigation
  ge('btn-prev')?.addEventListener('click', () => {
    state.month--; if (state.month < 0) { state.month = 11; state.year--; } render();
  });
  ge('btn-next')?.addEventListener('click', () => {
    state.month++; if (state.month > 11) { state.month = 0; state.year++; } render();
  });

  // View toggle
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view; render();
  }));

  // Manager buttons
  ge('btn-add-shift')?.addEventListener('click', () => {
    state.modal = {type:'add', day:today.getDate()}; render();
  });
  ge('btn-manage-emp')?.addEventListener('click', () => {
    state.modal = {type:'employees'}; render();
  });

  // Calendar cells
  document.querySelectorAll('[data-addday]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('[data-shiftid]')) return;
      state.modal = {type:'add', day:parseInt(cell.dataset.addday)}; render();
    });
  });

  // Shift pills
  document.querySelectorAll('[data-shiftid]').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const key = pill.dataset.key;
      const id = pill.dataset.shiftid;
      const shift = (state.shifts[key]||[]).find(s => s.id === id);
      if (shift) { state.modal = {type:'edit', key, shift}; render(); }
    });
  });

  // Swap approve/reject
  document.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
    const r = state.swapRequests.find(x => x.id === b.dataset.approve);
    if (r) { r.status = 'approved'; save(); render(); }
  }));
  document.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
    state.swapRequests = state.swapRequests.filter(x => x.id !== b.dataset.reject);
    save(); render();
  }));

  // Worker employee selector
  ge('emp-select')?.addEventListener('change', e => {
    state.selectedEmployee = e.target.value; render();
  });
  ge('btn-req-swap')?.addEventListener('click', () => {
    state.modal = {type:'swap'}; render();
  });

  // Modal background click to close
  ge('modal-bg')?.addEventListener('click', e => {
    if (e.target === ge('modal-bg')) { state.modal = null; render(); }
  });

  // Modal cancel
  ge('btn-cancel')?.addEventListener('click', () => { state.modal = null; render(); });

  // Modal delete
  ge('btn-delete')?.addEventListener('click', () => {
    const m = state.modal;
    if (state.shifts[m.key]) {
      state.shifts[m.key] = state.shifts[m.key].filter(s => s.id !== m.shift.id);
    }
    save(); state.modal = null; render();
  });

  // Modal save
  ge('btn-save')?.addEventListener('click', () => {
    const m = state.modal;

    if (m.type === 'add') {
      const emp = ge('m-emp').value;
      const dateVal = ge('m-date').value;
      const start = ge('m-start').value;
      const end = ge('m-end').value;
      if (!dateVal || !start || !end) return;
      const [y, mo, d] = dateVal.split('-').map(Number);
      const key = shiftKey(y, mo-1, d);
      if (!state.shifts[key]) state.shifts[key] = [];
      const existing = state.shifts[key].find(s => s.emp === emp);
      if (existing) { existing.start = start; existing.end = end; }
      else { state.shifts[key].push({emp, start, end, id:uid()}); }
      state.year = y; state.month = mo-1;

    } else if (m.type === 'edit') {
      const start = ge('m-start').value;
      const end = ge('m-end').value;
      const s = (state.shifts[m.key]||[]).find(x => x.id === m.shift.id);
      if (s) { s.start = start; s.end = end; }

    } else if (m.type === 'swap') {
      const fromVal = ge('m-from').value;
      const toDateVal = ge('m-todate').value;
      if (!fromVal || !toDateVal) return;
      const [fromKey, fromStart, fromEnd] = fromVal.split('|');
      const [y, mo, d] = toDateVal.split('-').map(Number);
      const toKey = shiftKey(y, mo-1, d);
      const emp = state.selectedEmployee || state.employees[0];
      state.swapRequests.push({id:uid(), emp, fromKey, fromStart, fromEnd, toKey, status:'pending'});
    }

    save(); state.modal = null; render();
  });

  // Employees modal — add new employee
  ge('btn-add-emp')?.addEventListener('click', () => {
    const input = ge('new-emp-name');
    const name = input.value.trim();
    if (!name) return;
    if (state.employees.includes(name)) { input.style.borderColor='red'; return; }
    state.employees.push(name);
    if (!state.selectedEmployee) state.selectedEmployee = name;
    save();
    // Re-render just the modal content without closing it
    state.modal = {type:'employees'};
    render();
  });

  // Employees modal — allow Enter key
  ge('new-emp-name')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') ge('btn-add-emp')?.click();
  });

  // Employees modal — remove employee buttons
  document.querySelectorAll('[data-remove-emp]').forEach(b => {
    b.addEventListener('click', () => {
      const idx = parseInt(b.dataset.removeEmp);
      const removed = state.employees[idx];
      state.employees.splice(idx, 1);
      if (state.selectedEmployee === removed) {
        state.selectedEmployee = state.employees[0] || null;
      }
      // Remove their shifts too
      Object.keys(state.shifts).forEach(key => {
        state.shifts[key] = state.shifts[key].filter(s => s.emp !== removed);
      });
      save();
      state.modal = {type:'employees'};
      render();
    });
  });
}

function ge(id) { return document.getElementById(id); }

// ---- INIT ----
load();
if (Object.keys(state.shifts).length === 0) initDemo();
render();
