'use strict';

// ================================================================
// FIREBASE CONFIG - avalik Firebase kliendi seadistus.
// Turvalisus peab tulema Firebase Auth + Realtime Database Rules kaudu.
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

// Lisa siia juhi Firebase Auth e-post(id). Sama e-post peab olema lubatud ka
// Firebase Realtime Database Rules failis, sest kliendipoolne kontroll ei ole turvapiir.
const MANAGER_EMAILS = [
  'projektijoonis@gmail.com'
];

const MONTHS = ['Jaanuar','Veebruar','Märts','Aprill','Mai','Juuni',
  'Juuli','August','September','Oktoober','November','Detsember'];
const DAYS = ['E','T','K','N','R','L','P'];
const DAYS_FULL = ['Pühapäev','Esmaspäev','Teisipäev','Kolmapäev','Neljapäev','Reede','Laupäev'];
const PRESET_COLORS = [
  '#378ADD','#3B9E5A','#E07B2A','#9B59B6','#E84393',
  '#16A085','#C0392B','#2C3E50','#F39C12','#1ABC9C'
];
const DEFAULT_EMPLOYEES = ['Mari','Jaan','Kati','Toomas','Anna','Liis','Peeter','Siim','Eva','Maret'];
const DEFAULT_LOCATIONS = [
  {id:'loc1', name:'Kauplus A', color:'#378ADD'},
  {id:'loc2', name:'Ladu',      color:'#3B9E5A'},
  {id:'loc3', name:'Kontor',    color:'#E07B2A'}
];

const today = new Date();

let db = null;
let auth = null;
let unsubscribeDb = null;

let state = {
  view: 'worker',
  year: today.getFullYear(),
  month: today.getMonth(),
  shifts: {},
  swapRequests: [],
  modal: null,
  modalError: null,
  user: null,
  isManager: false,
  selectedEmployee: null,
  employees: [],
  locations: [],
  syncing: false,
  loaded: false,
  authReady: false,
  authMode: 'login',
  authError: null,
};

// ---- FIREBASE / AUTH ----
function initFirebase() {
  try {
    if (typeof firebase === 'undefined') {
      throw new Error('Firebase SDK ei ole laetud. Kontrolli internetiühendust ja index.html skripte.');
    }
    if (typeof firebase.auth !== 'function') {
      throw new Error('Firebase Auth SDK ei ole laetud. index.html peab sisaldama firebase-auth-compat.js faili enne app.js faili.');
    }
    if (typeof firebase.database !== 'function') {
      throw new Error('Firebase Database SDK ei ole laetud. index.html peab sisaldama firebase-database-compat.js faili enne app.js faili.');
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(FIREBASE_CONFIG);
    }
    db = firebase.database();
    auth = firebase.auth();
    auth.onAuthStateChanged(user => {
      state.user = user;
      state.isManager = isManagerUser(user);
      state.authReady = true;
      state.loaded = false;
      state.modal = null;
      state.modalError = null;
      state.authError = null;
      stopListeners();

      if (user) {
        state.view = state.isManager ? 'manager' : 'worker';
        startListeners();
      } else {
        state.view = 'worker';
        state.shifts = {};
        state.swapRequests = [];
        state.employees = [];
        state.locations = [];
        state.selectedEmployee = null;
        render();
      }
    });
  } catch(e) {
    console.error('Firebase init error:', e);
    showFatalError('Firebase ühendus ebaõnnestus: ' + escapeHtml(e.message || e));
  }
}

function isManagerUser(user) {
  if (!user || !user.email) return false;
  return MANAGER_EMAILS.map(e => e.toLowerCase()).includes(user.email.toLowerCase());
}

function stopListeners() {
  if (unsubscribeDb) {
    unsubscribeDb();
    unsubscribeDb = null;
  }
}

function startListeners() {
  const ref = db.ref('/');
  const onValue = snapshot => {
    try {
      const data = snapshot.val() || {};
      state.shifts = normalizeShifts(data.shifts || {});
      state.swapRequests = toArray(data.swapRequests);

      const emp = toArray(data.employees).map(String).filter(Boolean);
      state.employees = emp.length > 0 ? emp : DEFAULT_EMPLOYEES.slice();

      const loc = toArray(data.locations);
      state.locations = loc.length > 0 ? loc : DEFAULT_LOCATIONS.slice();

      const ownEmployee = getEmployeeForUser();
      if (state.isManager) {
        if (!state.selectedEmployee || !state.employees.includes(state.selectedEmployee)) {
          state.selectedEmployee = state.employees[0] || null;
        }
      } else {
        state.selectedEmployee = ownEmployee;
      }

      if (!state.loaded) {
        state.loaded = true;
        if (state.isManager && Object.keys(state.shifts).length === 0) {
          initDemo();
          pushAll();
          return;
        }
      }

      state.syncing = false;
      render();
    } catch(e) {
      showFatalError('Andmete töötlemisel tekkis viga: ' + escapeHtml(e.message));
    }
  };
  const onError = err => showFatalError('Firebase ühendus ebaõnnestus: ' + escapeHtml(err.message));
  ref.on('value', onValue, onError);
  unsubscribeDb = () => ref.off('value', onValue);
}

function signIn(email, password) {
  state.authError = null;
  render();
  auth.signInWithEmailAndPassword(email, password)
    .catch(e => {
      state.authError = authErrorMessage(e);
      render();
    });
}

function signUpWorker(email, password, displayName) {
  state.authError = null;
  render();
  auth.createUserWithEmailAndPassword(email, password)
    .then(cred => cred.user.updateProfile({displayName: displayName.trim()}))
    .then(() => auth.currentUser.reload())
    .then(() => {
      state.user = auth.currentUser;
      render();
    })
    .catch(e => {
      state.authError = authErrorMessage(e);
      render();
    });
}

function authErrorMessage(e) {
  const code = e && e.code ? e.code : '';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Vale e-post või parool.';
  if (code.includes('user-not-found')) return 'Sellist kasutajat ei leitud.';
  if (code.includes('email-already-in-use')) return 'Selle e-postiga konto on juba olemas.';
  if (code.includes('weak-password')) return 'Parool peab olema vähemalt 6 märki.';
  if (code.includes('invalid-email')) return 'E-posti aadress ei ole korrektne.';
  return e && e.message ? e.message : 'Sisselogimine ebaõnnestus.';
}

// ---- DATA WRITES ----
function pushAll() {
  if (!db || !state.isManager) return;
  state.syncing = true;
  const swapObj = {};
  state.swapRequests.forEach(r => { if (r && r.id) swapObj[r.id] = r; });
  db.ref('/').set({
    shifts: state.shifts,
    swapRequests: swapObj,
    employees: state.employees,
    locations: state.locations,
  }).catch(e => showModalError('Salvestamine ebaõnnestus: ' + e.message));
}

function saveSwapRequest(req) {
  if (!db || !state.user) return;
  state.syncing = true;
  db.ref('/swapRequests/' + req.id).set(req)
    .catch(e => showModalError('Taotluse salvestamine ebaõnnestus: ' + e.message));
}

function updateSwapStatus(id, status) {
  if (!db || !state.user) return;
  state.syncing = true;
  db.ref('/swapRequests/' + id + '/status').set(status)
    .catch(e => showModalError('Taotluse muutmine ebaõnnestus: ' + e.message));
}

function removeSwapRequest(id) {
  if (!db || !state.user) return;
  state.syncing = true;
  db.ref('/swapRequests/' + id).remove()
    .catch(e => showModalError('Taotluse kustutamine ebaõnnestus: ' + e.message));
}

// ---- NORMALIZATION / SECURITY HELPERS ----
function toArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return Object.values(val).filter(Boolean);
}

function normalizeShifts(shifts) {
  const out = {};
  Object.keys(shifts || {}).forEach(k => {
    out[k] = toArray(shifts[k]).map(s => ({
      emp: String(s.emp || ''),
      start: String(s.start || ''),
      end: String(s.end || ''),
      locId: s.locId || '',
      id: s.id || uid(),
    })).filter(s => s.emp && isValidTime(s.start) && isValidTime(s.end));
  });
  return out;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function esc(value) { return escapeHtml(value); }
function attr(value) { return escapeHtml(value); }

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function showFatalError(msg) {
  const el = document.getElementById('app');
  if (el) {
    el.innerHTML = `<div class="app"><div style="padding:2rem;text-align:center;color:#C0392B;font-size:14px">
      <strong>Viga:</strong> ${msg}
    </div></div>`;
  }
}

function showModalError(msg) {
  state.modalError = msg;
  state.syncing = false;
  render();
}

function getEmployeeForUser() {
  if (!state.user) return null;
  const displayName = (state.user.displayName || '').trim();
  if (displayName && state.employees.includes(displayName)) return displayName;
  const emailName = (state.user.email || '').split('@')[0].replace(/[._-]+/g, ' ').trim().toLowerCase();
  return state.employees.find(e => e.toLowerCase() === emailName) || null;
}

function requireManager() {
  if (state.isManager) return true;
  showModalError('Seda tegevust saab teha ainult juht.');
  return false;
}

function requireEmployee() {
  const emp = getEmployeeForUser();
  if (emp) return emp;
  showModalError('Sinu konto nimi ei vasta ühelegi graafikus olevale töötajale. Palu juhil lisada täpselt sama nimi või parandada konto displayName.');
  return null;
}

// ---- DATE / TIME ----
function shiftKey(y, m, d) {
  return `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}

function getLocation(id) {
  return state.locations.find(l => l.id === id);
}

function isValidDateValue(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v || '');
}

function isValidTime(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t || '');
}

function timeToMins(t) {
  if (!isValidTime(t)) return NaN;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function validateTimeRange(start, end) {
  if (!isValidTime(start) || !isValidTime(end)) return 'Sisesta korrektne algus- ja lõppaeg.';
  if (timeToMins(start) >= timeToMins(end)) return 'Lõpuaeg peab olema pärast algusaega.';
  return null;
}

function checkOverlap(emp, key, start, end, excludeShiftId = null) {
  const dayShifts = state.shifts[key] || [];
  const newStart = timeToMins(start);
  const newEnd = timeToMins(end);
  if (!emp || Number.isNaN(newStart) || Number.isNaN(newEnd)) return false;

  return dayShifts.some(s => {
    if (s.emp !== emp || s.id === excludeShiftId) return false;
    const sStart = timeToMins(s.start);
    const sEnd = timeToMins(s.end);
    return newStart < sEnd && sStart < newEnd;
  });
}

function hexToRgb(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex || '')) return { r: 55, g: 138, b: 221 };
  return {
    r: parseInt(hex.slice(1,3),16),
    g: parseInt(hex.slice(3,5),16),
    b: parseInt(hex.slice(5,7),16)
  };
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
    ['Mari','08:00','16:00'],['Jaan','16:00','23:00'],['Kati','08:00','16:00'],
    ['Toomas','12:00','20:00'],['Anna','08:00','16:00'],['Liis','07:00','15:00'],
  ];
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(y, m, d).getDay();
    if (dow === 0 || dow === 6) continue;
    const key = shiftKey(y, m, d);
    state.shifts[key] = [];
    const count = 2 + Math.floor(Math.random() * 3);
    [...pairs].sort(() => Math.random()-0.5).slice(0, count).forEach(([emp,start,end]) => {
      const locId = locIds[Math.floor(Math.random()*locIds.length)] || '';
      state.shifts[key].push({emp, start, end, locId, id: uid()});
    });
  }
}

// ---- RENDER ----
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!state.authReady) {
    app.innerHTML = loadingHtml('Laen sisselogimist...');
    return;
  }
  if (!state.user) {
    app.innerHTML = `<div class="app">${buildAuthView()}</div>`;
    attachAuthEvents();
    return;
  }
  if (!state.loaded) {
    app.innerHTML = loadingHtml('Laen andmeid...');
    return;
  }

  app.innerHTML = `<div class="app">${buildHeader()}${buildBody()}${state.modal ? buildModal() : ''}</div>`;
  attachEvents();
}

function loadingHtml(text) {
  return `<div class="app"><div style="padding:3rem;text-align:center;color:var(--text3);font-size:14px">
    <div class="spinner"></div>${esc(text)}
  </div></div>`;
}

function buildAuthView() {
  const isRegister = state.authMode === 'register';
  return `<div class="auth-wrap" style="max-width:420px;margin:4rem auto;padding:24px;border:1px solid var(--border2);border-radius:8px;background:var(--bg1)">
    <h2 style="margin-top:0">Töögraafik</h2>
    <p style="color:var(--text2);font-size:14px">${isRegister ? 'Loo töötaja konto. Juhi konto loob juht Firebase Console’is.' : 'Logi sisse juhi või töötajana.'}</p>
    <label>E-post</label>
    <input type="email" id="auth-email" autocomplete="email">
    <label>Parool</label>
    <input type="password" id="auth-password" autocomplete="${isRegister ? 'new-password' : 'current-password'}">
    ${isRegister ? `<label>Töötaja nimi graafikus</label><input type="text" id="auth-display-name" placeholder="Näiteks Mari">` : ''}
    ${state.authError ? `<div style="color:#C0392B;font-size:13px;margin-top:10px;font-weight:600">${esc(state.authError)}</div>` : ''}
    <div class="modal-actions">
      <button class="btn-secondary" id="auth-toggle">${isRegister ? 'Mul on konto' : 'Loo töötaja konto'}</button>
      <button class="btn-primary" id="auth-submit">${isRegister ? 'Loo konto' : 'Logi sisse'}</button>
    </div>
  </div>`;
}

function buildHeader() {
  const syncDot = state.syncing
    ? `<span class="sync-dot syncing" title="Salvestab..."></span>`
    : `<span class="sync-dot ok" title="Sünkroonitud"></span>`;

  const viewControls = state.isManager
    ? `<div class="view-toggle" style="display:flex; align-items:center; gap:8px;">
        <button class="view-btn${state.view==='manager'?' active':''}" data-view="manager">Juht</button>
        <button class="view-btn${state.view==='worker'?' active':''}" data-view="worker">Töötaja</button>
        <button id="btn-logout" class="view-btn" style="border-color:#C0392B; color:#C0392B;">Logi välja</button>
      </div>`
    : `<div class="view-toggle"><button id="btn-logout" class="view-btn">Logi välja</button></div>`;

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
      <span class="month-label">${esc(MONTHS[state.month])} ${state.year}</span>
      <button id="btn-next">&#8250;</button>
    </div>
    ${viewControls}
  </div>`;
}

function buildBody() {
  return state.view === 'manager' && state.isManager ? buildManagerView() : buildWorkerView();
}

function buildLegend() {
  if (!state.locations.length) return '';
  return `<div class="legend">
    ${state.locations.map(l => `
      <div class="legend-item">
        <span class="legend-dot" style="background:${attr(safeColor(l.color))}"></span>
        <span class="legend-name">${esc(l.name)}</span>
      </div>`).join('')}
  </div>`;
}

function buildManagerView() {
  return `
  <div class="top-bar">
    <button class="add-btn" id="btn-add-shift">+ Lisa vahetus</button>
    <button class="secondary-btn" id="btn-manage-emp">Töötajad</button>
    <button class="secondary-btn" id="btn-manage-loc">Töökohad</button>
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
    const pills = visible.map(s => buildShiftPill(s, key)).join('');

    if (state.view === 'manager' && state.isManager) {
      cells += `<div class="cal-cell${isToday?' today':''}" data-addday="${d}">
        <div class="day-num">${d}</div>${pills}
        ${extra > 0 ? `<span class="more-tag" data-moreday="${d}" style="cursor:pointer; font-weight:600; text-decoration:underline;">+${extra} veel</span>` : ''}
      </div>`;
    } else {
      cells += `<div class="cal-cell${isToday?' today':''}">
        <div class="day-num">${d}</div>${pills}
        ${extra > 0 ? `<span class="more-tag" data-moreday="${d}" style="cursor:pointer; font-weight:600; text-decoration:underline;">+${extra} veel</span>` : ''}
      </div>`;
    }
  }
  const tail = (7 - (offset+dim)%7) % 7;
  for (let i = 1; i <= tail; i++) {
    cells += `<div class="cal-cell other-month"><div class="day-num">${i}</div></div>`;
  }
  return `<div class="calendar">
    <div class="cal-head">${DAYS.map(d=>`<div>${esc(d)}</div>`).join('')}</div>
    <div class="cal-grid">${cells}</div>
  </div>`;
}

function buildShiftPill(s, key) {
  const loc = getLocation(s.locId);
  const color = safeColor(loc ? loc.color : '');
  const bg = loc ? lightBg(color) : 'var(--bg2)';
  const border = loc ? color : 'var(--border2)';
  const text = loc ? color : 'var(--text2)';
  if (state.view === 'manager' && state.isManager) {
    return `<span class="shift-pill" style="background:${bg};color:${text};border-left:3px solid ${border}" data-shiftid="${attr(s.id)}" data-key="${attr(key)}">${esc(s.emp)} ${esc(s.start)}</span>`;
  }
  return `<span class="shift-pill worker-shift-pill" style="background:${bg};color:${text};border-left:3px solid ${border}" data-swap-emp="${attr(s.emp)}" data-swap-key="${attr(key)}">${esc(s.emp)} ${esc(s.start)}</span>`;
}

function buildSwapSection() {
  const pending = state.swapRequests.filter(r => r.status === 'pending');
  if (!pending.length) return '';
  return `<div class="section-head">Kinnitamata taotlused ja soovid (${pending.length})</div>
  ${pending.map(r => {
    if (r.type === 'wish') {
      return `<div class="swap-req">
        <div>
          <div class="swap-info"><strong>${esc(r.emp)} soovib vahetust:</strong> ${esc(r.toKey)}</div>
          <div class="swap-meta">${esc(r.toStart)}&ndash;${esc(r.toEnd)} (kinnitamisel luuakse vahetus)</div>
        </div>
        <div class="swap-actions">
          <button class="approve" data-approve="${attr(r.id)}">Kinnita</button>
          <button class="reject" data-reject="${attr(r.id)}">Keeldu</button>
        </div>
      </div>`;
    }
    return `<div class="swap-req">
      <div>
        <div class="swap-info"><strong>${esc(r.emp)} &harr; ${esc(r.targetEmp)} vahetus:</strong> ${esc(r.fromKey)} &rarr; ${esc(r.toKey)}</div>
        <div class="swap-meta">${esc(r.fromStart)}&ndash;${esc(r.fromEnd)}</div>
      </div>
      <div class="swap-actions">
        <button class="approve" data-approve="${attr(r.id)}">Kinnita</button>
        <button class="reject" data-reject="${attr(r.id)}">Keeldu</button>
      </div>
    </div>`;
  }).join('')}`;
}

function buildWorkerView() {
  if (!state.employees.length) return `<div class="empty-msg">Töötajaid pole lisatud.</div>`;
  const emp = state.isManager ? (state.selectedEmployee || state.employees[0]) : getEmployeeForUser();
  if (!emp) {
    return `<div class="empty-msg">Sinu konto ei ole seotud ühegi töötajaga. Palu juhil kontrollida, et Firebase konto displayName oleks täpselt sama nagu töötaja nimi graafikus.</div>`;
  }

  const y = state.year, m = state.month;
  const dim = new Date(y, m+1, 0).getDate();
  const myShifts = [];
  for (let d = 1; d <= dim; d++) {
    const key = shiftKey(y, m, d);
    (state.shifts[key] || []).forEach(s => {
      if (s.emp === emp) myShifts.push({d, key, s});
    });
  }

  const myReqs = state.swapRequests.filter(r => r.emp === emp);
  const peerReqs = state.swapRequests.filter(r => r.targetEmp === emp && r.status === 'pending_peer');

  return `<div class="top-bar" style="justify-content: space-between;">
    <div style="display:flex; gap:8px; align-items:center;">
      ${state.isManager ? `<select id="emp-select">${state.employees.map(e => `<option${e===emp?' selected':''}>${esc(e)}</option>`).join('')}</select>` : `<strong>${esc(emp)}</strong>`}
    </div>
    <div style="display:flex; gap:8px;">
      <button class="add-btn" id="btn-add-wish" style="background:#3B9E5A;">Saada soovitud aeg</button>
      <button class="add-btn" id="btn-req-swap">Taotle vahetust</button>
    </div>
  </div>
  ${buildPeerBlock(peerReqs)}
  <div class="section-head">Kogu meeskonna töögraafik</div>
  ${buildLegend()}
  ${buildCalendar()}
  <div class="section-head" style="margin-top: 2rem;">Minu selle kuu vahetused (${myShifts.length})</div>
  <div class="worker-section">
    ${myShifts.length === 0 ? `<div class="empty-msg">Sellel kuul vahetusi pole</div>` : myShifts.map(({d, s}) => buildMyShiftRow(d, s)).join('')}
  </div>
  ${myReqs.length ? `<div class="section-head">Minu taotlused</div><div class="worker-section">${myReqs.map(buildMyRequestRow).join('')}</div>` : ''}`;
}

function buildPeerBlock(peerReqs) {
  if (!peerReqs.length) return '';
  return `<div class="section-head" style="color:#C0392B;">Sulle esitatud vahetuse taotlused (${peerReqs.length})</div>
  <div class="worker-section" style="border:0.5px solid #C0392B;margin-top:0.5rem;background:rgba(192,57,43,0.03);">
    ${peerReqs.map(r => `<div class="swap-req" style="padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <div><div class="swap-info"><strong>${esc(r.emp)}</strong> soovib sinu vahetust kuupäeval <strong>${esc(r.toKey)}</strong> ja pakub vastu oma vahetust <strong>${esc(r.fromKey)}</strong> (${esc(r.fromStart)}&ndash;${esc(r.fromEnd)})</div></div>
      <div class="swap-actions">
        <button class="approve peer-approve-btn" data-peer-approve="${attr(r.id)}">Nõustu</button>
        <button class="reject peer-reject-btn" data-peer-reject="${attr(r.id)}">Keeldu</button>
      </div>
    </div>`).join('')}
  </div>`;
}

function buildMyShiftRow(d, s) {
  const y = state.year, m = state.month;
  const isToday = today.getFullYear()===y && today.getMonth()===m && today.getDate()===d;
  const dow = new Date(y,m,d).getDay();
  const loc = getLocation(s.locId);
  const color = safeColor(loc ? loc.color : '');
  const bg = loc ? lightBg(color) : 'var(--bg2)';
  const border = loc ? color : 'var(--border2)';
  const textCol = loc ? color : 'var(--text2)';
  return `<div class="emp-row">
    <div class="emp-date">${esc(DAYS_FULL[dow])}, ${d}. ${esc(MONTHS[m].slice(0,3))}${isToday?' <span class="badge badge-info">Täna</span>':''}</div>
    <div class="emp-shifts">
      <span class="emp-shift-tag" style="background:${bg};color:${textCol};border-left:3px solid ${border}">
        ${esc(s.start)}&ndash;${esc(s.end)}${loc ? ` &bull; ${esc(loc.name)}` : ''}
      </span>
    </div>
  </div>`;
}

function buildMyRequestRow(r) {
  let badgeClass = 'badge-warn';
  let badgeText = 'Ootel';
  if (r.status === 'pending_peer') badgeText = 'Ootab kolleegi nõusolekut';
  if (r.status === 'pending') badgeText = 'Ootab juhi kinnitust';
  if (r.status === 'approved') { badgeClass = 'badge-ok'; badgeText = 'Kinnitatud'; }

  if (r.type === 'wish') {
    return `<div class="swap-req">
      <div>
        <div class="swap-info"><strong>Soovitud aeg:</strong> ${esc(r.toKey)}</div>
        <div class="swap-meta">${esc(r.toStart)}&ndash;${esc(r.toEnd)}</div>
      </div>
      <span class="badge ${badgeClass}">${esc(badgeText)}</span>
    </div>`;
  }
  return `<div class="swap-req">
    <div>
      <div class="swap-info"><strong>Vahetus:</strong> ${esc(r.fromKey)} &rarr; ${esc(r.toKey)} (${esc(r.targetEmp)})</div>
      <div class="swap-meta">${esc(r.fromStart)}&ndash;${esc(r.fromEnd)}</div>
    </div>
    <span class="badge ${badgeClass}">${esc(badgeText)}</span>
  </div>`;
}

function safeColor(color) {
  return /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : '#378ADD';
}

function locOptions(selectedId) {
  if (!state.locations.length) return `<option value="">-- Lisa esmalt töökohad --</option>`;
  return state.locations.map(l =>
    `<option value="${attr(l.id)}"${l.id===selectedId?' selected':''}>${esc(l.name)}</option>`
  ).join('');
}

function buildModal() {
  const m = state.modal;

  if (m.type === 'add') {
    const defDate = `${state.year}-${String(state.month+1).padStart(2,'0')}-${String(m.day||today.getDate()).padStart(2,'0')}`;
    const defLoc = state.locations[0]?.id || '';
    return modalShell('Lisa vahetus', `
      <label>Töötaja</label>
      <select id="m-emp">${state.employees.map(e=>`<option>${esc(e)}</option>`).join('')}</select>
      <label>Kuupäev</label>
      <input type="date" id="m-date" value="${attr(defDate)}">
      <label>Töökoht</label>
      <select id="m-loc">${locOptions(defLoc)}</select>
      <label>Algus</label>
      <input type="time" id="m-start" value="08:00">
      <label>Lõpp</label>
      <input type="time" id="m-end" value="16:00">
      ${modalErrorHtml()}
      <div class="modal-actions">
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save">Lisa</button>
      </div>`);
  }

  if (m.type === 'edit') {
    return modalShell(`${esc(m.shift.emp)} - ${esc(m.key)}`, `
      <label>Töökoht</label>
      <select id="m-loc">${locOptions(m.shift.locId)}</select>
      <label>Algus</label>
      <input type="time" id="m-start" value="${attr(m.shift.start)}">
      <label>Lõpp</label>
      <input type="time" id="m-end" value="${attr(m.shift.end)}">
      ${modalErrorHtml()}
      <div class="modal-actions">
        <button class="btn-danger" id="btn-delete">Kustuta</button>
        <button class="btn-secondary" id="btn-cancel">Tühista</button>
        <button class="btn-primary" id="btn-save">Salvesta</button>
      </div>`);
  }

  if (m.type === 'swap') return buildSwapModal(m);
  if (m.type === 'employees') return buildEmployeesModal();
  if (m.type === 'locations') return buildLocationsModal();
  if (m.type === 'edit-location') return buildEditLocationModal(m);
  if (m.type === 'day-shifts') return buildDayShiftsModal(m);
  if (m.type === 'add-wish') return buildWishModal();
  return '';
}

function modalShell(title, body) {
  return `<div class="modal-bg" id="modal-bg"><div class="modal"><h3>${title}</h3>${body}</div></div>`;
}

function modalErrorHtml() {
  return state.modalError ? `<div style="color:#C0392B;font-size:12px;margin-top:10px;font-weight:600;">${esc(state.modalError)}</div>` : '';
}

function buildSwapModal(m) {
  const y = state.year, mo = state.month;
  const dim = new Date(y, mo+1, 0).getDate();
  const emp = state.isManager ? (state.selectedEmployee || state.employees[0]) : getEmployeeForUser();
  const myShifts = [];
  for (let d = 1; d <= dim; d++) {
    const key = shiftKey(y, mo, d);
    (state.shifts[key]||[]).filter(x => x.emp === emp).forEach(s => myShifts.push({key, d, s}));
  }
  if (!myShifts.length) {
    return modalShell('Taotle vahetust', `<p style="color:var(--text2);font-size:14px;margin-top:0.5rem">Sul pole sellel kuul ühtegi vahetust.</p>
      <div class="modal-actions"><button class="btn-secondary" id="btn-cancel">Sulge</button></div>`);
  }

  const preTarget = m.preTargetEmp || '';
  const preDate = m.preToKey || `${y}-${String(mo+1).padStart(2,'0')}-${String(myShifts[0].d).padStart(2,'0')}`;
  const otherEmps = state.employees.filter(e => e !== emp);
  return modalShell('Taotle vahetust', `
    <label>Minu vahetus</label>
    <select id="m-from">
      ${myShifts.map(x=>`<option value="${attr(`${x.key}|${x.s.start}|${x.s.end}`)}">${x.d}. ${esc(MONTHS[mo].slice(0,3))} - ${esc(x.s.start)}&ndash;${esc(x.s.end)}</option>`).join('')}
    </select>
    <label>Kellega soovid vahetada?</label>
    <select id="m-target-emp">
      ${otherEmps.map(e => `<option${e===preTarget?' selected':''}>${esc(e)}</option>`).join('')}
    </select>
    <label>Soovitud kuupäev</label>
    <input type="date" id="m-todate" value="${attr(preDate)}">
    ${modalErrorHtml()}
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancel">Tühista</button>
      <button class="btn-primary" id="btn-save">Saada taotlus</button>
    </div>`);
}

function buildEmployeesModal() {
  return modalShell('Töötajad', `
    <div class="list-scroll">
      ${state.employees.map((e,i) => `<div class="list-row">
        <span class="list-row-name">${esc(e)}</span>
        <button class="btn-icon" data-remove-emp="${i}" title="Kustuta">Kustuta</button>
      </div>`).join('')}
    </div>
    <div class="inline-add">
      <input type="text" id="new-emp-name" placeholder="Uus nimi...">
      <button class="btn-primary" id="btn-add-emp">Lisa</button>
    </div>
    ${modalErrorHtml()}
    <div class="modal-actions"><button class="btn-secondary" id="btn-cancel">Sulge</button></div>`);
}

function buildLocationsModal() {
  return modalShell('Töökohad', `
    <div class="list-scroll">
      ${state.locations.map((l,i) => `<div class="list-row">
        <span class="loc-dot" style="background:${attr(safeColor(l.color))}"></span>
        <span class="list-row-name">${esc(l.name)}</span>
        <button class="btn-icon" data-edit-loc="${i}" title="Muuda">Muuda</button>
        <button class="btn-icon" data-remove-loc="${i}" title="Kustuta">Kustuta</button>
      </div>`).join('')}
    </div>
    <div class="inline-add">
      <input type="text" id="new-loc-name" placeholder="Uus töökoht...">
      <input type="color" id="new-loc-color" value="${PRESET_COLORS[state.locations.length % PRESET_COLORS.length]}" style="width:40px;height:36px;padding:2px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border2)">
      <button class="btn-primary" id="btn-add-loc">Lisa</button>
    </div>
    ${modalErrorHtml()}
    <div class="modal-actions"><button class="btn-secondary" id="btn-cancel">Sulge</button></div>`);
}

function buildEditLocationModal(m) {
  const loc = state.locations[m.idx];
  if (!loc) return '';
  return modalShell('Muuda töökohta', `
    <label>Nimi</label>
    <input type="text" id="edit-loc-name" value="${attr(loc.name)}">
    <label>Värv</label>
    <div style="display:flex;align-items:center;gap:12px;margin-top:6px">
      <input type="color" id="edit-loc-color" value="${attr(safeColor(loc.color))}" style="width:56px;height:40px;padding:2px;border-radius:8px;cursor:pointer;border:0.5px solid var(--border2)">
      <div class="color-presets">
        ${PRESET_COLORS.map(c => `<button class="preset-dot${loc.color===c?' selected':''}" style="background:${c}" data-preset="${c}"></button>`).join('')}
      </div>
    </div>
    ${modalErrorHtml()}
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancel">Tühista</button>
      <button class="btn-primary" id="btn-save">Salvesta</button>
    </div>`);
}

function buildDayShiftsModal(m) {
  const key = shiftKey(state.year, state.month, m.day);
  const dayShifts = state.shifts[key] || [];
  return modalShell(`Vahetused: ${m.day}. ${esc(MONTHS[state.month])}`, `
    <div class="list-scroll" style="max-height:240px; padding:4px;">
      ${dayShifts.map(s => {
        const loc = getLocation(s.locId);
        const color = safeColor(loc ? loc.color : '');
        const bg = loc ? lightBg(color) : 'var(--bg2)';
        const border = loc ? color : 'var(--border2)';
        const text = loc ? color : 'var(--text2)';
        if (state.view === 'manager' && state.isManager) {
          return `<div class="shift-pill" style="background:${bg};color:${text};border-left:3px solid ${border};cursor:pointer;padding:6px 10px;margin-bottom:6px;border-radius:4px;" data-shiftid="${attr(s.id)}" data-key="${attr(key)}">
            <strong>${esc(s.emp)}</strong>: ${esc(s.start)} - ${esc(s.end)} ${loc ? `(${esc(loc.name)})` : ''}
          </div>`;
        }
        return `<div class="shift-pill worker-shift-pill" style="background:${bg};color:${text};border-left:3px solid ${border};cursor:pointer;padding:6px 10px;margin-bottom:6px;border-radius:4px;" data-swap-emp="${attr(s.emp)}" data-swap-key="${attr(key)}">
          <strong>${esc(s.emp)}</strong>: ${esc(s.start)} - ${esc(s.end)} ${loc ? `(${esc(loc.name)})` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="modal-actions">
      ${state.view === 'manager' && state.isManager ? `<button class="btn-primary" id="btn-add-from-more" data-day="${m.day}">+ Lisa uus</button>` : ''}
      <button class="btn-secondary" id="btn-cancel">Sulge</button>
    </div>`);
}

function buildWishModal() {
  const defDate = `${state.year}-${String(state.month+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  const emp = state.isManager ? (state.selectedEmployee || state.employees[0] || '') : (getEmployeeForUser() || '');
  return modalShell('Saada soovitud kellaaeg', `
    <p style="font-size:12px;color:var(--text2);margin-bottom:12px;">Saada juhile soov kindlal kuupäeval ja kellaajal töötamiseks.</p>
    <label>Töötaja</label>
    <input type="text" value="${attr(emp)}" disabled style="background:var(--bg2); color:var(--text3);">
    <label>Kuupäev</label>
    <input type="date" id="m-wish-date" value="${attr(defDate)}">
    <label>Algus</label>
    <input type="time" id="m-wish-start" value="08:00">
    <label>Lõpp</label>
    <input type="time" id="m-wish-end" value="16:00">
    ${modalErrorHtml()}
    <div class="modal-actions">
      <button class="btn-secondary" id="btn-cancel">Tühista</button>
      <button class="btn-primary" id="btn-save-wish">Saada soov</button>
    </div>`);
}

// ---- EVENTS ----
function attachAuthEvents() {
  ge('auth-toggle')?.addEventListener('click', () => {
    state.authMode = state.authMode === 'login' ? 'register' : 'login';
    state.authError = null;
    render();
  });
  ge('auth-submit')?.addEventListener('click', () => {
    const email = ge('auth-email').value.trim();
    const password = ge('auth-password').value;
    if (state.authMode === 'register') {
      const displayName = ge('auth-display-name').value.trim();
      if (!displayName) {
        state.authError = 'Sisesta töötaja nimi täpselt nii nagu graafikus.';
        render();
        return;
      }
      signUpWorker(email, password, displayName);
    } else {
      signIn(email, password);
    }
  });
}

function attachEvents() {
  ge('btn-prev')?.addEventListener('click', () => {
    state.month--; if (state.month < 0) { state.month=11; state.year--; } render();
  });
  ge('btn-next')?.addEventListener('click', () => {
    state.month++; if (state.month > 11) { state.month=0; state.year++; } render();
  });
  ge('btn-logout')?.addEventListener('click', () => auth.signOut());

  document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.view === 'manager' && !state.isManager) return;
    state.view = b.dataset.view;
    render();
  }));

  ge('btn-add-shift')?.addEventListener('click', () => {
    if (!requireManager()) return;
    state.modal = {type:'add', day:today.getDate()}; state.modalError = null; render();
  });
  ge('btn-manage-emp')?.addEventListener('click', () => {
    if (!requireManager()) return;
    state.modal = {type:'employees'}; state.modalError = null; render();
  });
  ge('btn-manage-loc')?.addEventListener('click', () => {
    if (!requireManager()) return;
    state.modal = {type:'locations'}; state.modalError = null; render();
  });

  document.querySelectorAll('[data-addday]').forEach(cell => {
    cell.addEventListener('click', e => {
      if (!requireManager()) return;
      if (e.target.closest('[data-shiftid]') || e.target.closest('[data-moreday]')) return;
      state.modal = {type:'add', day:parseInt(cell.dataset.addday, 10)}; state.modalError = null; render();
    });
  });
  document.querySelectorAll('[data-shiftid]').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      if (!requireManager()) return;
      const key = pill.dataset.key;
      const shift = (state.shifts[key]||[]).find(s => s.id === pill.dataset.shiftid);
      if (shift) { state.modal = {type:'edit', key, shift}; state.modalError = null; render(); }
    });
  });

  document.querySelectorAll('.worker-shift-pill').forEach(pill => {
    pill.addEventListener('click', e => {
      e.stopPropagation();
      const myEmp = state.isManager ? state.selectedEmployee : requireEmployee();
      if (!myEmp) return;
      const targetEmp = pill.dataset.swapEmp;
      const toKey = pill.dataset.swapKey;
      if (targetEmp === myEmp) {
        alert('Sa ei saa enda vahetust endaga vahetada.');
        return;
      }
      state.modal = { type: 'swap', preTargetEmp: targetEmp, preToKey: toKey };
      state.modalError = null;
      render();
    });
  });

  document.querySelectorAll('[data-moreday]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      state.modal = {type:'day-shifts', day:parseInt(btn.dataset.moreday, 10)}; state.modalError = null; render();
    });
  });

  ge('btn-add-from-more')?.addEventListener('click', () => {
    if (!requireManager()) return;
    const day = parseInt(ge('btn-add-from-more').dataset.day, 10);
    state.modal = {type:'add', day}; state.modalError = null; render();
  });

  ge('btn-add-wish')?.addEventListener('click', () => {
    if (!state.isManager && !requireEmployee()) return;
    state.modal = {type:'add-wish'}; state.modalError = null; render();
  });
  ge('btn-req-swap')?.addEventListener('click', () => {
    if (!state.isManager && !requireEmployee()) return;
    state.modal = {type:'swap'}; state.modalError = null; render();
  });

  document.querySelectorAll('.peer-approve-btn').forEach(b => {
    b.addEventListener('click', () => {
      const emp = state.isManager ? state.selectedEmployee : requireEmployee();
      const r = state.swapRequests.find(x => x.id === b.dataset.peerApprove);
      if (r && r.targetEmp === emp && r.status === 'pending_peer') updateSwapStatus(r.id, 'pending');
    });
  });
  document.querySelectorAll('.peer-reject-btn').forEach(b => {
    b.addEventListener('click', () => {
      const emp = state.isManager ? state.selectedEmployee : requireEmployee();
      const r = state.swapRequests.find(x => x.id === b.dataset.peerReject);
      if (r && r.targetEmp === emp && r.status === 'pending_peer') removeSwapRequest(r.id);
    });
  });

  document.querySelectorAll('[data-approve]').forEach(b => {
    b.addEventListener('click', () => approveRequest(b.dataset.approve));
  });
  document.querySelectorAll('[data-reject]').forEach(b => {
    b.addEventListener('click', () => {
      if (!requireManager()) return;
      removeSwapRequest(b.dataset.reject);
    });
  });

  ge('emp-select')?.addEventListener('change', e => {
    if (!state.isManager) return;
    state.selectedEmployee = e.target.value; render();
  });

  ge('modal-bg')?.addEventListener('click', e => {
    if (e.target === ge('modal-bg')) { state.modal=null; state.modalError = null; render(); }
  });
  ge('btn-cancel')?.addEventListener('click', () => { state.modal=null; state.modalError = null; render(); });
  ge('btn-delete')?.addEventListener('click', deleteCurrentShift);
  ge('btn-save-wish')?.addEventListener('click', saveWish);
  ge('btn-save')?.addEventListener('click', saveModal);

  attachLocationAndEmployeeEvents();
}

function approveRequest(id) {
  if (!requireManager()) return;
  const r = state.swapRequests.find(x => x.id === id);
  if (!r || r.status !== 'pending') return;

  if (r.type === 'wish') {
    const error = validateTimeRange(r.toStart, r.toEnd);
    if (error || checkOverlap(r.emp, r.toKey, r.toStart, r.toEnd)) {
      showModalError(error || 'Töötajal on sel ajal juba teine vahetus.');
      return;
    }
    if (!state.shifts[r.toKey]) state.shifts[r.toKey] = [];
    state.shifts[r.toKey].push({
      emp: r.emp,
      start: r.toStart,
      end: r.toEnd,
      locId: state.locations[0]?.id || '',
      id: uid()
    });
    r.status = 'approved';
  } else {
    const shiftA = findShiftByRequest(r);
    const shiftB = findShiftByEmpAndDate(r.targetEmp, r.toKey);
    if (!shiftA || shiftA.shift.emp !== r.emp) {
      showModalError('Algset vahetust ei leitud või see on juba muutunud.');
      return;
    }
    if (!shiftB) {
      showModalError('Soovitud kuupäeval ei leitud teise töötaja vahetust.');
      return;
    }
    shiftA.shift.emp = r.targetEmp;
    shiftB.shift.emp = r.emp;
    r.status = 'approved';
  }
  pushAll();
}

function findShiftById(id) {
  for (const key of Object.keys(state.shifts)) {
    const shift = (state.shifts[key] || []).find(s => s.id === id);
    if (shift) return {key, shift};
  }
  return null;
}

function findShiftByRequest(r) {
  const shift = (state.shifts[r.fromKey] || []).find(s =>
    s.emp === r.emp && s.start === r.fromStart && s.end === r.fromEnd
  );
  return shift ? {key: r.fromKey, shift} : null;
}

function findShiftByEmpAndDate(emp, key) {
  const shift = (state.shifts[key] || []).find(s => s.emp === emp);
  return shift ? {key, shift} : null;
}

function deleteCurrentShift() {
  if (!requireManager()) return;
  const m = state.modal;
  if (!m || m.type !== 'edit') return;
  if (!confirm('Kas oled kindel, et soovid selle vahetuse kustutada?')) return;
  if (state.shifts[m.key]) state.shifts[m.key] = state.shifts[m.key].filter(s => s.id !== m.shift.id);
  state.modal=null;
  pushAll();
}

function saveWish() {
  const dateVal = ge('m-wish-date').value;
  const start = ge('m-wish-start').value;
  const end = ge('m-wish-end').value;
  const emp = state.isManager ? (state.selectedEmployee || state.employees[0]) : requireEmployee();
  if (!emp) return;
  if (!isValidDateValue(dateVal)) return showModalError('Sisesta korrektne kuupäev.');
  const rangeError = validateTimeRange(start, end);
  if (rangeError) return showModalError(rangeError);

  const [y,mo,d] = dateVal.split('-').map(Number);
  const toKey = shiftKey(y, mo-1, d);
  if (checkOverlap(emp, toKey, start, end)) return showModalError('Sul on sel ajal juba graafikus teine vahetus.');

  saveSwapRequest({
    id: uid(),
    emp,
    toKey,
    toStart: start,
    toEnd: end,
    type: 'wish',
    status: 'pending'
  });
  state.modal = null;
}

function saveModal() {
  const m = state.modal;
  if (!m) return;
  if (m.type === 'add') return saveAddedShift();
  if (m.type === 'edit') return saveEditedShift();
  if (m.type === 'swap') return saveSwap();
  if (m.type === 'edit-location') return saveEditedLocation();
}

function saveAddedShift() {
  if (!requireManager()) return;
  const emp = ge('m-emp').value;
  const dateVal = ge('m-date').value;
  const locId = ge('m-loc')?.value || '';
  const start = ge('m-start').value;
  const end = ge('m-end').value;
  if (!isValidDateValue(dateVal)) return showModalError('Sisesta korrektne kuupäev.');
  const rangeError = validateTimeRange(start, end);
  if (rangeError) return showModalError(rangeError);
  const [y,mo,d] = dateVal.split('-').map(Number);
  const key = shiftKey(y, mo-1, d);
  if (checkOverlap(emp, key, start, end)) return showModalError(`Töötajal ${emp} on sel ajal juba teine vahetus.`);
  if (!state.shifts[key]) state.shifts[key] = [];
  state.shifts[key].push({emp, start, end, locId, id:uid()});
  state.year=y; state.month=mo-1; state.modal=null; pushAll();
}

function saveEditedShift() {
  if (!requireManager()) return;
  const m = state.modal;
  const locId = ge('m-loc')?.value || '';
  const start = ge('m-start').value;
  const end = ge('m-end').value;
  const rangeError = validateTimeRange(start, end);
  if (rangeError) return showModalError(rangeError);
  if (checkOverlap(m.shift.emp, m.key, start, end, m.shift.id)) {
    return showModalError(`Töötajal ${m.shift.emp} on sel ajal juba teine vahetus.`);
  }
  const s = (state.shifts[m.key]||[]).find(x => x.id === m.shift.id);
  if (s) { s.start=start; s.end=end; s.locId=locId; }
  state.modal=null; pushAll();
}

function saveSwap() {
  const fromVal = ge('m-from').value;
  const toDateVal = ge('m-todate').value;
  const targetEmp = ge('m-target-emp').value;
  const emp = state.isManager ? (state.selectedEmployee || state.employees[0]) : requireEmployee();
  if (!emp) return;
  if (!fromVal || !targetEmp) return showModalError('Vali vahetused.');
  if (!isValidDateValue(toDateVal)) return showModalError('Sisesta korrektne kuupäev.');
  const [fromKey, fromStart, fromEnd] = fromVal.split('|');
  const found = {
    key: fromKey,
    shift: (state.shifts[fromKey] || []).find(s => s.emp === emp && s.start === fromStart && s.end === fromEnd)
  };
  if (!found.shift) return showModalError('Seda vahetust ei leitud või see ei kuulu sulle.');
  const [y,mo,d] = toDateVal.split('-').map(Number);
  const toKey = shiftKey(y, mo-1, d);
  if (!findShiftByEmpAndDate(targetEmp, toKey)) return showModalError('Valitud kuupäeval ei ole sellel töötajal vahetust.');

  saveSwapRequest({
    id: uid(),
    emp,
    targetEmp,
    fromKey: found.key,
    fromStart: found.shift.start,
    fromEnd: found.shift.end,
    toKey,
    type: 'swap',
    status: 'pending_peer'
  });
  state.modal = null;
}

function saveEditedLocation() {
  if (!requireManager()) return;
  const m = state.modal;
  const name = ge('edit-loc-name').value.trim();
  const color = safeColor(ge('edit-loc-color').value);
  if (!name) return showModalError('Sisesta töökoha nimi.');
  state.locations[m.idx].name = name;
  state.locations[m.idx].color = color;
  state.modal = {type:'locations'};
  pushAll();
}

function attachLocationAndEmployeeEvents() {
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
    if (!requireManager()) return;
    const input = ge('new-emp-name');
    const name = input.value.trim();
    if (!name || state.employees.includes(name)) return showModalError('Sisesta uus ja kordumatu töötaja nimi.');
    state.employees.push(name);
    if (!state.selectedEmployee) state.selectedEmployee = name;
    state.modal={type:'employees'};
    pushAll();
  });
  ge('new-emp-name')?.addEventListener('keydown', e => { if(e.key==='Enter') ge('btn-add-emp')?.click(); });

  document.querySelectorAll('[data-remove-emp]').forEach(b => {
    b.addEventListener('click', () => {
      if (!requireManager()) return;
      const idx = parseInt(b.dataset.removeEmp, 10);
      const removed = state.employees[idx];
      if (!removed) return;
      if (!confirm(`Kas soovid töötaja "${removed}" eemaldada? Sellega eemaldatakse ka tema vahetused.`)) return;
      state.employees.splice(idx, 1);
      if (state.selectedEmployee === removed) state.selectedEmployee = state.employees[0]||null;
      Object.keys(state.shifts).forEach(key => {
        state.shifts[key] = state.shifts[key].filter(s => s.emp !== removed);
      });
      state.modal={type:'employees'};
      pushAll();
    });
  });

  ge('btn-add-loc')?.addEventListener('click', () => {
    if (!requireManager()) return;
    const nameInput = ge('new-loc-name');
    const color = safeColor(ge('new-loc-color').value);
    const name = nameInput.value.trim();
    if (!name) return showModalError('Sisesta töökoha nimi.');
    state.locations.push({id:uid(), name, color});
    state.modal={type:'locations'};
    pushAll();
  });
  ge('new-loc-name')?.addEventListener('keydown', e => { if(e.key==='Enter') ge('btn-add-loc')?.click(); });

  document.querySelectorAll('[data-remove-loc]').forEach(b => {
    b.addEventListener('click', () => {
      if (!requireManager()) return;
      const idx = parseInt(b.dataset.removeLoc, 10);
      const loc = state.locations[idx];
      if (!loc) return;
      if (!confirm(`Kas soovid töökoha "${loc.name}" eemaldada?`)) return;
      const locId = loc.id;
      state.locations.splice(idx, 1);
      Object.keys(state.shifts).forEach(key => {
        state.shifts[key].forEach(s => { if(s.locId===locId) s.locId=null; });
      });
      state.modal={type:'locations'};
      pushAll();
    });
  });

  document.querySelectorAll('[data-edit-loc]').forEach(b => {
    b.addEventListener('click', () => {
      if (!requireManager()) return;
      state.modal = {type:'edit-location', idx:parseInt(b.dataset.editLoc, 10)};
      state.modalError = null;
      render();
    });
  });
}

function ge(id) { return document.getElementById(id); }

// ---- INIT ----
initFirebase();
