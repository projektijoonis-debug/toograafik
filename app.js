'use strict';

// ================================================================
// FIREBASE CONFIG — asenda need väärtused oma Firebase projektiga
// ================================================================
const FIREBASE_CONFIG = {
  apiKey:            "ASENDA_API_KEY",
  authDomain:        "ASENDA_PROJECT_ID.firebaseapp.com",
  databaseURL:       "https://ASENDA_PROJECT_ID-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "ASENDA_PROJECT_ID",
  storageBucket:     "ASENDA_PROJECT_ID.appspot.com",
  messagingSenderId: "ASENDA_MESSAGING_SENDER_ID",
  appId:             "ASENDA_APP_ID"
};
// ================================================================

const MONTHS = ['Jaanuar','Veebruar','Märts','Aprill','Mai','Juuni',
  'Juuli','August','September','Oktoober','November','Detsember'];
const DAYS = ['E','T','K','N','R','L','P'];
const DAYS_FULL = ['Pühapäev','Esmaspäev','Teisipäev','Kolmapäev','Neljapäev','Reede','Laupäev'];
const PRESET_COLORS = [
  '#378ADD','#3B9E5A','#E07B2A','#9B59B6','#E84393',
  '#16A085','#C0392B','#2C3E50','#F39C12','#1ABC9C'
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
  employees: [],
  locations: [],
  syncing: false,
  loaded: false,
};

// ---- FIREBASE ----
let db = null;

function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    db = firebase.database();
    startListeners();
  } catch(e) {
    console.error('Firebase init error:', e);
    showError('Firebase ühendus ebaõnnestus. Kontrolli config väärtusi app.js failis.');
  }
}

function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return Object.values(val).filter(Boolean);
}

function startListeners() {
  db.ref('/').on('value', snapshot => {
    try {
      const data = snapshot.val() || {};

      state.shifts = data.shifts || {};
      Object.keys(state.shifts).forEach(k => {
        state.shifts[k] = toArray(state.shifts[k]);
      });

      state.swapRequests = toArray(data.swapRequests);

      const emp = toArray(data.employees);
      state.employees = emp.length > 0 ? emp : ['Mari','Jaan','Kati','Toomas','Anna','Liis','Peeter','Siim','Eva','Maret'];

      const loc = toArray(data.locations);
      state.locations = loc.length > 0 ? loc : [
        {id:'loc1', name:'Kauplus A', color:'#378ADD'},
        {id:'loc2', name:'Ladu',      color:'#3B9E5A'},
        {id:'loc3', name:'Kontor',    color:'#E07B2A'},
      ];

      if (!state.selectedEmployee || !state.employees.includes(state.selectedEmployee)) {
        state.selectedEmployee = state.employees[0] || null;
      }

      if (!state.loaded) {
        state.loaded = true;
        if (Object.keys(state.shifts).length === 0) {
          initDemo();
          pushAll();
        }
      }

      state.syncing = false;
      render();
    } catch(e) {
      showError('Andmete toötlemisel tekkis viga: ' + e.message);
    }
  }, err => {
    showError('Firebase uhendus ebaonnestus: ' + err.message);
  });
}
function pushAll() {
  if (!db) return;
  state.syncing = true;
  // Convert swapRequests array to object for Firebase
  const swapObj = {};
  state.swapRequests.forEach(r => { swapObj[r.id] = r; });
  db.ref('/').set({
    shifts:       state.shifts,
    swapRequests: swapObj,
    employees:    state.employees,
    locations:    state.locations,
  }).catch(e => showError('Salvestamine ebaõnnestus: ' + e.message));
}

function showError(msg) {
  document.getElementById('app').innerHTML =
    `<div class="app"><div style="padding:2rem;text-align:center;color:#C0392B;font-size:14px">
      <strong>Viga:</strong> ${msg}
    </div></div>`;
}

// ---- UTILS ----
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function shiftKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function getLocation(id) { return state.locations.find(l => l.id === id); }
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}
function lightBg(hex) {
  const {r,g,b} = hexToRgb(hex);
  return `rgba(${r},${g},${b},0.13)`;
}

function initDemo() {
  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const locIds = state.locations.map(l => l.id);
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
      const locId = locIds[Math.floor(Math.random()*locIds.length)];
      state.shifts[key].push({emp, start, end, locId, id: uid()});
    });
  }
}

// ---- RENDER ----
function render() {
  if (!state.loaded) {
    document.getElementById('app').innerHTML =
      `<div class="app"><div style="padding:3rem;text-align:center;color:var(--text3);font-size:14px">
        <div class="spinner"></div>
        Laen andmeid...
      </div></div>`;
    return;
  }
  document.getElementById('app').innerHTML =
    `<div class="app">${buildHeader()}${buildBody()}${state.modal ? buildModal() : ''}</div>`;
  attachEvents();
}

function buildHeader() {
  const syncDot = state.syncing
    ? `<span class="sync-dot syncing" title="Salvestab..."></span>`
    : `<span class="sync-dot ok" title="Sünkroonitud"></span>`;
  return `<div class="header">
    <div class="title">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      Töögraafik ${syncDot}
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

function buildLegend() {
  if (!state.locations.length) return '';
  return `<div class="legend">
    ${state.locations.map(l => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${l.color}"></span>
        <span class="legend-name">${l.name}</span>
      </div>`).join('')}
  </div>`;
}

function buildManagerView() {
  return `
  <div class="top-bar">
    <button class="add-btn" id="btn-add-shift">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
      </svg>
      Lisa vahetus
    </button>
    <button class="secondary-btn" id="btn-manage-emp">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      Töötajad
    </button>
    <button class="secondary-btn" id="btn-manage-loc">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
        <circle cx="12" cy="9" r="2.5"/>
      </svg>
      Töökohad
    </button>
  </div>
  ${buildLegend()}
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
      const loc = getLocation(s.locId);
      const bg = loc ? lightBg(loc.color) : 'var(--bg2)';
      const border = loc ? loc.color : 'var(--border2)';
      const text = loc ? loc.color : 'var(--text2)';
      return `<span class="shift-pill" style="background:${bg};color:${text};border-left:3px solid ${border}" data-shiftid="${s.id}" data-key="${key}">${s.emp} ${s.start}</span>`;
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

function buildWorkerView() {
  if (!state.employees.length) return `<div class="empty-msg">Töötajaid pole lisatud.</div>`;
  const emp = state.selectedEmployee || state.employees[0];
  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const myShifts = [];
  for (let d = 1; d <= dim; d++) {
    const key = shiftKey(y, m, d);
    const s = (state.shifts[key]||[]).find(x => x.emp === emp);
    if (s) myShifts.push({d, key, s});
  }
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
          const loc = getLocation(s.locId);
          const bg = loc ? lightBg(loc.color) : 'var(--bg2)';
          const border = loc ? loc.color : 'var(--border2)';
          const textCol = loc ? loc.color : 'var(--text2)';
          return `<div class="emp-row">
            <div class="emp-date">${DAYS_FULL[dow]}, ${d}. ${MONTHS[m].slice(0,3)}${isToday?' <span class="badge badge-info">Täna</span>':''}</div>
            <div class="emp-shifts">
              <span class="emp-shift-tag" style="background:${bg};color:${textCol};border-left:3px solid ${border}">
                ${s.start}&ndash;${s.end}${loc ? ` &bull; ${loc.name}` : ''}
              </span>
            </div>
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
function locOptions(selectedId) {
  if (!state.locations.length) return `<option value="">-- Lisa esmalt töökohad --</option>`;
  return state.locations.map(l =>
    `<option value="${l.id}"${l.id===selectedId?' selected':''}>${l.name}</option>`
  ).join('');
}

function buildModal() {
  const m = state.modal;

  if (m.type === 'add') {
    const defDate = `${state.year}-${String(state.month+1).padStart(2,'0')}-${String(m.day||today.getDate()).padStart(2,'0')}`;
    const defLoc = state.locations[0]?.id || '';
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Lisa vahetus</h3>
      <label>Töötaja</label>
      <select id="m-emp">${state.employees.map(e=>`<option>${e}</option>`).join('')}</select>
      <label>Kuupäev</label>
      <input type="date" id="m-date" value="${defDate}">
      <label>Töökoht</label>
      <select id="m-loc">${locOptions(defLoc)}</select>
      <label>Algus</label>
      <input type="time" id="m-start" value="08:00">
      <label>Lõpp</label>
      <input type="time" id="m-end" value="16:00">
      <div class="modal-actions">
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save">Lisa</button>
      </div>
    </div></div>`;
  }

  if (m.type === 'edit') {
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>${m.shift.emp} &mdash; ${m.key}</h3>
      <label>Töökoht</label>
      <select id="m-loc">${locOptions(m.shift.locId)}</select>
      <label>Algus</label>
      <input type="time" id="m-start" value="${m.shift.start}">
      <label>Lõpp</label>
      <input type="time" id="m-end" value="${m.shift.end}">
      <div class="modal-actions">
        <button class="btn-danger" id="btn-delete">Kustuta</button>
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save">Salvesta</button>
      </div>
    </div></div>`;
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
      return `<div class="modal-bg" id="modal-bg"><div class="modal">
        <h3>Taotle vahetust</h3>
        <p style="color:var(--text2);font-size:14px;margin-top:0.5rem">Sul pole sellel kuul ühtegi vahetust.</p>
        <div class="modal-actions"><button class="btn-secondary" id="btn-cancel">Sulge</button></div>
      </div></div>`;
    }
    const defTo = `${y}-${String(mo+1).padStart(2,'0')}-${String(myShifts[0].d).padStart(2,'0')}`;
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Taotle vahetust</h3>
      <label>Minu vahetus (millest)</label>
      <select id="m-from">
        ${myShifts.map(x=>`<option value="${x.key}|${x.s.start}|${x.s.end}">${x.d}. ${MONTHS[mo].slice(0,3)} &mdash; ${x.s.start}&ndash;${x.s.end}</option>`).join('')}
      </select>
      <label>Soovitud kuupäev (millele)</label>
      <input type="date" id="m-todate" value="${defTo}">
      <div class="modal-actions">
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save">Saada taotlus</button>
      </div>
    </div></div>`;
  }

  if (m.type === 'employees') {
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Töötajad</h3>
      <div class="list-scroll">
        ${state.employees.map((e,i) => `<div class="list-row">
          <span class="list-row-name">${e}</span>
          <button class="btn-icon" data-remove-emp="${i}" title="Kustuta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>`).join('')}
      </div>
      <div class="inline-add">
        <input type="text" id="new-emp-name" placeholder="Uus nimi...">
        <button class="btn-primary" id="btn-add-emp">Lisa</button>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" id="btn-cancel">Sulge</button>
      </div>
    </div></div>`;
  }

  if (m.type === 'locations') {
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Töökohad</h3>
      <div class="list-scroll">
        ${state.locations.map((l,i) => `<div class="list-row">
          <span class="loc-dot" style="background:${l.color}"></span>
          <span class="list-row-name">${l.name}</span>
          <button class="btn-icon" data-edit-loc="${i}" title="Muuda">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn-icon" data-remove-loc="${i}" title="Kustuta">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>`).join('')}
      </div>
      <div class="inline-add">
        <input type="text" id="new-loc-name" placeholder="Uus töökoht...">
        <input type="color" id="new-loc-color" value="${PRESET_COLORS[state.locations.length % PRESET_COLORS.length]}" style="width:40px;height:36px;padding:2px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border2)">
        <button class="btn-primary" id="btn-add-loc">Lisa</button>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" id="btn-cancel">Sulge</button>
      </div>
    </div></div>`;
  }

  if (m.type === 'edit-location') {
    const loc = state.locations[m.idx];
    if (!loc) return '';
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Muuda töökohta</h3>
      <label>Nimi</label>
      <input type="text" id="edit-loc-name" value="${loc.name}">
      <label>Värv</label>
      <div style="display:flex;align-items:center;gap:12px;margin-top:6px">
        <input type="color" id="edit-loc-color" value="${loc.color}" style="width:56px;height:40px;padding:2px;border-radius:8px;cursor:pointer;border:0.5px solid var(--border2)">
        <div class="color-presets">
          ${PRESET_COLORS.map(c => `<button class="preset-dot${loc.color===c?' selected':''}" style="background:${c}" data-preset="${c}"></button>`).join('')}
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save">Salvesta</button>
      </div>
    </div></div>`;
  }

  return '';
}

// ---- EVENTS ----
function attachEvents() {
  ge('btn-prev')?.addEventListener('click', () => {
    state.month--; if (state.month < 0) { state.month=11; state.year--; } render();
  });
  ge('btn-next')?.addEventListener('click', () => {
    state.month++; if (state.month > 11) { state.month=0; state.year++; } render();
  });
  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    state.view = b.dataset.view; render();
  }));

  ge('btn-add-shift')?.addEventListener('click', () => {
    state.modal = {type:'add', day:today.getDate()}; render();
  });
  ge('btn-manage-emp')?.addEventListener('click', () => {
    state.modal = {type:'employees'}; render();
  });
  ge('btn-manage-loc')?.addEventListener('click', () => {
    state.modal = {type:'locations'}; render();
  });

  document.querySelectorAll('[data-addday]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('[data-shiftid]')) return;
      state.modal = {type:'add', day:parseInt(cell.dataset.addday)}; render();
    });
  });
  document.querySelectorAll('[data-shiftid]').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const key = pill.dataset.key;
      const shift = (state.shifts[key]||[]).find(s => s.id === pill.dataset.shiftid);
      if (shift) { state.modal = {type:'edit', key, shift}; render(); }
    });
  });

  document.querySelectorAll('[data-approve]').forEach(b => b.addEventListener('click', () => {
    const r = state.swapRequests.find(x => x.id === b.dataset.approve);
    if (r) { r.status='approved'; pushAll(); }
  }));
  document.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
    state.swapRequests = state.swapRequests.filter(x => x.id !== b.dataset.reject);
    pushAll();
  }));

  ge('emp-select')?.addEventListener('change', e => {
    state.selectedEmployee = e.target.value; render();
  });
  ge('btn-req-swap')?.addEventListener('click', () => {
    state.modal = {type:'swap'}; render();
  });

  ge('modal-bg')?.addEventListener('click', e => {
    if (e.target === ge('modal-bg')) { state.modal=null; render(); }
  });
  ge('btn-cancel')?.addEventListener('click', () => { state.modal=null; render(); });

  ge('btn-delete')?.addEventListener('click', () => {
    const m = state.modal;
    if (state.shifts[m.key]) state.shifts[m.key] = state.shifts[m.key].filter(s => s.id !== m.shift.id);
    state.modal=null; pushAll();
  });

  ge('btn-save')?.addEventListener('click', () => {
    const m = state.modal;
    if (m.type === 'add') {
      const emp = ge('m-emp').value;
      const dateVal = ge('m-date').value;
      const locId = ge('m-loc')?.value || '';
      const start = ge('m-start').value;
      const end = ge('m-end').value;
      if (!dateVal || !start || !end) return;
      const [y,mo,d] = dateVal.split('-').map(Number);
      const key = shiftKey(y, mo-1, d);
      if (!state.shifts[key]) state.shifts[key] = [];
      const existing = state.shifts[key].find(s => s.emp === emp);
      if (existing) { existing.start=start; existing.end=end; existing.locId=locId; }
      else state.shifts[key].push({emp, start, end, locId, id:uid()});
      state.year=y; state.month=mo-1;
    } else if (m.type === 'edit') {
      const locId = ge('m-loc')?.value || '';
      const start = ge('m-start').value;
      const end = ge('m-end').value;
      const s = (state.shifts[m.key]||[]).find(x => x.id === m.shift.id);
      if (s) { s.start=start; s.end=end; s.locId=locId; }
    } else if (m.type === 'swap') {
      const fromVal = ge('m-from').value;
      const toDateVal = ge('m-todate').value;
      if (!fromVal || !toDateVal) return;
      const [fromKey,fromStart,fromEnd] = fromVal.split('|');
      const [y,mo,d] = toDateVal.split('-').map(Number);
      const toKey = shiftKey(y, mo-1, d);
      const emp = state.selectedEmployee || state.employees[0];
      state.swapRequests.push({id:uid(), emp, fromKey, fromStart, fromEnd, toKey, status:'pending'});
    } else if (m.type === 'edit-location') {
      const name = ge('edit-loc-name').value.trim();
      const color = ge('edit-loc-color').value;
      if (!name) return;
      state.locations[m.idx].name = name;
      state.locations[m.idx].color = color;
      state.modal = {type:'locations'};
      pushAll(); return;
    }
    state.modal=null; pushAll();
  });

  document.querySelectorAll('[data-preset]').forEach(dot => {
    dot.addEventListener('click', () => {
      const ci = ge('edit-loc-color');
      if (ci) {
        ci.value = dot.dataset.preset;
        document.querySelectorAll('.preset-dot').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
      }
    });
  });

  ge('btn-add-emp')?.addEventListener('click', () => {
    const input = ge('new-emp-name');
    const name = input.value.trim();
    if (!name || state.employees.includes(name)) { input.style.borderColor='red'; return; }
    state.employees.push(name);
    if (!state.selectedEmployee) state.selectedEmployee = name;
    state.modal={type:'employees'}; pushAll();
  });
  ge('new-emp-name')?.addEventListener('keydown', e => { if(e.key==='Enter') ge('btn-add-emp')?.click(); });

  document.querySelectorAll('[data-remove-emp]').forEach(b => {
    b.addEventListener('click', () => {
      const idx = parseInt(b.dataset.removeEmp);
      const removed = state.employees[idx];
      state.employees.splice(idx, 1);
      if (state.selectedEmployee === removed) state.selectedEmployee = state.employees[0]||null;
      Object.keys(state.shifts).forEach(key => {
        state.shifts[key] = state.shifts[key].filter(s => s.emp !== removed);
      });
      state.modal={type:'employees'}; pushAll();
    });
  });

  ge('btn-add-loc')?.addEventListener('click', () => {
    const nameInput = ge('new-loc-name');
    const color = ge('new-loc-color').value;
    const name = nameInput.value.trim();
    if (!name) { nameInput.style.borderColor='red'; return; }
    state.locations.push({id:uid(), name, color});
    state.modal={type:'locations'}; pushAll();
  });
  ge('new-loc-name')?.addEventListener('keydown', e => { if(e.key==='Enter') ge('btn-add-loc')?.click(); });

  document.querySelectorAll('[data-remove-loc]').forEach(b => {
    b.addEventListener('click', () => {
      const idx = parseInt(b.dataset.removeLoc);
      const locId = state.locations[idx].id;
      state.locations.splice(idx, 1);
      Object.keys(state.shifts).forEach(key => {
        state.shifts[key].forEach(s => { if(s.locId===locId) s.locId=null; });
      });
      state.modal={type:'locations'}; pushAll();
    });
  });

  document.querySelectorAll('[data-edit-loc]').forEach(b => {
    b.addEventListener('click', () => {
      state.modal = {type:'edit-location', idx:parseInt(b.dataset.editLoc)};
      render();
    });
  });
}

function ge(id) { return document.getElementById(id); }

// ---- INIT ----
initFirebase();
