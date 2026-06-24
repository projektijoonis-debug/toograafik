'use strict';

// ================================================================
// FIREBASE CONFIG — Sinu projekti reaalsete andmetega seadistus
// ================================================================
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBTpQu9X7VQ1agNPZD-rSJnQakQZU1MkaU",
  authDomain:        "toograafik-e3944.firebaseapp.com",
  databaseURL:       "https://toograafik-e3944-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "toograafik-e3944",
  storageBucket:     "toograafik-e3944.firebasestorage.app",
  messagingSenderId: "162416573043",
  appId:             "1:162416573043:web:499b6dfd6190baa1b68806",
  measurementId:     "G-ZRJVNK4QSC"
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
  view: 'worker', // Vaikimisi avaneb alati töötaja vaade
  year: today.getFullYear(),
  month: today.getMonth(),
  shifts: {},
  swapRequests: [],
  modal: null,
  modalError: null,
  isAdmin: localStorage.getItem('isAdmin') === 'true', // Laeb sisselogimise oleku brauseri mälust
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
        // Kui ollakse administraator, suunatakse otse juhi vaatesse, muidu jääb töötaja vaade
        state.view = state.isAdmin ? 'manager' : 'worker';
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
  if (!hex || typeof hex !== 'string' || hex[0] !== '#') {
    return { r: 55, g: 138, b: 221 }; 
  }
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return {r,g,b};
}
function lightBg(hex) {
  const {r,g,b} = hexToRgb(hex);
  return `rgba(${r},${g},${b},0.13)`;
}

// Kellaaja minutiteks teisendamise abifunktsioon kattuvuste kontrolliks
function timeToMins(t) {
  if (!t) return 0;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Funktsioon, mis kontrollib, kas töötajal on antud kuupäeval juba kattuv vahetus
function checkOverlap(emp, key, start, end, excludeShiftId = null) {
  const dayShifts = state.shifts[key] || [];
  const newStart = timeToMins(start);
  const newEnd = timeToMins(end);

  for (const s of dayShifts) {
    if (s.emp === emp && s.id !== excludeShiftId) {
      const sStart = timeToMins(s.start);
      const sEnd = timeToMins(s.end);
      if (newStart < sEnd && sStart < newEnd) {
        return true;
      }
    }
  }
  return false;
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

  // Kui ollakse sisse logitud administraatorina, kuvatakse vaate nupud ja väljalogimise nupp
  let viewControls = '';
  if (state.isAdmin) {
    viewControls = `
      <div class="view-toggle" style="display:flex; align-items:center; gap:8px;">
        <button class="view-btn${state.view==='manager'?' active':''}" data-view="manager">Juht</button>
        <button class="view-btn${state.view==='worker'?' active':''}" data-view="worker">Töötaja</button>
        <button id="btn-logout" class="view-btn" style="border-color:#C0392B; color:#C0392B;">Logi välja</button>
      </div>`;
  } else {
    // Tavakasutajad näevad ainult sisselogimise nuppu
    viewControls = `
      <div class="view-toggle">
        <button id="btn-login-prompt" class="view-btn" style="background:var(--blue); color:#fff; border-color:var(--blue);">Logi sisse juhina</button>
      </div>`;
  }

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
    ${viewControls}
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
      ${extra > 0 ? `<span class="more-tag" data-moreday="${d}" style="cursor:pointer; font-weight:600; text-decoration:underline;">+${extra} veel</span>` : ''}
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

// Uuendatud taotluste ja soovide kuvamine juhile (kinnitamata ootel taotlused)
function buildSwapSection() {
  const pending = state.swapRequests.filter(r => r.status === 'pending');
  if (!pending.length) return '';
  return `<div class="section-head">Kinnitamata taotlused ja soovid (${pending.length})</div>
  ${pending.map(r => {
    if (r.type === 'wish') {
      return `<div class="swap-req">
        <div>
          <div class="swap-info"><strong>${r.emp} soovib vahetust:</strong> ${r.toKey}</div>
          <div class="swap-meta">${r.toStart}&ndash;${r.toEnd} (Kinnitamisel luuakse vahetus)</div>
        </div>
        <div class="swap-actions">
          <button class="approve" data-approve="${r.id}">✓ Kinnita</button>
          <button class="reject" data-reject="${r.id}">✕ Keeldu</button>
        </div>
      </div>`;
    } else {
      return `<div class="swap-req">
        <div>
          <div class="swap-info"><strong>${r.emp} &harr; ${r.targetEmp} vahetus:</strong> ${r.fromKey} &rarr; ${r.toKey}</div>
          <div class="swap-meta">${r.fromStart}&ndash;${r.fromEnd}</div>
        </div>
        <div class="swap-actions">
          <button class="approve" data-approve="${r.id}">✓ Kinnita</button>
          <button class="reject" data-reject="${r.id}">✕ Keeldu</button>
        </div>
      </div>`;
    }
  }).join('')}`;
}

// Töötaja vaade koos teise töötaja vahetuspalvete kinnitamisega (Ettepanek 2.1)
function buildWorkerView() {
  if (!state.employees.length) return `<div class="empty-msg">Töötajaid pole lisatud.</div>`;
  const emp = state.selectedEmployee || state.employees[0];
  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const myShifts = [];
  for (let d = 1; d <= dim; d++) {
    const key = shiftKey(y, m, d);
    const dayS = state.shifts[key] || [];
    dayS.forEach(s => {
      if (s.emp === emp) myShifts.push({d, key, s});
    });
  }
  
  // Sorteerime välja taotlused, mis ootavad selle töötaja (B) nõusolekut ja enda saadetud taotlused
  const myReqs = state.swapRequests.filter(r => r.emp === emp);
  const peerReqs = state.swapRequests.filter(r => r.targetEmp === emp && r.status === 'pending_peer');

  let peerBlock = '';
  if (peerReqs.length) {
    peerBlock = `
    <div class="section-head" style="color:#C0392B;">Sulle esitatud vahetuse taotlused (${peerReqs.length})</div>
    <div class="worker-section" style="border: 0.5px solid #C0392B; margin-top: 0.5rem; background: rgba(192,57,43,0.03);">
      ${peerReqs.map(r => `
        <div class="swap-req" style="border-bottom: 0.5px solid rgba(192,57,43,0.1); padding: 12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
          <div>
            <div class="swap-info"><strong>${r.emp}</strong> soovib Sinu vahetust kuupäeval <strong>${r.toKey}</strong> ja pakub Sulle vastu oma vahetust kuupäeval <strong>${r.fromKey}</strong> (${r.fromStart}&ndash;${r.fromEnd})</div>
          </div>
          <div class="swap-actions">
            <button class="approve peer-approve-btn" data-peer-approve="${r.id}" style="background:#3B9E5A; color:#fff; border-color:#3B9E5A; padding:4px 10px; border-radius:4px; font-size:12px; cursor:pointer;">✓ Nõustu</button>
            <button class="reject peer-reject-btn" data-peer-reject="${r.id}" style="background:#C0392B; color:#fff; border-color:#C0392B; padding:4px 10px; border-radius:4px; font-size:12px; cursor:pointer;">✕ Keeldu</button>
          </div>
        </div>`).join('')}
    </div>`;
  }

  return `<div class="top-bar" style="justify-content: space-between;">
    <div style="display:flex; gap:8px; align-items:center;">
      <select id="emp-select">
        ${state.employees.map(e => `<option${e===emp?' selected':''}>${e}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex; gap:8px;">
      <button class="add-btn" id="btn-add-wish" style="background:#3B9E5A;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        Saada soovitud aeg
      </button>
      <button class="add-btn" id="btn-req-swap">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/>
        </svg>
        Taotle vahetust
      </button>
    </div>
  </div>
  ${peerBlock}
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
    ${myReqs.map(r => {
      let badgeClass = 'badge-warn';
      let badgeText = 'Ootel';
      if (r.status === 'pending_peer') {
        badgeClass = 'badge-warn';
        badgeText = 'Ootab kolleegi nõusolekut';
      } else if (r.status === 'pending') {
        badgeClass = 'badge-warn';
        badgeText = 'Ootab juhi kinnitust';
      } else if (r.status === 'approved') {
        badgeClass = 'badge-ok';
        badgeText = 'Kinnitatud';
      }

      if (r.type === 'wish') {
        return `<div class="swap-req">
          <div>
            <div class="swap-info"><strong>Soovitud aeg:</strong> ${r.toKey}</div>
            <div class="swap-meta">${r.toStart}&ndash;${r.toEnd}</div>
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>`;
      } else {
        return `<div class="swap-req">
          <div>
            <div class="swap-info"><strong>Vahetuse taotlus (kellega: ${r.targetEmp}):</strong> ${r.fromKey} &rarr; ${r.toKey}</div>
            <div class="swap-meta">${r.fromStart}&ndash;${r.fromEnd}</div>
          </div>
          <span class="badge ${badgeClass}">${badgeText}</span>
        </div>`;
      }
    }).join('')}
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
      ${state.modalError ? `<div style="color:#C0392B;font-size:12px;margin-top:10px;font-weight:600;">⚠️ ${state.modalError}</div>` : ''}
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
      ${state.modalError ? `<div style="color:#C0392B;font-size:12px;margin-top:10px;font-weight:600;">⚠️ ${state.modalError}</div>` : ''}
      <div class="modal-actions">
        <button class="btn-danger" id="btn-delete">Kustuta</button>
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save">Salvesta</button>
      </div>
    </div></div>`;
  }

  // Uuendatud vahetuse taotlemise modal - sisaldab teise töötaja valikut (Ettepanek 2.1)
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
    
    // Filtreerime töötajate nimekirjast välja enda nime
    const otherEmps = state.employees.filter(e => e !== emp);

    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Taotle vahetust</h3>
      <label>Minu vahetus (millest)</label>
      <select id="m-from">
        ${myShifts.map(x=>`<option value="${x.key}|${x.s.start}|${x.s.end}">${x.d}. ${MONTHS[mo].slice(0,3)} &mdash; ${x.s.start}&ndash;${x.s.end}</option>`).join('')}
      </select>
      <label>Kellega soovid vahetada?</label>
      <select id="m-target-emp">
        ${otherEmps.map(e => `<option>${e}</option>`).join('')}
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

  // ETTEPANEK 3: Kuvab konkreetse kuupäeva kõik vahetused detailselt
  if (m.type === 'day-shifts') {
    const key = shiftKey(state.year, state.month, m.day);
    const dayShifts = state.shifts[key] || [];
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Vahetused: ${m.day}. ${MONTHS[state.month]}</h3>
      <div class="list-scroll" style="max-height:240px; padding:4px;">
        ${dayShifts.map(s => {
          const loc = getLocation(s.locId);
          const bg = loc ? lightBg(loc.color) : 'var(--bg2)';
          const border = loc ? loc.color : 'var(--border2)';
          const text = loc ? loc.color : 'var(--text2)';
          return `<div class="shift-pill" style="background:${bg};color:${text};border-left:3px solid ${border}; cursor:pointer; padding:6px 10px; margin-bottom:6px; border-radius:4px;" data-shiftid="${s.id}" data-key="${key}">
            <strong>${s.emp}</strong>: ${s.start} - ${s.end} ${loc ? `(${loc.name})` : ''}
          </div>`;
        }).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn-primary" id="btn-add-from-more" data-day="${m.day}">+ Lisa uus</button>
        <button class="btn-secondary" id="btn-cancel">Sulge</button>
      </div>
    </div></div>`;
  }

  // ETTEPANEK 2.3: Uus modal töötajale iseseisva soovitud aja saatmiseks
  if (m.type === 'add-wish') {
    const defDate = `${state.year}-${String(state.month+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const emp = state.selectedEmployee || state.employees[0] || '';
    return `<div class="modal-bg" id="modal-bg"><div class="modal">
      <h3>Saada soovitud kellaaeg</h3>
      <p style="font-size:12px;color:var(--text2);margin-bottom:12px;">Saada juhile soov kindlal kuupäeval ja kellaajal töötamiseks.</p>
      <label>Töötaja</label>
      <input type="text" value="${emp}" disabled style="background:var(--bg2); color:var(--text3);">
      <label>Kuupäev</label>
      <input type="date" id="m-wish-date" value="${defDate}">
      <label>Algus</label>
      <input type="time" id="m-wish-start" value="08:00">
      <label>Lõpp</label>
      <input type="time" id="m-wish-end" value="16:00">
      ${state.modalError ? `<div style="color:#C0392B;font-size:12px;margin-top:10px;font-weight:600;">⚠️ ${state.modalError}</div>` : ''}
      <div class="modal-actions">
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save-wish">Saada soov</button>
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

  // Sisselogimise kuulamise funktsioon (Ettepanek 1.1)
  ge('btn-login-prompt')?.addEventListener('click', () => {
    const pass = prompt("Sisesta juhi parool:");
    if (pass === "verevi2026") {
      state.isAdmin = true;
      state.view = 'manager';
      localStorage.setItem('isAdmin', 'true');
      render();
    } else if (pass !== null) {
      alert("Vale parool!");
    }
  });

  // Väljalogimise kuulamise funktsioon (Ettepanek 1.1)
  ge('btn-logout')?.addEventListener('click', () => {
    state.isAdmin = false;
    state.view = 'worker';
    localStorage.removeItem('isAdmin');
    render();
  });

  ge('btn-add-shift')?.addEventListener('click', () => {
    state.modal = {type:'add', day:today.getDate()}; state.modalError = null; render();
  });
  ge('btn-manage-emp')?.addEventListener('click', () => {
    state.modal = {type:'employees'}; state.modalError = null; render();
  });
  ge('btn-manage-loc')?.addEventListener('click', () => {
    state.modal = {type:'locations'}; state.modalError = null; render();
  });

  document.querySelectorAll('[data-addday]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.target.closest('[data-shiftid]') || e.target.closest('[data-moreday]')) return;
      state.modal = {type:'add', day:parseInt(cell.dataset.addday)}; state.modalError = null; render();
    });
  });
  document.querySelectorAll('[data-shiftid]').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const key = pill.dataset.key;
      const shift = (state.shifts[key]||[]).find(s => s.id === pill.dataset.shiftid);
      if (shift) { state.modal = {type:'edit', key, shift}; state.modalError = null; render(); }
    });
  });

  // Ava nimekiri nupule "+X veel" vajutamisel
  document.querySelectorAll('[data-moreday]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      state.modal = {type:'day-shifts', day:parseInt(btn.dataset.moreday)}; state.modalError = null; render();
    });
  });

  // Lisa uus vahetus otse nimekirja aknast
  ge('btn-add-from-more')?.addEventListener('click', () => {
    const day = parseInt(ge('btn-add-from-more').dataset.day);
    state.modal = {type:'add', day}; state.modalError = null; render();
  });

  // Töötaja soovitud aja nupu kuulamise algus (Ettepanek 2.3)
  ge('btn-add-wish')?.addEventListener('click', () => {
    state.modal = {type:'add-wish'}; state.modalError = null; render();
  });

  // Töötaja B nõustub vahetusega (Ettepanek 2.1)
  document.querySelectorAll('.peer-approve-btn').forEach(b => {
    b.addEventListener('click', () => {
      const r = state.swapRequests.find(x => x.id === b.dataset.peerApprove);
      if (r) {
        r.status = 'pending'; // Nõusolek antud, läheb juhi kätte ootele
        pushAll();
      }
    });
  });

  // Töötaja B keeldub vahetusest (Ettepanek 2.1)
  document.querySelectorAll('.peer-reject-btn').forEach(b => {
    b.addEventListener('click', () => {
      state.swapRequests = state.swapRequests.filter(x => x.id !== b.dataset.peerReject);
      pushAll();
    });
  });

  document.querySelectorAll('[data-approve]').forEach(b => {
    b.addEventListener('click', () => {
      const r = state.swapRequests.find(x => x.id === b.dataset.approve);
      if (r) {
        r.status = 'approved';

        // Kui tegu on sooviga (Ettepanek 2.3), lisatakse see kinnitamisel automaatselt graafikusse vahetuseks
        if (r.type === 'wish') {
          const key = r.toKey;
          if (!state.shifts[key]) state.shifts[key] = [];

          if (!checkOverlap(r.emp, key, r.toStart, r.toEnd)) {
            state.shifts[key].push({
              emp: r.emp,
              start: r.toStart,
              end: r.toEnd,
              locId: state.locations[0]?.id || '', // Vaikimisi määratakse esimene asukoht
              id: uid()
            });
          }
        } 
        // KUI TEGU ON OMAVAHELISE VAHETUSEGA (Ettepanek 2.1 - Juht kinnitab)
        else {
          const dayShiftsFrom = state.shifts[r.fromKey] || [];
          const dayShiftsTo = state.shifts[r.toKey] || [];
          
          // Otsime Töötaja A algse vahetuse
          const shiftA = dayShiftsFrom.find(s => s.emp === r.emp && s.start === r.fromStart && s.end === r.fromEnd);
          // Otsime Töötaja B vahetuse (kui tal sel päeval oli)
          const shiftB = dayShiftsTo.find(s => s.emp === r.targetEmp);
          
          if (shiftA && shiftB) {
            // Kui mõlemal oli sel päeval vahetus, siis vahetame omanikud
            shiftA.emp = r.targetEmp;
            shiftB.emp = r.emp;
          } else if (shiftA) {
            // Kui ainult töötajal A oli vahetus, siis määrame vahetuse omanikuks töötaja B
            shiftA.emp = r.targetEmp;
          }
        }
        pushAll();
      }
    });
  });

  document.querySelectorAll('[data-reject]').forEach(b => b.addEventListener('click', () => {
    state.swapRequests = state.swapRequests.filter(x => x.id !== b.dataset.reject);
    pushAll();
  }));

  ge('emp-select')?.addEventListener('change', e => {
    state.selectedEmployee = e.target.value; render();
  });
  ge('btn-req-swap')?.addEventListener('click', () => {
    state.modal = {type:'swap'}; state.modalError = null; render();
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

  // Töötaja iseseisva soovi salvestamine andmebaasi (Ettepanek 2.3)
  ge('btn-save-wish')?.addEventListener('click', () => {
    const dateVal = ge('m-wish-date').value;
    const start = ge('m-wish-start').value;
    const end = ge('m-wish-end').value;
    if (!dateVal || !start || !end) return;

    if (timeToMins(start) >= timeToMins(end)) {
      state.modalError = "Lõpuaeg peab olema pärast algusaega!";
      render();
      return;
    }

    const [y,mo,d] = dateVal.split('-').map(Number);
    const toKey = shiftKey(y, mo-1, d);
    const emp = state.selectedEmployee || state.employees[0];

    if (checkOverlap(emp, toKey, start, end)) {
      state.modalError = "Sul on sel ajal juba graafikus teine vahetus!";
      render();
      return;
    }

    state.swapRequests.push({
      id: uid(),
      emp,
      toKey,
      toStart: start,
      toEnd: end,
      type: 'wish',
      status: 'pending'
    });

    state.modal = null;
    pushAll();
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

      if (checkOverlap(emp, key, start, end)) {
        state.modalError = `Töötajal ${emp} on sel ajal juba teine vahetus!`;
        render();
        return;
      }

      if (!state.shifts[key]) state.shifts[key] = [];
      state.shifts[key].push({emp, start, end, locId, id:uid()});
      state.year=y; state.month=mo-1;
    } else if (m.type === 'edit') {
      const locId = ge('m-loc')?.value || '';
      const start = ge('m-start').value;
      const end = ge('m-end').value;

      if (checkOverlap(m.shift.emp, m.key, start, end, m.shift.id)) {
        state.modalError = `Töötajal ${m.shift.emp} on sel ajal juba teine vahetus!`;
        render();
        return;
      }

      const s = (state.shifts[m.key]||[]).find(x => x.id === m.shift.id);
      if (s) { s.start=start; s.end=end; s.locId=locId; }
    } else if (m.type === 'swap') {
      const fromVal = ge('m-from').value;
      const toDateVal = ge('m-todate').value;
      const targetEmp = ge('m-target-emp').value;
      if (!fromVal || !toDateVal || !targetEmp) return;
      const [fromKey,fromStart,fromEnd] = fromVal.split('|');
      const [y,mo,d] = toDateVal.split('-').map(Number);
      const toKey = shiftKey(y, mo-1, d);
      const emp = state.selectedEmployee || state.employees[0];
      
      // Salvestame oote staatuseks "pending_peer" (Ettepanek 2.1)
      state.swapRequests.push({
        id: uid(),
        emp,
        targetEmp,
        fromKey,
        fromStart,
        fromEnd,
        toKey,
        type: 'swap',
        status: 'pending_peer'
      });
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