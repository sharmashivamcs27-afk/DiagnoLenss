// ═══════════════════════════════════════════════════════════════
// DiagnoLens — script.js  (Firebase Edition)
// All data stored in Firebase Firestore
// ═══════════════════════════════════════════════════════════════

// ── FIREBASE SETUP ────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc,
  query, where, orderBy, limit, deleteDoc, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyCu73_NE4dxqFThcaBmhh3Hhn8RvZyOIxU",
  authDomain:        "diagnolens-5223a.firebaseapp.com",
  projectId:         "diagnolens-5223a",
  storageBucket:     "diagnolens-5223a.firebasestorage.app",
  messagingSenderId: "216728346792",
  appId:             "1:216728346792:web:02e833698f1d88e4c0629d",
  measurementId:     "G-JE3KNX0GDB"
};

const firebaseApp = initializeApp(firebaseConfig);
const db          = getFirestore(firebaseApp);

// ══════════════════════════════════════════════════════════════
// ── FIREBASE DATABASE ENGINE ──────────────────────────────────
// ══════════════════════════════════════════════════════════════
const DB = {
  newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); },

  // ── USERS ────────────────────────────────────────────────────
  async getUsers() {
    const snap = await getDocs(collection(db, 'users'));
    return snap.docs.map(d => d.data());
  },
  async getUserByEmail(email) {
    const q = query(collection(db, 'users'), where('email', '==', email), limit(1));
    const snap = await getDocs(q);
    return snap.empty ? null : snap.docs[0].data();
  },
  async getUserById(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  },
  async saveUser(user) {
    await setDoc(doc(db, 'users', user.uid), user, { merge: true });
  },
  async deleteUser(uid) {
    await deleteDoc(doc(db, 'users', uid));
  },

  // ── APPOINTMENTS ─────────────────────────────────────────────
  async getAppointments() {
    const snap = await getDocs(collection(db, 'appointments'));
    return snap.docs.map(d => d.data());
  },
  async getApptsByUser(uid) {
    const q = query(collection(db, 'appointments'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  },
  async saveAppt(appt) {
    await setDoc(doc(db, 'appointments', appt.id), appt, { merge: true });
    return appt;
  },
  async updateAppt(id, fields) {
    await updateDoc(doc(db, 'appointments', id), fields);
  },
  async isTaken(hospitalId, dept, date, slot) {
    const q = query(collection(db, 'appointments'),
      where('hospitalId', '==', hospitalId),
      where('dept', '==', dept),
      where('date', '==', date),
      where('slot', '==', slot));
    const snap = await getDocs(q);
    return snap.docs.some(d => d.data().status !== 'cancelled');
  },
  async countActive(hospitalId, dept) {
    const q = query(collection(db, 'appointments'),
      where('hospitalId', '==', hospitalId),
      where('dept', '==', dept));
    const snap = await getDocs(q);
    return snap.docs.filter(d => d.data().status !== 'cancelled').length;
  },
  async getTakenSlots(hospitalId, dept, date) {
    const q = query(collection(db, 'appointments'),
      where('hospitalId', '==', hospitalId),
      where('dept', '==', dept),
      where('date', '==', date));
    const snap = await getDocs(q);
    return snap.docs.filter(d => d.data().status !== 'cancelled').map(d => d.data().slot);
  },

  // ── NOTIFICATIONS ─────────────────────────────────────────────
  async saveNotification(n) {
    await setDoc(doc(db, 'notifications', n.id), n);
  },
  async getNotisByUser(uid) {
    const q = query(collection(db, 'notifications'), where('userId', '==', uid));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data()).sort((a, b) => b.createdAt - a.createdAt);
  },

  // ── SESSION (localStorage only — session doesn't need cloud) ─
  getSession()    { try { return JSON.parse(localStorage.getItem('dl_session') || 'null'); } catch { return null; } },
  setSession(uid) { localStorage.setItem('dl_session', JSON.stringify(uid)); },
  clearSession()  { localStorage.removeItem('dl_session'); },

  // ── CONFIG URLS (localStorage — device-specific settings) ─────
  getConfigUrl(key)        { return localStorage.getItem('dl_' + key) || ''; },
  setConfigUrl(key, val)   { localStorage.setItem('dl_' + key, val); },
};

// ── SEED DEFAULT ADMIN ACCOUNT ────────────────────────────────
async function seedDefaultAdmin() {
  const correctHash = hashPassFn('Admin@123');
  const existing = await DB.getUserByEmail('admin@diagnolens.com');
  if (!existing) {
    await DB.saveUser({
      uid: 'admin-default-001',
      name: 'DiagnoLens Admin',
      email: 'admin@diagnolens.com',
      phone: '+919999900000',
      role: 'admin',
      hospital: 'DiagnoLens HQ',
      passwordHash: correctHash,
      createdAt: Date.now()
    });
  } else if (existing.passwordHash !== correctHash) {
    existing.passwordHash = correctHash;
    await DB.saveUser(existing);
  }
}

function hashPassFn(p) {
  let h = 0;
  for (let i = 0; i < p.length; i++) h = (Math.imul(31, h) + p.charCodeAt(i)) | 0;
  return 'h_' + Math.abs(h).toString(36) + '_' + p.length;
}

// ── HOSPITAL DATA ─────────────────────────────────────────────
const HOSPITALS = {
  "Delhi": [
    { id: "fortis-delhi", name: "Fortis Hospital", abbr: "FOR", depts: ["Cardiology", "Neurology", "Orthopaedics", "Oncology", "Gynaecology", "ENT", "Dermatology", "Nephrology"] },
    { id: "aiims-delhi", name: "AIIMS Delhi", abbr: "AII", depts: ["General Medicine", "Cardiology", "Neurology", "Orthopaedics", "Paediatrics", "Psychiatry", "Ophthalmology"] },
    { id: "apollo-delhi", name: "Apollo Hospitals Delhi", abbr: "APO", depts: ["Cardiology", "Oncology", "Neurology", "Gastroenterology", "Urology", "Pulmonology"] },
    { id: "max-delhi", name: "Max Super Speciality", abbr: "MAX", depts: ["Cardiology", "Orthopaedics", "Neurology", "Oncology", "Transplant", "Bariatric Surgery"] }
  ],
  "Mumbai": [
    { id: "lilavati-mumbai", name: "Lilavati Hospital", abbr: "LIL", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Ophthalmology", "Nephrology"] },
    { id: "kokilaben-mumbai", name: "Kokilaben Dhirubhai Ambani", abbr: "KOK", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Transplant", "Robotic Surgery"] },
    { id: "hinduja-mumbai", name: "P.D. Hinduja Hospital", abbr: "HIN", depts: ["Cardiology", "Gastroenterology", "Nephrology", "Oncology", "Neurology", "ENT"] },
    { id: "breach-candy", name: "Breach Candy Hospital", abbr: "BRC", depts: ["General Surgery", "Gynaecology", "Orthopaedics", "Cardiology", "Neurology"] }
  ],
  "Bangalore": [
    { id: "manipal-blr", name: "Manipal Hospital", abbr: "MAN", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Transplant", "Urology"] },
    { id: "narayana-blr", name: "Narayana Health", abbr: "NAR", depts: ["Cardiology", "Neurosurgery", "Oncology", "Paediatrics", "Orthopaedics", "Nephrology"] },
    { id: "fortis-blr", name: "Fortis Hospital Bangalore", abbr: "FBL", depts: ["Cardiology", "Orthopaedics", "Oncology", "Neurology", "Gynaecology", "Urology"] }
  ],
  "Chennai": [
    { id: "apollo-chennai", name: "Apollo Hospitals Chennai", abbr: "APH", depts: ["Cardiology", "Neurology", "Oncology", "Gastroenterology", "Transplant", "Ophthalmology"] },
    { id: "miot-chennai", name: "MIOT International", abbr: "MIO", depts: ["Orthopaedics", "Cardiology", "Neurology", "Spine", "Sports Medicine"] },
    { id: "kmch-chennai", name: "Kovai Medical Centre", abbr: "KMC", depts: ["Cardiology", "Neurology", "Oncology", "Nephrology", "Paediatrics"] }
  ],
  "Hyderabad": [
    { id: "yashoda-hyd", name: "Yashoda Hospital", abbr: "YAS", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Gastroenterology", "Nephrology"] },
    { id: "kims-hyd", name: "KIMS Hospital", abbr: "KIM", depts: ["Cardiology", "Neurology", "Transplant", "Oncology", "Urology", "Gynaecology"] },
    { id: "care-hyd", name: "CARE Hospitals", abbr: "CAR", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Emergency Medicine"] }
  ],
  "Kolkata": [
    { id: "amri-kol", name: "AMRI Hospitals", abbr: "AMR", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Gynaecology", "Nephrology"] },
    { id: "medica-kol", name: "Medica Superspecialty", abbr: "MED", depts: ["Cardiology", "Neurology", "Oncology", "Nephrology", "Transplant"] },
    { id: "bellevue-kol", name: "Bellevue Clinic", abbr: "BEL", depts: ["General Medicine", "Cardiology", "Neurology", "Orthopaedics", "ENT", "Ophthalmology"] }
  ],
  "Pune": [
    { id: "ruby-pune", name: "Ruby Hall Clinic", abbr: "RUB", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Gastroenterology"] },
    { id: "jehangir-pune", name: "Jehangir Hospital", abbr: "JEH", depts: ["Cardiology", "Orthopaedics", "Gynaecology", "Paediatrics", "Neurology"] }
  ],
  "Gurgaon": [
    { id: "medanta-grg", name: "Medanta — The Medicity", abbr: "MDT", depts: ["Cardiology", "Neurology", "Oncology", "Transplant", "Orthopaedics", "Bariatric Surgery", "Urology"] },
    { id: "artemis-grg", name: "Artemis Hospital", abbr: "ART", depts: ["Cardiology", "Neurology", "Oncology", "Orthopaedics", "Nephrology", "Gastroenterology"] }
  ]
};

const DEPT_ABBR = {
  "Cardiology": "CAR", "Neurology": "NEU", "Orthopaedics": "ORT", "Oncology": "ONC",
  "Gynaecology": "GYN", "ENT": "ENT", "Dermatology": "DER", "Nephrology": "NEP",
  "General Medicine": "GMD", "Paediatrics": "PAD", "Psychiatry": "PSY", "Ophthalmology": "OPH",
  "Gastroenterology": "GAS", "Urology": "URO", "Pulmonology": "PUL", "Transplant": "TRP",
  "Bariatric Surgery": "BAR", "General Surgery": "GSR", "Spine": "SPN", "Sports Medicine": "SPO",
  "Emergency Medicine": "EMG", "Neurosurgery": "NSG", "Surgery": "SUR"
};

const TIME_SLOTS = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00"];

const DOCTORS = [
  { id: "dr-sharma", name: "Dr. Priya Sharma", spec: "Cardiologist", hospital: "Fortis Hospital, Delhi", emoji: "👩‍⚕️", status: "online", fee: "₹800", rating: "⭐ 4.9 (312 reviews)", available: true },
  { id: "dr-mehta", name: "Dr. Rohan Mehta", spec: "Neurologist", hospital: "Apollo Hospitals, Delhi", emoji: "👨‍⚕️", status: "online", fee: "₹1,000", rating: "⭐ 4.8 (198 reviews)", available: true },
  { id: "dr-iyer", name: "Dr. Kavitha Iyer", spec: "Orthopaedic Surgeon", hospital: "AIIMS Delhi", emoji: "👩‍⚕️", status: "busy", fee: "₹900", rating: "⭐ 4.7 (245 reviews)", available: false },
  { id: "dr-khan", name: "Dr. Imran Khan", spec: "Oncologist", hospital: "Max Super Speciality", emoji: "👨‍⚕️", status: "online", fee: "₹1,200", rating: "⭐ 4.9 (401 reviews)", available: true },
  { id: "dr-reddy", name: "Dr. Supriya Reddy", spec: "Gynaecologist", hospital: "Kokilaben Hospital", emoji: "👩‍⚕️", status: "online", fee: "₹750", rating: "⭐ 4.8 (289 reviews)", available: true },
  { id: "dr-nair", name: "Dr. Anil Nair", spec: "Gastroenterologist", hospital: "P.D. Hinduja Hospital", emoji: "👨‍⚕️", status: "offline", fee: "₹850", rating: "⭐ 4.6 (175 reviews)", available: false }
];

// ── STATE ─────────────────────────────────────────────────────
let currentUser       = null;
let currentRole       = 'patient';
let bookingForm       = {};
let adminFilter       = 'appointments';
let currentApptFilter = 'all';
let callTimer         = null;
let callSeconds       = 0;
let localStream       = null;
let peerConnection    = null;
let waAlertLog        = [];
let pendingCancelId   = null;

// ── HELPERS ───────────────────────────────────────────────────
function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function getHospitalById(id) {
  for (const city in HOSPITALS) { const h = HOSPITALS[city].find(h => h.id === id); if (h) return h; } return null;
}
function formatDate(str) {
  if (!str) return '—';
  try { return new Date(str + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return str; }
}
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast visible' + (type ? ' ' + type : '');
  clearTimeout(t._to); t._to = setTimeout(() => t.classList.remove('visible'), 3500);
}
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active'); window.scrollTo(0, 0);
}
function showAuthError(msg) { const el = document.getElementById('auth-error'); el.textContent = msg; el.classList.add('visible'); }
function clearAuthError()   { document.getElementById('auth-error').classList.remove('visible'); }
function fmtSecs(s)         { return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
function hashPass(p)        { return hashPassFn(p); }

// ── BOOT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  showToast('🔗 Connecting to Firebase…', 'info');
  try {
    await seedDefaultAdmin();
    const uid = DB.getSession();
    if (uid) {
      const user = await DB.getUserById(uid);
      if (user) { currentUser = user; afterLogin(user); return; }
      DB.clearSession();
    }
    showPage('page-landing');
  } catch (e) {
    console.error('Boot error:', e);
    showToast('⚠️ Firebase connection issue — check console', 'error');
    showPage('page-landing');
  }
});

// ── NAVIGATION ────────────────────────────────────────────────
function goHome() { if (!currentUser) { showPage('page-landing'); return; } showPage(currentUser.role === 'admin' ? 'page-admin' : 'page-patient'); }
function goToAuth(role) { currentRole = role; switchRole(role); showPage('page-auth'); }
function navBookAppointment() {
  if (currentUser && currentUser.role === 'patient') { showPage('page-patient'); setTimeout(showBookingForm, 120); }
  else goToAuth('patient');
}
function navGoTo(pageId) {
  if (!currentUser) { goToAuth('patient'); return; }
  showPage(pageId);
  if (pageId === 'page-queue')    initQueuePage();
  if (pageId === 'page-whatsapp') initWhatsappPage();
  if (pageId === 'page-video')    initVideoPage();
  if (pageId === 'page-blood')    { hideBloodSections(); renderMyBloodRequests(); }
  if (pageId === 'page-rx')       { clearRxResult(); }
}

// ── AUTH ──────────────────────────────────────────────────────
function switchRole(role) {
  currentRole = role;
  document.getElementById('tab-patient').classList.toggle('active', role === 'patient');
  document.getElementById('tab-admin').classList.toggle('active', role === 'admin');
  const rg = document.getElementById('reg-hospital-group');
  if (rg) rg.style.display = role === 'admin' ? 'block' : 'none';
  const hint = document.getElementById('admin-cred-hint');
  if (hint) hint.style.display = role === 'admin' ? 'flex' : 'none';
  clearAuthError();
}
function switchForm(form) {
  document.getElementById('form-login').style.display    = form === 'login' ? 'block' : 'none';
  document.getElementById('form-register').style.display = form === 'register' ? 'block' : 'none';
  document.getElementById('auth-heading').textContent    = form === 'login' ? 'Welcome back' : 'Create account';
  document.getElementById('auth-subhead').textContent    = form === 'login' ? 'Sign in to your account' : 'Register as ' + currentRole;
  clearAuthError();
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim().toLowerCase();
  const pass  = document.getElementById('login-password').value;
  if (!email || !pass) { showAuthError('Please fill in all fields'); return; }
  showToast('⏳ Signing in…', 'info');
  const user = await DB.getUserByEmail(email);
  if (!user)                          { showAuthError('No account found with this email'); return; }
  if (user.passwordHash !== hashPass(pass)) { showAuthError('Incorrect password'); return; }
  if (user.role !== currentRole)      { showAuthError(`No ${currentRole} account found with these credentials`); return; }
  currentUser = user; DB.setSession(user.uid); afterLogin(user);
}

async function doRegister() {
  const fname    = document.getElementById('reg-fname').value.trim();
  const lname    = document.getElementById('reg-lname').value.trim();
  const email    = document.getElementById('reg-email').value.trim().toLowerCase();
  const phone    = document.getElementById('reg-phone').value.trim();
  const pass     = document.getElementById('reg-password').value;
  const hospital = currentRole === 'admin' ? document.getElementById('reg-hospital').value.trim() : '';
  if (!fname || !lname || !email || !phone || !pass) { showAuthError('Please fill all required fields'); return; }
  if (pass.length < 6)                               { showAuthError('Password must be at least 6 characters'); return; }
  if (currentRole === 'admin' && !hospital)          { showAuthError('Please enter hospital name'); return; }
  const phoneClean = phone.replace(/\D/g, '');
  if (phoneClean.length < 10) { showAuthError('Please enter a valid phone number'); return; }
  showToast('⏳ Creating account…', 'info');
  const existing = await DB.getUserByEmail(email);
  if (existing) { showAuthError('Email already registered — please sign in'); return; }
  const profile = {
    uid: DB.newId(), name: fname + ' ' + lname, email,
    phone: '+91' + phoneClean.slice(-10), role: currentRole,
    hospital: hospital || '', passwordHash: hashPass(pass), createdAt: Date.now()
  };
  await DB.saveUser(profile);
  currentUser = profile; DB.setSession(profile.uid);
  showToast('Account created! Welcome to DiagnoLens 🎉', 'success');
  afterLogin(profile);
}

async function doLogout() {
  stopCall(); stopBloodNotifPolling(); DB.clearSession(); currentUser = null; waAlertLog = [];
  updateNavForLogout(); showPage('page-landing'); showToast('Signed out successfully');
}

function afterLogin(user) {
  document.getElementById('nav-avatar').textContent = user.name.charAt(0).toUpperCase();
  document.getElementById('nav-name').textContent   = user.name.split(' ')[0];
  document.getElementById('nav-user').classList.add('visible');
  document.getElementById('btn-logout').style.display = 'block';
  const rt = document.getElementById('nav-role-tag');
  rt.textContent = user.role === 'admin' ? 'Admin' : 'Patient'; rt.style.display = 'block';
  const nb = document.getElementById('nav-book-btn');
  if (nb) nb.style.display = user.role === 'patient' ? 'inline-flex' : 'none';
  const nl = document.getElementById('nav-feature-links');
  if (nl) nl.style.display = user.role === 'patient' ? 'flex' : 'none';
  if (user.role === 'admin') {
    document.getElementById('admin-hosp-name').textContent = user.hospital ? '— ' + user.hospital : '';
    renderAdminDashboard(); showPage('page-admin'); setTimeout(updateBloodBadge, 800);
  } else {
    document.getElementById('patient-name').textContent = user.name.split(' ')[0];
    // Show registered phone on the call card
    const phoneDisplay = document.getElementById('patient-call-phone-display');
    if (phoneDisplay) phoneDisplay.textContent = user.phone || '(no phone on file)';
    renderPatientAppointments(); showPage('page-patient');
    setTimeout(startBloodNotifPolling, 3000); // start polling after 3s
  }
}
function updateNavForLogout() {
  document.getElementById('nav-user').classList.remove('visible');
  document.getElementById('btn-logout').style.display = 'none';
  document.getElementById('nav-role-tag').style.display = 'none';
  const nb = document.getElementById('nav-book-btn'); if (nb) nb.style.display = 'inline-flex';
  const nl = document.getElementById('nav-feature-links'); if (nl) nl.style.display = 'none';
}

// ── BOOKING FLOW ──────────────────────────────────────────────
function showBookingForm() {
  bookingForm = {};
  const cityEl = document.getElementById('sel-city');
  cityEl.innerHTML = '<option value="">— Choose a city —</option>';
  Object.keys(HOSPITALS).sort().forEach(c => cityEl.innerHTML += `<option value="${c}">${c}</option>`);
  const di = document.getElementById('sel-date'); di.min = getTodayStr(); di.value = '';
  document.getElementById('appt-patient-name').value = currentUser?.name || '';
  ['step2', 'step3', 'step4'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('step1').style.display = 'block';
  updateStepIndicator(1);
  document.getElementById('booking-section').style.display = 'block';
  document.getElementById('booking-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function cancelBookingForm() { document.getElementById('booking-section').style.display = 'none'; bookingForm = {}; }
function updateStepIndicator(active) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('sn' + i);
    if (i < active)       { el.className = 'step-num done'; el.textContent = '✓'; }
    else if (i === active) { el.className = 'step-num active'; el.textContent = i; }
    else                   { el.className = 'step-num'; el.textContent = i; }
    if (el.nextElementSibling) el.nextElementSibling.className = i === active ? 'step-label active' : 'step-label';
  }
}
function onCityChange() {
  const city = document.getElementById('sel-city').value;
  bookingForm.city = city; bookingForm.hospital = null; bookingForm.dept = null;
  ['step2', 'step3', 'step4'].forEach(id => document.getElementById(id).style.display = 'none');
  if (!city) return;
  const el = document.getElementById('sel-hospital');
  el.innerHTML = '<option value="">— Choose a hospital —</option>';
  (HOSPITALS[city] || []).forEach(h => el.innerHTML += `<option value="${h.id}">${h.name}</option>`);
  document.getElementById('step2').style.display = 'block'; updateStepIndicator(2);
}
function onHospitalChange() {
  const hid = document.getElementById('sel-hospital').value;
  const hospital = getHospitalById(hid); bookingForm.hospital = hospital; bookingForm.dept = null;
  ['step3', 'step4'].forEach(id => document.getElementById(id).style.display = 'none');
  if (!hospital) return;
  const el = document.getElementById('sel-dept');
  el.innerHTML = '<option value="">— Choose a department —</option>';
  hospital.depts.forEach(d => el.innerHTML += `<option value="${d}">${d}</option>`);
  document.getElementById('step3').style.display = 'block'; updateStepIndicator(3);
}
function onDeptChange() {
  const dept = document.getElementById('sel-dept').value;
  bookingForm.dept = dept; bookingForm.slot = null;
  document.getElementById('step4').style.display = 'none';
  if (!dept) return;
  document.getElementById('step4').style.display = 'block';
  document.getElementById('sel-date').value = '';
  document.getElementById('slots-grid').innerHTML = '';
  updateStepIndicator(4);
}
function onDateChange() {
  const date = document.getElementById('sel-date').value;
  if (date && date < getTodayStr()) { showToast('Please select today or a future date', 'error'); document.getElementById('sel-date').value = ''; return; }
  bookingForm.date = date; bookingForm.slot = null;
  if (!date || !bookingForm.hospital || !bookingForm.dept) return;
  renderSlots(date, bookingForm.hospital.id, bookingForm.dept);
}
async function renderSlots(date, hospitalId, dept) {
  const taken = await DB.getTakenSlots(hospitalId, dept, date);
  const grid = document.getElementById('slots-grid');
  const isToday = date === getTodayStr();
  const nowMins = isToday ? (new Date().getHours() * 60 + new Date().getMinutes()) : -1;
  grid.innerHTML = '';
  TIME_SLOTS.forEach(t => {
    const [h, m] = t.split(':').map(Number);
    const isPastTime = isToday && (h * 60 + m) <= nowMins;
    const isTaken = taken.includes(t) || isPastTime;
    const div = document.createElement('div');
    div.className = 'slot' + (isTaken ? ' taken' : '');
    div.textContent = t;
    if (taken.includes(t) && !isPastTime) div.title = 'Already booked';
    if (isPastTime) div.title = 'Time passed';
    if (!isTaken) div.onclick = () => selectSlot(t, div);
    grid.appendChild(div);
  });
}
function selectSlot(time, el) {
  document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
  el.classList.add('selected'); bookingForm.slot = time;
}
async function confirmBooking() {
  const { city, hospital, dept, date, slot } = bookingForm;
  const patName = document.getElementById('appt-patient-name').value.trim();
  if (!city || !hospital || !dept || !date || !slot) { showToast('Please complete all steps', 'error'); return; }
  if (!patName) { showToast('Please enter patient name', 'error'); return; }
  if (date < getTodayStr()) { showToast('Cannot book a past date', 'error'); return; }
  showToast('⏳ Checking availability…', 'info');
  const taken = await DB.isTaken(hospital.id, dept, date, slot);
  if (taken) { showToast('Slot just taken — please choose another', 'error'); renderSlots(date, hospital.id, dept); return; }
  const count = await DB.countActive(hospital.id, dept);
  const deptCode = DEPT_ABBR[dept] || dept.substring(0, 3).toUpperCase();
  const token = `${hospital.abbr}-${deptCode}-${String(count + 1).padStart(3, '0')}`;
  const appt = {
    id: DB.newId(), userId: currentUser.uid, patientName: patName,
    patientPhone: currentUser.phone || '', city, hospitalId: hospital.id,
    hospitalName: hospital.name, dept, date, slot, token,
    status: 'upcoming', queuePosition: count + 1, bookedAt: Date.now()
  };
  await DB.saveAppt(appt);
  showBookingSuccess({ token, hospital, dept, date, slot, apptId: appt.id, phone: currentUser.phone || '', patientName: patName, city, queuePosition: count + 1, bookedAt: appt.bookedAt, email: currentUser.email || '' });
  saveToGoogleSheets(appt);
  triggerMakeWebhook(appt, currentUser);
  cancelBookingForm();
  renderPatientAppointments();
}

// ── QR + BOOKING SUCCESS MODAL ────────────────────────────────
function showBookingSuccess({ token, hospital, dept, date, slot, apptId, phone, patientName, city, queuePosition, bookedAt, email }) {
  // 1. Fill modal text
  document.getElementById('modal-token-code').textContent = token;
  document.getElementById('modal-token-details').textContent = `${hospital.name} · ${dept} · ${formatDate(date)} at ${slot}`;

  // 2. Show modal FIRST — so it is visible regardless of QR
  document.getElementById('modal-success').classList.add('visible');

  // 3. WhatsApp button
  const waBtn = document.getElementById('wa-send-qr-btn');
  if (phone) {
    waBtn.style.display = 'inline-flex';
    waBtn.onclick = () => openWhatsApp(phone, token, hospital.name, dept, formatDate(date), slot);
  } else {
    waBtn.style.display = 'none';
  }

  // 4. Generate QR after a tiny delay (DOM must be visible first for QRCode lib)
  setTimeout(() => {
    const qrContainer = document.getElementById('qr-container');
    qrContainer.innerHTML = '';
    // Keep QR data SHORT — library max ~864 chars at Level L
    // Format: TOKEN|NAME|PHONE|HOSP|DEPT|DATE|TIME
    const name  = (patientName||'').substring(0,20);
    const ph    = (phone||'').replace(/\D/g,'').slice(-10);
    const hosp  = (hospital.name||'').substring(0,25);
    const dp    = (dept||'').substring(0,15);
    const dt    = date || '';
    const qrData = `${token}|${name}|${ph}|${hosp}|${dp}|${dt}|${slot}`;
    try {
      new QRCode(qrContainer, {
        text: qrData,
        width: 200, height: 200,
        colorDark: '#0d0d14',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) {
      qrContainer.innerHTML = '<p style="font-size:12px;color:var(--muted);text-align:center;padding:20px">Token: ' + token + '</p>';
    }
  }, 100);

  // 5. Log WhatsApp notification
  if (phone) logWhatsAppNotification(phone, token, hospital.name, dept, formatDate(date), slot, apptId);
}
function closeModal() { document.getElementById('modal-success').classList.remove('visible'); }

// ── WHATSAPP ──────────────────────────────────────────────────
function openWhatsApp(phone, token, hospital, dept, date, slot) {
  const msg = `🏥 *DiagnoLens Appointment Confirmed!*\n\n*Token:* ${token}\n*Hospital:* ${hospital}\n*Department:* ${dept}\n*Date:* ${date}\n*Time:* ${slot}\n\nPlease show your token QR code at the OPD counter.\n\n_DiagnoLens — Smart Healthcare Booking_`;
  let clean = phone.replace(/\D/g, '');
  if (clean.length === 10) clean = '91' + clean;
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`, '_blank');
  showToast('📱 Opening WhatsApp…', 'success');
}

async function logWhatsAppNotification(phone, token, hospital, dept, date, slot, apptId) {
  const msg = `🏥 DiagnoLens: Token ${token} — ${hospital} · ${dept} · ${date} at ${slot}`;
  await DB.saveNotification({
    id: DB.newId(), userId: currentUser?.uid || '', phone, msg,
    token, hospital, dept, date, slot, apptId,
    type: 'whatsapp_booking', status: 'logged', createdAt: Date.now()
  });
  addAlertToLog(phone, msg, token, hospital, dept, date, slot);
}

function addAlertToLog(phone, msg, token, hospital, dept, date, slot) {
  waAlertLog.unshift({ phone, msg, token, hospital, dept, date, slot, time: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) });
  refreshAlertLog();
}
function refreshAlertLog() {
  const el = document.getElementById('wa-alert-log'); if (!el) return;
  if (waAlertLog.length === 0) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">💬</div><h4>No alerts yet</h4><p>Alerts are sent automatically when a booking is confirmed</p></div>';
    return;
  }
  el.innerHTML = waAlertLog.map((a, i) => `
    <div class="alert-item">
      <div class="alert-wa-icon">📱</div>
      <div class="alert-info">
        <div class="alert-phone">${a.phone}</div>
        <div class="alert-msg">${a.msg.replace(/\*/g, '').replace(/\n/g, ' ')}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div class="alert-time">${a.time}</div>
        <div class="alert-sent">✓ Logged</div>
        <button onclick="openWhatsAppFromLog(${i})"
          style="margin-top:5px;padding:3px 10px;background:#25d366;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif">
          📲 Open WhatsApp
        </button>
      </div>
    </div>`).join('');
}
function openWhatsAppFromLog(idx) {
  const a = waAlertLog[idx]; if (!a) return;
  openWhatsApp(a.phone, a.token || 'N/A', a.hospital || 'DiagnoLens', a.dept || '', a.date || '', a.slot || '');
}

// ── PATIENT APPOINTMENTS ──────────────────────────────────────
function filterAppts(f, btn) {
  currentApptFilter = f;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active'); renderPatientAppointments();
}

// ── Build QR data string (shared format) ─────────────────────
function buildQrData(token, patientName, phone, hospitalName, dept, date, slot) {
  const name = (patientName || '').substring(0, 20);
  const ph   = (phone || '').replace(/\D/g, '').slice(-10);
  const hosp = (hospitalName || '').substring(0, 25);
  const dp   = (dept || '').substring(0, 15);
  return `${token}|${name}|${ph}|${hosp}|${dp}|${date}|${slot}`;
}

// ── Show QR modal for a specific appointment card ─────────────
function showApptQR(token, patientName, phone, hospitalName, dept, date, slot) {
  document.getElementById('appt-qr-title').textContent    = token;
  document.getElementById('appt-qr-subtitle').textContent = `${hospitalName} · ${dept} · ${formatDate(date)} at ${slot}`;

  const container = document.getElementById('appt-qr-container');
  container.innerHTML = '';

  const waBtn = document.getElementById('appt-qr-wa-btn');
  if (phone) {
    waBtn.style.display = 'inline-flex';
    waBtn.onclick = () => openWhatsApp(phone, token, hospitalName, dept, formatDate(date), slot);
  } else {
    waBtn.style.display = 'none';
  }

  document.getElementById('modal-appt-qr').classList.add('visible');

  setTimeout(() => {
    try {
      new QRCode(container, {
        text: buildQrData(token, patientName, phone, hospitalName, dept, date, slot),
        width: 200, height: 200,
        colorDark: '#0d0d14', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) {
      container.innerHTML = `<p style="font-size:12px;color:var(--muted);text-align:center;padding:20px">Token: ${token}</p>`;
    }
  }, 80);
}
function closeApptQrModal() {
  document.getElementById('modal-appt-qr').classList.remove('visible');
}

// ── Render a single appointment card HTML ─────────────────────
function apptCardHTML(a, today, isAiBooked) {
  const icons = { Cardiology: '❤️', Neurology: '🧠', Orthopaedics: '🦴', Oncology: '🔬', Gynaecology: '🌸', ENT: '👂', Dermatology: '💊', Nephrology: '🫘', 'General Medicine': '🩺', Paediatrics: '👶', Psychiatry: '🧘', Ophthalmology: '👁️', Gastroenterology: '🔬', Urology: '💉', Pulmonology: '🫁', Transplant: '🏥', 'Bariatric Surgery': '⚕️' };
  const dept         = a.dept || a.department || '';
  const hospitalName = a.hospitalName || a.hospital || '';
  const date         = a.date || '';
  const slot         = a.slot || a.time || '';
  const token        = a.token || '—';
  const patientName  = a.patientName || a.name || currentUser?.name || '';
  const phone        = a.patientPhone || a.phone || currentUser?.phone || '';
  const city         = a.city || '';
  const isPast       = date && date < today;
  const sc           = a.status === 'cancelled' ? 'badge-cancelled' : (isPast ? 'badge-done' : 'badge-upcoming');
  const st           = a.status === 'cancelled' ? 'Cancelled' : (isPast ? 'Completed' : 'Upcoming');
  const canCancel    = !isAiBooked && a.status === 'upcoming' && date >= today;

  // Safe escaped strings for inline onclick
  const safeToken    = token.replace(/'/g, "\\'");
  const safeHosp     = hospitalName.replace(/'/g, "\\'");
  const safeDept     = dept.replace(/'/g, "\\'");
  const safeName     = patientName.replace(/'/g, "\\'");
  const safePhone    = phone.replace(/'/g, "\\'");
  const safeSlot     = slot.replace(/'/g, "\\'");

  const aiBadge = isAiBooked
    ? `<span style="display:inline-flex;align-items:center;gap:4px;font-size:9px;font-weight:700;background:linear-gradient(135deg,#7c3aed,#2563eb);color:#fff;padding:2px 8px;border-radius:20px;letter-spacing:.3px">
        <span style="width:4px;height:4px;border-radius:50%;background:#4ade80;animation:pulse 2s ease-in-out infinite"></span>AI Booked
       </span>` : '';

  return `<div class="appt-item" style="${isAiBooked ? 'border-left:3px solid #7c3aed' : ''}">
    <div class="appt-left">
      <div class="appt-icon">${icons[dept] || '🏥'}</div>
      <div>
        <div class="appt-name">${hospitalName}</div>
        <div class="appt-meta">${dept} · ${formatDate(date)} at ${slot}${city ? ' · ' + city : ''}</div>
        <div class="appt-meta">Patient: ${patientName} · 📞 ${phone || '—'}</div>
        ${aiBadge}
      </div>
    </div>
    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0">
      <div class="token-chip">${token}</div>
      <span class="badge ${sc}">${st}</span>
      ${canCancel ? `<button onclick="promptCancelAppt('${a.id}','${safeToken}','${safeHosp}','${safeDept}')"
        style="font-size:11px;color:var(--rose);border:1px solid rgba(225,29,72,.2);background:rgba(225,29,72,.05);padding:4px 11px;border-radius:7px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">✕ Cancel</button>` : ''}
      <button onclick="showApptQR('${safeToken}','${safeName}','${safePhone}','${safeHosp}','${safeDept}','${date}','${safeSlot}')"
        style="font-size:11px;color:var(--accent);border:1px solid rgba(37,99,235,.2);background:rgba(37,99,235,.06);padding:4px 11px;border-radius:7px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600;display:inline-flex;align-items:center;gap:5px">
        📲 QR
      </button>
    </div>
  </div>`;
}

async function renderPatientAppointments() {
  if (!currentUser) return;
  const container = document.getElementById('patient-appt-list');
  const today = getTodayStr();

  // ── AI-booked tab: fetch from Google Sheets ──────────────────
  if (currentApptFilter === 'ai') {
    container.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><h4>Loading AI bookings…</h4><p>Fetching from Google Sheets</p></div>';
    const aiAppts = await fetchAIBookingsFromSheets();
    if (aiAppts.length === 0) {
      container.innerHTML = `<div class="empty">
        <div class="empty-icon">📞</div>
        <h4>No AI-booked appointments yet</h4>
        <p>Tap <strong>📞 Book via AI Call</strong> above and Vaidya AI will book one for you!</p>
      </div>`;
      return;
    }
    container.innerHTML = aiAppts.map(a => apptCardHTML(a, today, true)).join('');
    return;
  }

  // ── Normal filters ────────────────────────────────────────────
  let appts = (await DB.getApptsByUser(currentUser.uid)).sort((a, b) => b.bookedAt - a.bookedAt);
  if (currentApptFilter === 'upcoming') appts = appts.filter(a => a.date >= today && a.status === 'upcoming');
  if (currentApptFilter === 'done')     appts = appts.filter(a => a.date < today || a.status === 'done');

  if (appts.length === 0) {
    container.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><h4>No appointments found</h4><p>Book your first appointment above</p></div>';
    return;
  }
  container.innerHTML = appts.map(a => apptCardHTML(a, today, false)).join('');
}

// ── Fetch AI-booked appointments from Google Sheets ──────────
// Sheet columns: A=Name | B=Email | C=Phone No. | D=Requested At | E=City | F=Date | G=Slot | H=Hospital | I=Department
// Always routes via Railway backend proxy (/fetch-gas) — works on localhost AND production
async function fetchAIBookingsFromSheets() {
  try {
    const phone   = (currentUser?.phone || '').replace(/\D/g, '');
    const email   = currentUser?.email || '';
    // Always use Railway backend — avoids CORS both on localhost and in production
    const backend = 'https://diagnolenss-production.up.railway.app';
    const url     = `${backend}/fetch-gas?action=getByUser&phone=${encodeURIComponent(phone)}&email=${encodeURIComponent(email)}`;
    const resp    = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data    = await resp.json();

    if (!Array.isArray(data) || data.length === 0) return [];

    const today = getTodayStr();
    return data.map(row => {
      const date  = String(row.date || '').trim();
      const isPast = date && date < today;
      return {
        token:        row.token       || '—',
        patientName:  row.patientName || currentUser?.name || '',
        phone:        row.phone       || currentUser?.phone || '',
        email:        row.email       || '',
        hospitalName: row.hospital    || '',
        dept:         row.dept        || '',
        city:         row.city        || '',
        date,
        slot:         String(row.slot || '').trim(),
        status:       isPast ? 'done' : 'upcoming',
        id:           row.token + '_' + (row.date || Date.now())
      };
    });
  } catch(e) {
    console.warn('fetchAIBookingsFromSheets error:', e);
    showToast('❌ Could not load AI bookings: ' + e.message, 'error');
    return [];
  }
}

// ── CANCEL APPOINTMENT ────────────────────────────────────────
function promptCancelAppt(id, token, hospital, dept) {
  pendingCancelId = id;
  document.getElementById('cancel-token-display').textContent = token;
  document.getElementById('cancel-details').textContent = `${hospital} · ${dept}`;
  document.getElementById('modal-cancel').classList.add('visible');
}
async function confirmCancelAppt() {
  if (!pendingCancelId) return;
  await DB.updateAppt(pendingCancelId, { status: 'cancelled' });
  showToast('Appointment cancelled', 'success');
  closeCancelModal();
  renderPatientAppointments();
}
function closeCancelModal() {
  document.getElementById('modal-cancel').classList.remove('visible');
  pendingCancelId = null;
}
function cancelAppt(id) {
  pendingCancelId = id;
  document.getElementById('cancel-token-display').textContent = 'This appointment';
  document.getElementById('cancel-details').textContent = '';
  document.getElementById('modal-cancel').classList.add('visible');
}

// ── LIVE QUEUE TRACKER ────────────────────────────────────────
async function initQueuePage() {
  if (!currentUser) return;
  const today = getTodayStr();
  const appts = (await DB.getApptsByUser(currentUser.uid)).filter(a => a.status === 'upcoming' && a.date >= today);
  const sel = document.getElementById('queue-appt-select'); if (!sel) return;
  sel.innerHTML = '<option value="">— Select your appointment —</option>';
  appts.sort((a, b) => a.date.localeCompare(b.date)).forEach(a => {
    const isToday = a.date === today;
    const label = isToday ? '🟢 Today' : '📅 ' + formatDate(a.date);
    sel.innerHTML += `<option value="${a.hospitalId}|${a.dept}|${a.date}|${a.id}">${label} — ${a.hospitalName} · ${a.dept} at ${a.slot} (${a.token})</option>`;
  });
  const mainEl = document.getElementById('queue-main');
  if (appts.length === 0) {
    mainEl.innerHTML = '<div class="empty"><div class="empty-icon">🎟️</div><h4>No upcoming appointments</h4><p>Book an appointment first to track your queue position</p></div>';
  } else {
    mainEl.innerHTML = `<div class="section-title">Queue Overview</div><div class="queue-list" id="queue-list"><div class="empty"><div class="empty-icon">📊</div><h4>Select an appointment above</h4><p>Your live queue position will appear here</p></div></div>`;
  }
}

async function loadQueueForAppt() {
  const sel = document.getElementById('queue-appt-select'); const val = sel?.value; if (!val) return;
  const [hospitalId, dept, date, apptId] = val.split('|');
  const today = getTodayStr();
  const posCard = document.getElementById('queue-position-card');

  if (date > today) {
    posCard.style.display = 'block';
    document.getElementById('queue-pos-number').textContent  = '✅';
    document.getElementById('queue-pos-label').textContent   = 'Pre-Registered';
    document.getElementById('queue-wait-time').textContent   = `Appointment: ${formatDate(date)}`;
    document.getElementById('queue-wait-sublabel').textContent = 'Live queue tracking activates on your appointment day';
    document.getElementById('queue-progress-fill').style.width = '0%';
    document.getElementById('queue-progress-pct').textContent = '—';
    const listEl = document.getElementById('queue-list');
    if (listEl) listEl.innerHTML = `<div class="queue-future-banner">
      <div style="font-size:38px;margin-bottom:10px">📅</div>
      <h4 style="font-family:'Syne',sans-serif;font-weight:800;font-size:17px;margin-bottom:6px;color:var(--accent)">Your slot is confirmed!</h4>
      <p style="font-size:14px;color:var(--muted);line-height:1.7">Your appointment is on <strong>${formatDate(date)}</strong>.<br>Come back on that day to see your live queue position.</p>
    </div>`;
    return;
  }

  const allAppts = (await DB.getAppointments())
    .filter(a => a.hospitalId === hospitalId && a.dept === dept && a.date === date && a.status !== 'cancelled')
    .sort((a, b) => a.queuePosition - b.queuePosition);
  const myEntry = allAppts.find(a => a.id === apptId);
  const waitingBefore = myEntry ? allAppts.filter(a => a.queuePosition < myEntry.queuePosition).length : 0;
  const total = allAppts.length;
  const progress = myEntry && total > 0 ? Math.max(0, Math.min(100, ((total - waitingBefore) / total) * 100)) : 0;

  if (myEntry) {
    posCard.style.display = 'block';
    const isMyTurn = waitingBefore === 0;
    document.getElementById('queue-pos-number').textContent  = isMyTurn ? '🔔' : waitingBefore;
    document.getElementById('queue-pos-label').textContent   = isMyTurn ? "It's your turn!" : 'Patients before you';
    document.getElementById('queue-wait-time').textContent   = isMyTurn ? 'Please go to the OPD counter' : `~${waitingBefore * 10} min wait`;
    document.getElementById('queue-wait-sublabel').textContent = isMyTurn ? '' : 'Estimated waiting time';
    document.getElementById('queue-progress-fill').style.width = progress + '%';
    document.getElementById('queue-progress-pct').textContent = Math.round(progress) + '%';
    if (isMyTurn) showToast("🔔 It's your turn! Please go to the OPD counter.", 'info');
  } else posCard.style.display = 'none';

  const listEl = document.getElementById('queue-list');
  if (!listEl) return;
  if (allAppts.length === 0) { listEl.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><h4>Queue is empty</h4></div>'; return; }
  listEl.innerHTML = allAppts.slice(0, 15).map((e, i) => {
    const isMe = e.id === apptId;
    return `<div class="queue-item ${isMe ? 'active-patient' : ''}">
      <div class="queue-pos ${isMe ? 'current' : ''}">${i + 1}</div>
      <div class="queue-item-info">
        <div class="queue-item-name">${isMe ? '<strong>You — </strong>' : ''}${e.patientName}</div>
        <div class="queue-item-meta">${e.token} · ${e.slot}</div>
      </div>
      <span class="q-badge waiting">${isMe ? 'You' : 'Waiting'}</span>
    </div>`;
  }).join('');
}

// ── WHATSAPP ALERTS PAGE ──────────────────────────────────────
async function initWhatsappPage() {
  if (!currentUser) return;
  const notis = await DB.getNotisByUser(currentUser.uid);
  waAlertLog = notis.map(n => ({
    phone: n.phone, msg: n.msg, token: n.token || '',
    hospital: n.hospital || '', dept: n.dept || '', date: n.date || '', slot: n.slot || '',
    time: new Date(n.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  }));
  refreshAlertLog();
  const ph = document.getElementById('wa-phone-display');
  if (ph) ph.textContent = currentUser?.phone || 'Not set';
}
function sendTestWhatsApp() {
  if (!currentUser?.phone) { showToast('No phone number on your account', 'error'); return; }
  openWhatsApp(currentUser.phone, 'TEST-001', 'DiagnoLens Test', 'General Medicine', 'Today', '10:00');
}

// ── VIDEO CALL (WebRTC) ───────────────────────────────────────
function initVideoPage() { renderDoctorGrid(); }
function renderDoctorGrid() {
  const grid = document.getElementById('doctor-grid'); if (!grid) return;
  grid.innerHTML = DOCTORS.map(d => `
    <div class="doctor-card" style="${!d.available ? 'opacity:.65;cursor:not-allowed' : ''}">
      <div class="doctor-avatar">${d.emoji}</div>
      <div class="doctor-name">${d.name}</div>
      <div class="doctor-spec">${d.spec}</div>
      <div class="doctor-hospital">🏥 ${d.hospital}</div>
      <div class="doc-status"><div class="dot-${d.status}"></div>${d.status === 'online' ? 'Available Now' : d.status === 'busy' ? 'In a call' : 'Offline'}</div>
      <div class="doctor-fee">Consultation: <strong>${d.fee}</strong></div>
      <div class="doctor-rating">${d.rating}</div>
      ${d.available
        ? `<button class="btn-accent" style="width:100%;margin-top:14px;justify-content:center" onclick="startCallFlow('${d.id}')">📹 Start Video Consult</button>`
        : `<button disabled style="width:100%;margin-top:14px;padding:11px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:14px;font-weight:600;cursor:not-allowed">${d.status === 'busy' ? '⏳ In a Call' : '⛔ Offline'}</button>`
      }
    </div>`).join('');
}
function startCallFlow(doctorId) {
  const doctor = DOCTORS.find(d => d.id === doctorId); if (!doctor || !doctor.available) return;
  document.getElementById('waiting-room').style.display = 'block';
  document.getElementById('waiting-doctor-name').textContent = doctor.name;
  document.getElementById('video-room-wrap').style.display = 'none';
  document.getElementById('doctor-grid-section').style.display = 'none';
  setTimeout(() => beginWebRTCCall(doctor), 2000);
}
async function beginWebRTCCall(doctor) {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    const lv = document.getElementById('localVideo');
    lv.srcObject = localStream; lv.style.display = 'block';
    try { await lv.play(); } catch (e) {}
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('video-room-wrap').style.display = 'block';
    document.getElementById('call-name-tag').textContent = doctor.name;
    document.getElementById('call-name-tag').style.display = 'block';
    document.getElementById('call-timer').style.display = 'block';
    const rp = document.getElementById('remote-placeholder');
    if (rp) rp.innerHTML = `<div class="video-placeholder"><div class="big-icon">${doctor.emoji}</div><p style="font-size:15px;font-weight:700;color:rgba(255,255,255,.8)">${doctor.name}</p><p style="font-size:12px;margin-top:4px;opacity:.5">Video connected</p></div>`;
    callSeconds = 0; clearInterval(callTimer);
    callTimer = setInterval(() => { callSeconds++; document.getElementById('call-timer').textContent = fmtSecs(callSeconds); }, 1000);
    showToast(`🎉 Connected to ${doctor.name}`, 'success');
  } catch (e) {
    document.getElementById('waiting-room').style.display = 'none';
    document.getElementById('doctor-grid-section').style.display = 'block';
    if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
      showToast('❌ Camera/mic permission denied — please allow in browser settings', 'error');
    } else if (e.name === 'NotFoundError') {
      showToast('❌ No camera or microphone found on this device', 'error');
    } else {
      showToast('❌ Could not start video: ' + e.message, 'error');
    }
  }
}
function toggleMic() {
  if (!localStream) return;
  const btn = document.getElementById('btn-mic'), track = localStream.getAudioTracks()[0]; if (!track) return;
  track.enabled = !track.enabled; btn.classList.toggle('muted-state', !track.enabled); btn.textContent = track.enabled ? '🎤' : '🔇';
}
function toggleCam() {
  if (!localStream) return;
  const btn = document.getElementById('btn-cam'), track = localStream.getVideoTracks()[0]; if (!track) return;
  track.enabled = !track.enabled; btn.classList.toggle('muted-state', !track.enabled); btn.textContent = track.enabled ? '📷' : '🚫';
}
function stopCall() {
  clearInterval(callTimer); callTimer = null;
  if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  callSeconds = 0;
  ['video-room-wrap', 'call-timer', 'call-name-tag', 'localVideo'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    if (id === 'video-room-wrap') el.style.display = 'none';
    else if (id === 'localVideo') { el.srcObject = null; el.style.display = 'none'; }
    else { el.style.display = 'none'; if (id === 'call-timer') el.textContent = '00:00'; }
  });
  const ds = document.getElementById('doctor-grid-section'); if (ds) ds.style.display = 'block';
  renderDoctorGrid(); showToast('Call ended', 'info');
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────
function adminTab(tab, btn) {
  adminFilter = tab;
  document.querySelectorAll('.admin-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const tableWrap           = document.getElementById('admin-table-wrap');
  const waSection           = document.getElementById('admin-wa-section');
  const sheetsSection       = document.getElementById('admin-sheets-section');
  const bloodSection        = document.getElementById('admin-blood-section');
  const callBookingsSection = document.getElementById('admin-callbookings-section');
  tableWrap.style.display           = 'none';
  waSection.style.display           = 'none';
  sheetsSection.style.display       = 'none';
  if (bloodSection)        bloodSection.style.display        = 'none';
  if (callBookingsSection) callBookingsSection.style.display = 'none';
  if (tab === 'whatsapp') {
    waSection.style.display = 'block';
    renderAdminWaTodayTable();
    populateApptDropdowns();
    setTimeout(updateTwilioBackendStatus, 50);
  } else if (tab === 'sheets') {
    sheetsSection.style.display = 'block';
    renderSheetsRecent();
    setTimeout(updateGasUrlStatus, 50);
  } else if (tab === 'blood') {
    if (bloodSection) { bloodSection.style.display = 'block'; renderAdminBloodRequests(); }
  } else if (tab === 'callbookings') {
    if (callBookingsSection) { callBookingsSection.style.display = 'block'; renderCallBookingsSection(); }
  } else {
    tableWrap.style.display = 'block';
    const titles = { appointments: 'All Appointments', today: "Today's Appointments", members: 'All Registered Members (Permanent List)' };
    document.getElementById('admin-table-title').textContent = titles[tab] || '';
    adminRender();
  }
}

async function renderAdminWaTodayTable() {
  const today = getTodayStr();
  const appts = (await DB.getAppointments()).filter(a => a.date === today && a.status !== 'cancelled');
  const tbody = document.getElementById('admin-wa-today-table'); if (!tbody) return;
  if (appts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--muted)">No appointments today</td></tr>';
    return;
  }
  tbody.innerHTML = appts.map(a => {
    const safeName = (a.patientName || '').replace(/'/g, "\\'");
    return `<tr>
      <td><span class="token-chip" style="font-size:11px">${a.token}</span></td>
      <td style="font-weight:600">${a.patientName}</td>
      <td>${a.patientPhone || '—'}</td>
      <td style="font-size:12px">${a.hospitalName}</td>
      <td>${a.dept}</td>
      <td>${a.slot}</td>
      <td>${a.patientPhone
        ? `<button onclick="adminSendWhatsApp('${a.patientPhone}','${safeName}','${a.token}')"
            style="padding:3px 10px;background:#25d366;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">📲 WA</button>`
        : '—'}</td>
      <td>${a.patientPhone
        ? `<button onclick="adminSendSMS('${a.patientPhone}','${safeName}','${a.token}')"
            style="padding:3px 10px;background:#2563eb;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">💬 SMS</button>`
        : '—'}</td>
    </tr>`;
  }).join('');
}

async function renderSheetsRecent() {
  const appts = (await DB.getAppointments()).sort((a, b) => b.bookedAt - a.bookedAt).slice(0, 10);
  const tbody = document.getElementById('sheets-recent-table'); if (!tbody) return;
  if (appts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--muted)">No bookings yet</td></tr>';
    return;
  }
  tbody.innerHTML = appts.map(a => `<tr>
    <td><span class="token-chip" style="font-size:11px">${a.token}</span></td>
    <td style="font-weight:600">${a.patientName}</td>
    <td style="font-size:12px">${a.patientPhone || '—'}</td>
    <td style="font-size:12px">${a.hospitalName}</td>
    <td>${formatDate(a.date)}</td>
    <td>${a.slot}</td>
    <td style="font-size:11px;color:var(--muted)">${new Date(a.bookedAt).toLocaleString('en-IN')}</td>
  </tr>`).join('');
}

async function renderAdminDashboard() {
  const appts   = await DB.getAppointments();
  const today   = getTodayStr();
  const patients = (await DB.getUsers()).filter(u => u.role === 'patient');
  document.getElementById('stat-total').textContent    = appts.length;
  document.getElementById('stat-today').textContent    = appts.filter(a => a.date === today).length;
  document.getElementById('stat-upcoming').textContent = appts.filter(a => a.date >= today && a.status === 'upcoming').length;
  document.getElementById('stat-depts').textContent    = new Set(appts.map(a => a.dept)).size;
  document.getElementById('stat-members').textContent  = patients.length;
  adminRender();
}

async function adminRender() {
  const appts  = await DB.getAppointments();
  const today  = getTodayStr();
  const search = (document.getElementById('admin-search')?.value || '').toLowerCase();

  if (adminFilter === 'members') {
    const thead = document.getElementById('admin-table-head');
    thead.innerHTML = `<tr>
      <th>#</th><th>Full Name</th><th>Email</th><th>📞 Phone / WA / SMS</th>
      <th>Registered On</th><th>Bookings</th><th>Last Booking</th><th>Status</th><th>Action</th>
    </tr>`;
    const users = (await DB.getUsers()).filter(u => u.role === 'patient');
    const tbody = document.getElementById('admin-table-body');
    const filtered = users.filter(u => !search ||
      u.name.toLowerCase().includes(search) ||
      u.email.toLowerCase().includes(search) ||
      (u.phone || '').includes(search));
    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--muted)">No members registered yet</td></tr>';
      return;
    }
    tbody.innerHTML = filtered.map((u, i) => {
      const userAppts = appts.filter(a => a.userId === u.uid);
      const lastAppt  = userAppts.sort((a, b) => b.bookedAt - a.bookedAt)[0];
      const safeName  = u.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      return `<tr>
        <td style="font-weight:700;color:var(--muted)">${i + 1}</td>
        <td><strong>${u.name}</strong></td>
        <td style="font-size:12px">${u.email}</td>
        <td>
          <span style="font-weight:700;color:var(--green)">${u.phone || '—'}</span>
          ${u.phone ? `
            <button onclick="adminSendWhatsApp('${u.phone}','${safeName}','')"
              style="margin-left:7px;padding:2px 8px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer">📲 WA</button>
            <button onclick="adminSendSMS('${u.phone}','${safeName}','')"
              style="margin-left:4px;padding:2px 8px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer">💬 SMS</button>` : ''}
        </td>
        <td style="font-size:12px">${formatDate(new Date(u.createdAt || Date.now()).toISOString().split('T')[0])}</td>
        <td style="font-weight:700;color:var(--accent)">${userAppts.length}</td>
        <td style="font-size:12px">${lastAppt ? `${lastAppt.hospitalName} · ${formatDate(lastAppt.date)}` : '—'}</td>
        <td><span class="badge badge-upcoming">Active</span></td>
        <td>
          <button onclick="adminDeleteMember('${u.uid}','${safeName}')"
            style="font-size:11px;color:var(--rose);border:1px solid rgba(225,29,72,.2);background:rgba(225,29,72,.05);padding:3px 9px;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">
            🗑 Delete
          </button>
        </td>
      </tr>`;
    }).join('');
    return;
  }

  const thead = document.getElementById('admin-table-head');
  thead.innerHTML = `<tr>
    <th>Token</th><th>Patient</th><th>Phone</th><th>Hospital</th>
    <th>Dept</th><th>Date</th><th>Time</th><th>Status</th><th>Action</th>
  </tr>`;
  let filtered = adminFilter === 'today' ? appts.filter(a => a.date === today) : [...appts];
  if (search) filtered = filtered.filter(a =>
    (a.token || '').toLowerCase().includes(search) ||
    (a.patientName || '').toLowerCase().includes(search) ||
    (a.hospitalName || '').toLowerCase().includes(search) ||
    (a.patientPhone || '').includes(search));
  filtered.sort((a, b) => b.bookedAt - a.bookedAt);
  const tbody = document.getElementById('admin-table-body');
  if (filtered.length === 0) { tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--muted)">No appointments found</td></tr>`; return; }
  tbody.innerHTML = filtered.map(a => {
    const isPast = a.date < today;
    const sc = a.status === 'cancelled' ? 'badge-cancelled' : (isPast ? 'badge-done' : 'badge-upcoming');
    const st = a.status === 'cancelled' ? 'Cancelled' : (isPast ? 'Completed' : 'Upcoming');
    return `<tr>
      <td><span class="token-chip" style="font-size:11px">${a.token}</span></td>
      <td style="font-weight:600">${a.patientName}</td>
      <td>${a.patientPhone
        ? `<span>${a.patientPhone}</span>
           <button onclick="adminSendWhatsApp('${a.patientPhone}','${(a.patientName || '').replace(/'/g, "\\'")}','${a.token}')"
             style="margin-left:5px;padding:2px 7px;background:#25d366;color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">WA</button>`
        : '—'}</td>
      <td style="font-size:12px">${a.hospitalName}</td>
      <td>${a.dept}</td>
      <td>${formatDate(a.date)}</td>
      <td>${a.slot}</td>
      <td><span class="badge ${sc}">${st}</span></td>
      <td>${a.status === 'upcoming' && a.date >= today
        ? `<button onclick="adminCancelAppt('${a.id}')"
            style="font-size:11px;color:var(--rose);border:1px solid rgba(225,29,72,.2);background:rgba(225,29,72,.05);padding:3px 9px;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif">Cancel</button>`
        : '—'}</td>
    </tr>`;
  }).join('');
}

async function adminDeleteMember(uid, name) {
  if (!confirm(`Delete member "${name}"?\n\nThis removes their account permanently.\n\nTheir past appointment records will be kept.`)) return;
  await DB.deleteUser(uid);
  showToast(`✅ ${name} removed — they can now re-register`, 'success');
  renderAdminDashboard();
}
async function adminCancelAppt(id) {
  await DB.updateAppt(id, { status: 'cancelled' });
  showToast('Appointment cancelled', 'success');
  renderAdminDashboard();
}

// ── VOICE AGENT — MEMBER TABLE ────────────────────────────────
async function renderVoiceMemberTable() {
  const appts   = await DB.getAppointments();
  const members = (await DB.getUsers()).filter(u => u.role === 'patient');
  const countEl = document.getElementById('voice-member-count');
  if (countEl) countEl.textContent = `${members.length} member${members.length === 1 ? '' : 's'}`;
  const tbody = document.getElementById('voice-member-table'); if (!tbody) return;
  if (members.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--muted)">No patients have registered yet.</td></tr>';
    return;
  }
  tbody.innerHTML = members.map((u, i) => {
    const userAppts = appts.filter(a => a.userId === u.uid);
    const lastAppt  = userAppts.sort((a, b) => b.bookedAt - a.bookedAt)[0];
    const regDate   = new Date(u.createdAt || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    const safeName  = u.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    return `<tr>
      <td style="font-weight:700;color:var(--muted)">${i + 1}</td>
      <td><strong>${u.name}</strong></td>
      <td style="font-size:12px">${u.email}</td>
      <td>
        <strong style="color:var(--green)">${u.phone || '—'}</strong>
        ${u.phone ? `
          <button onclick="adminSendWhatsApp('${u.phone}','${safeName}','')"
            style="margin-left:6px;padding:2px 8px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;vertical-align:middle">📲 WA</button>
          <button onclick="adminSendSMS('${u.phone}','${safeName}','')"
            style="margin-left:4px;padding:2px 8px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;vertical-align:middle">💬 SMS</button>` : ''}
      </td>
      <td style="font-size:12px">${regDate}</td>
      <td style="font-weight:700;color:var(--accent);text-align:center">${userAppts.length}</td>
      <td style="font-size:12px">${lastAppt ? `${lastAppt.hospitalName}<br><span style="color:var(--muted)">${formatDate(lastAppt.date)}</span>` : '—'}</td>
      <td><span class="badge badge-upcoming">Active</span></td>
      <td>
        <button onclick="adminDeleteMember('${u.uid}','${safeName}')"
          style="font-size:11px;color:var(--rose);border:1px solid rgba(225,29,72,.2);background:rgba(225,29,72,.05);padding:3px 9px;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">
          🗑 Delete
        </button>
      </td>
    </tr>`;
  }).join('');
}

// ── POPULATE APPOINTMENT DROPDOWNS (WA / SMS panels) ──────────
async function populateApptDropdowns() {
  const appts = await DB.getAppointments();
  ['admin-wa-token', 'admin-sms-token'].forEach(selId => {
    const sel = document.getElementById(selId); if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Select appointment —</option>';
    appts.sort((a, b) => b.bookedAt - a.bookedAt).forEach(a => {
      sel.innerHTML += `<option value="${a.id}">${a.token} — ${a.patientName} (${a.date})</option>`;
    });
    if (prev) sel.value = prev;
  });
}
function adminWaTokenChange() {
  const sel   = document.getElementById('admin-wa-token');
  const apptId = sel?.value || '';
  if (!apptId) return;
  DB.getAppointments().then(appts => {
    const appt = appts.find(a => a.id === apptId); if (!appt) return;
    const phoneEl = document.getElementById('admin-wa-phone');
    const nameEl  = document.getElementById('admin-wa-name');
    if (phoneEl) phoneEl.value = appt.patientPhone || '';
    if (nameEl)  nameEl.value  = appt.patientName  || '';
    sel.dataset.apptId = apptId;
  });
}
function adminSmsTokenChange() {
  const sel    = document.getElementById('admin-sms-token');
  const apptId = sel?.value || '';
  if (!apptId) return;
  DB.getAppointments().then(appts => {
    const appt = appts.find(a => a.id === apptId); if (!appt) return;
    const phoneEl = document.getElementById('admin-sms-phone');
    const nameEl  = document.getElementById('admin-sms-name');
    if (phoneEl) phoneEl.value = appt.patientPhone || '';
    if (nameEl)  nameEl.value  = appt.patientName  || '';
    sel.dataset.apptId = apptId;
  });
}

function adminSendWhatsApp(phone, patientName, token) {
  const waTabBtn = document.querySelector('.admin-tab[onclick*="whatsapp"]');
  if (waTabBtn) adminTab('whatsapp', waTabBtn);
  setTimeout(async () => {
    await populateApptDropdowns();
    const appts = await DB.getAppointments();
    const appt  = appts.find(a => (token && a.token === token) || (!token && a.patientPhone === phone));
    const sel   = document.getElementById('admin-wa-token');
    if (sel && appt) { sel.value = appt.id; sel.dataset.apptId = appt.id; }
    const phoneEl = document.getElementById('admin-wa-phone');
    const nameEl  = document.getElementById('admin-wa-name');
    if (phoneEl) phoneEl.value = phone;
    if (nameEl)  nameEl.value  = patientName;
  }, 200);
}
function adminSendSMS(phone, patientName, token) {
  const waTabBtn = document.querySelector('.admin-tab[onclick*="whatsapp"]');
  if (waTabBtn) adminTab('whatsapp', waTabBtn);
  setTimeout(async () => {
    await populateApptDropdowns();
    const appts = await DB.getAppointments();
    const appt  = appts.find(a => (token && a.token === token) || (!token && a.patientPhone === phone));
    const sel   = document.getElementById('admin-sms-token');
    if (sel && appt) { sel.value = appt.id; sel.dataset.apptId = appt.id; }
    const phoneEl = document.getElementById('admin-sms-phone');
    const nameEl  = document.getElementById('admin-sms-name');
    if (phoneEl) phoneEl.value = phone;
    if (nameEl)  nameEl.value  = patientName;
    const panel = document.getElementById('admin-sms-panel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}

async function adminDoSendSMS() {
  const phone  = (document.getElementById('admin-sms-phone')?.value || '').trim();
  const name   = (document.getElementById('admin-sms-name')?.value  || '').trim();
  const sel    = document.getElementById('admin-sms-token');
  const apptId = sel?.value || '';
  const appts  = await DB.getAppointments();
  const appt   = apptId ? appts.find(a => a.id === apptId) : null;
  const token  = appt ? appt.token : apptId;
  const msg    = (document.getElementById('admin-sms-msg')?.value || '').trim();
  if (!phone) { showToast('Please enter a phone number', 'error'); return; }
  if (!msg)   { showToast('Please enter a message', 'error'); return; }
  const finalMsg = msg.replace('{name}', name || 'Patient').replace('{token}', token || 'N/A').replace('{date}', getTodayStr());
  let clean = phone.replace(/\D/g, '');
  if (clean.length === 10) clean = '+91' + clean;
  else if (!clean.startsWith('+')) clean = '+' + clean;
  const backendUrl = getTwilioBackend();
  if (backendUrl) {
    try {
      showToast('⏳ Sending SMS via Twilio…', 'info');
      const res  = await fetch(backendUrl.replace(/\/$/, '') + '/send-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: clean, message: finalMsg }) });
      const data = await res.json();
      if (data.success) { showToast('✅ SMS sent via Twilio!', 'success'); }
      else              { showToast('❌ Twilio error: ' + (data.error || 'Unknown error'), 'error'); }
    } catch (e) {
      showToast('❌ Backend unreachable — falling back to SMS app', 'error');
      window.open(`sms:${clean}?body=${encodeURIComponent(finalMsg)}`, '_blank');
    }
  } else {
    window.open(`sms:${clean}?body=${encodeURIComponent(finalMsg)}`, '_blank');
    showToast('📨 Opening SMS app', 'info');
  }
}
function adminDoClearSmsForm() {
  ['admin-sms-phone', 'admin-sms-name', 'admin-sms-msg'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const sel = document.getElementById('admin-sms-token'); if (sel) { sel.value = ''; sel.dataset.apptId = ''; }
}
function setSmsTpl(type) {
  const templates = {
    booking:  'DiagnoLens: Hi {name}, your OPD slot is confirmed. Token: {token}. Show this at the OPD counter.',
    reminder: 'DiagnoLens: Reminder — your appointment is today. Token: {token}. Please arrive 10 min early.',
    turn:     "DiagnoLens: {name}, it's almost your turn! Token {token} — please proceed to the OPD counter now.",
    cancel:   'DiagnoLens: Your appointment (Token: {token}) has been cancelled. Please re-book if needed.'
  };
  const el = document.getElementById('admin-sms-msg');
  if (el && templates[type]) el.value = templates[type];
}
function adminDoSendWhatsApp() {
  const phone  = (document.getElementById('admin-wa-phone')?.value || '').trim();
  const name   = (document.getElementById('admin-wa-name')?.value  || '').trim();
  const waSel  = document.getElementById('admin-wa-token');
  const waApptId = waSel?.value || '';
  DB.getAppointments().then(appts => {
    const waAppt = waApptId ? appts.find(a => a.id === waApptId) : null;
    const token  = waAppt ? waAppt.token : waApptId;
    const msg    = (document.getElementById('admin-wa-msg')?.value || '').trim();
    if (!phone) { showToast('Please enter a phone number', 'error'); return; }
    if (!msg)   { showToast('Please enter a message', 'error'); return; }
    const finalMsg = msg.replace('{name}', name || 'Patient').replace('{token}', token || 'N/A').replace('{hospital}', 'DiagnoLens').replace('{date}', getTodayStr());
    let clean = phone.replace(/\D/g, '');
    if (clean.length === 10) clean = '91' + clean;
    window.open(`https://wa.me/${clean}?text=${encodeURIComponent(finalMsg)}`, '_blank');
    showToast('📱 Opening WhatsApp…', 'success');
  });
}
function adminDoClearWaForm() {
  ['admin-wa-phone', 'admin-wa-name', 'admin-wa-msg'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const sel = document.getElementById('admin-wa-token'); if (sel) { sel.value = ''; sel.dataset.apptId = ''; }
}
function setWaTpl(type) {
  const templates = {
    booking:  '🏥 *DiagnoLens — Slot Confirmed!*\n\nHello {name} 👋\n\nYour OPD appointment has been confirmed.\n*Token:* {token}\n\nPlease show this token at the OPD counter.\n\n_DiagnoLens — Smart Healthcare_',
    reminder: '🔔 *Appointment Reminder*\n\nHello {name}, this is a reminder for your appointment today.\n*Token:* {token}\n\nPlease arrive 10 minutes early.\n\n_DiagnoLens_',
    delay:    "⏳ *Queue Delay Notice*\n\nDear {name}, there is a slight delay in today's OPD queue.\nWe apologise for the inconvenience. Please wait for your token {token} to be called.\n\n_DiagnoLens Team_",
    turn:     '🔔 *Your Turn!*\n\nDear {name}, it\'s almost your turn!\nToken: *{token}*\n\nPlease proceed to the OPD counter now.\n\n_DiagnoLens_',
    cancel:   '❌ *Appointment Cancelled*\n\nDear {name}, your appointment (Token: {token}) has been cancelled.\nIf this was an error, please re-book at DiagnoLens.\n\n_DiagnoLens Team_'
  };
  const el = document.getElementById('admin-wa-msg');
  if (el && templates[type]) el.value = templates[type];
}

// ── INTEGRATIONS CONFIG ───────────────────────────────────────
// ── DiagnoLens deployed Apps Script URL ──────────────────────
const DIAGNOLENS_GAS_URL = 'https://script.google.com/macros/s/AKfycbzRGDpOPhb6ekTvjoUj4XVw6s-9FIieIEkj2seg2Sic3bpbP8XKyzqXy-iAB39rJIkOpw/exec';

function getGasUrl() {
  // Use admin-configured URL if set, otherwise fall back to the deployed URL above
  return DB.getConfigUrl('gas_url') || DIAGNOLENS_GAS_URL;
}
function getMakeWebhookUrl(){ return DB.getConfigUrl('make_url'); }
function getTwilioBackend() { return 'https://diagnolenss-production.up.railway.app'; }

// ── Voice Call Requests — separate GAS URL (reuses same key or own key) ──
function getCbGasUrl() { return DB.getConfigUrl('cb_gas_url') || DB.getConfigUrl('gas_url'); }

function saveCbGasUrl() {
  const val = (document.getElementById('cb-gas-url-input')?.value || '').trim();
  if (!val) { showToast('Please paste your Apps Script URL', 'error'); return; }
  if (!val.startsWith('https://script.google.com')) { showToast('URL must be a Google Apps Script URL', 'error'); return; }
  DB.setConfigUrl('cb_gas_url', val);
  updateCbGasUrlStatus();
  showToast('✅ Voice Calls Sheet URL saved!', 'success');
}

function updateCbGasUrlStatus() {
  const el    = document.getElementById('cb-gas-url-status'); if (!el) return;
  const url   = getCbGasUrl();
  const input = document.getElementById('cb-gas-url-input');
  if (url) { el.textContent = '✅ Configured — voice call requests will auto-save to Google Sheets'; el.style.color = '#1e6b3c'; if (input) input.value = url; }
  else     { el.textContent = 'Not configured — paste your Apps Script URL above'; el.style.color = 'var(--muted)'; }
}

async function syncAllCallRequestsToSheets() {
  const url = getCbGasUrl();
  if (!url) { showToast('Please save your Apps Script URL first', 'error'); return; }
  showToast('⏳ Syncing all voice call requests to Sheets…', 'info');
  try {
    const all = await CallBookingsDB.getAll();
    if (all.length === 0) { showToast('No voice call requests to sync', 'error'); return; }
    let synced = 0;
    for (const r of all) {
      const row = {
        token:       'CALL-REQ',
        patientName: r.name  || '',
        phone:       r.phone || '',
        email:       r.email || '',
        hospital:    '',
        dept:        '',
        city:        '',
        date:        '',
        slot:        '',
        bookedAt:    r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-IN') : '',
        status:      r.status || 'pending'
      };
      try {
        await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) });
        synced++;
      } catch (e) { console.warn('Sync error for', r.phone, e.message); }
    }
    showToast(`✅ Synced ${synced} voice call requests to Google Sheets!`, 'success');
  } catch(e) { showToast('Sync failed: ' + e.message, 'error'); }
}

function saveGasUrl() {
  const val = (document.getElementById('gas-url-input')?.value || '').trim();
  if (!val) { showToast('Please paste your Apps Script URL', 'error'); return; }
  if (!val.startsWith('https://script.google.com')) { showToast('URL must be a Google Apps Script URL', 'error'); return; }
  DB.setConfigUrl('gas_url', val);
  updateGasUrlStatus();
  showToast('✅ Google Sheets URL saved!', 'success');
}
function testGasUrl() {
  const url = getGasUrl();
  if (!url) { showToast('Please save your Apps Script URL first', 'error'); return; }
  const testRow = { token: 'TEST-001', patientName: 'DiagnoLens Test', phone: '+910000000000', email: 'test@diagnolens.com', hospital: 'Test Hospital', dept: 'General', city: 'Delhi', date: getTodayStr(), slot: '10:00', bookedAt: new Date().toLocaleString('en-IN') };
  fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(testRow) })
    .then(() => showToast('🧪 Test row sent to Google Sheets', 'success'))
    .catch(e => showToast('❌ Test failed: ' + e.message, 'error'));
}
function updateGasUrlStatus() {
  const el = document.getElementById('gas-url-status'); if (!el) return;
  const url = getGasUrl();
  const input = document.getElementById('gas-url-input');
  if (url) { el.textContent = '✅ Configured — auto-saving all new bookings to Google Sheets'; el.style.color = '#1e6b3c'; if (input) input.value = url; }
  else     { el.textContent = 'Not configured — paste your Apps Script URL above to enable auto-save'; el.style.color = 'var(--muted)'; }
}
function saveMakeWebhookUrl() {
  const val = (document.getElementById('make-webhook-input')?.value || '').trim();
  if (!val) { showToast('Please paste your webhook URL', 'error'); return; }
  DB.setConfigUrl('make_url', val);
  updateMakeWebhookStatus();
  showToast('✅ Make.com webhook URL saved!', 'success');
}
function updateMakeWebhookStatus() {
  const el = document.getElementById('make-webhook-status'); if (!el) return;
  const url = getMakeWebhookUrl();
  const input = document.getElementById('make-webhook-input');
  if (url) { el.textContent = '✅ Configured — webhook fires on every new booking'; el.style.color = 'var(--accent2)'; if (input) input.value = url; }
  else     { el.textContent = 'Not configured — paste your webhook URL above'; el.style.color = 'var(--muted)'; }
}
function saveTwilioBackendUrl() {
  const val = (document.getElementById('twilio-backend-input')?.value || '').trim();
  if (!val) { showToast('Please enter your backend URL', 'error'); return; }
  DB.setConfigUrl('twilio_url', val);
  updateTwilioBackendStatus();
  showToast('✅ Twilio backend URL saved!', 'success');
}
function updateTwilioBackendStatus() {
  const el = document.getElementById('twilio-backend-status'); if (!el) return;
  const url = getTwilioBackend();
  const input = document.getElementById('twilio-backend-input');
  if (url) { el.textContent = `✅ Configured — SMS will be sent via Twilio (${url})`; el.style.color = 'var(--accent)'; if (input) input.value = url; }
  else     { el.textContent = 'Not configured — SMS will open native SMS app as fallback'; el.style.color = 'var(--muted)'; }
}

// ── VOICE AGENT WEBHOOK ───────────────────────────────────────
async function triggerVoiceAgentWebhook() {
  const phone = (document.getElementById('voice-agent-phone')?.value || '').trim();
  const name  = (document.getElementById('voice-agent-name')?.value  || '').trim();
  if (!phone) { showToast('Please enter a phone number', 'error'); return; }
  const url = getMakeWebhookUrl();
  if (!url) { showToast('Please configure your Make.com webhook URL above first', 'error'); return; }
  const payload = {
    patientName: name || 'Patient', phone,
    token:    (document.getElementById('voice-agent-token')?.value    || '').trim(),
    hospital: (document.getElementById('voice-agent-hospital')?.value || '').trim(),
    date:     (document.getElementById('voice-agent-date')?.value     || '').trim(),
    slot:     (document.getElementById('voice-agent-slot')?.value     || '').trim(),
    message:  (document.getElementById('voice-agent-message')?.value  || '').trim(),
    triggeredAt: new Date().toLocaleString('en-IN'),
    source: 'DiagnoLens Voice Agent Panel'
  };
  const resultEl = document.getElementById('voice-agent-result');
  if (resultEl) { resultEl.style.display = 'block'; resultEl.textContent = '⏳ Sending…'; resultEl.style.color = 'var(--muted)'; }
  try {
    await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    showToast('⚡ Webhook triggered for ' + payload.patientName, 'success');
    if (resultEl) { resultEl.textContent = `✅ Webhook fired for ${payload.patientName} (${phone}) at ${payload.triggeredAt}`; resultEl.style.color = '#1e6b3c'; }
  } catch (e) {
    showToast('❌ Webhook failed: ' + e.message, 'error');
    if (resultEl) { resultEl.textContent = '❌ Failed: ' + e.message; resultEl.style.color = 'var(--rose)'; }
  }
}
function clearVoiceAgentForm() {
  ['voice-agent-name', 'voice-agent-phone', 'voice-agent-token', 'voice-agent-hospital', 'voice-agent-date', 'voice-agent-slot', 'voice-agent-message'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const r = document.getElementById('voice-agent-result'); if (r) { r.style.display = 'none'; r.textContent = ''; }
}

// ── SYNC ALL BOOKINGS TO SHEETS ───────────────────────────────
async function syncAllToSheets() {
  const url = getGasUrl();
  if (!url) { showToast('Please configure your Apps Script URL in the Google Sheets panel first', 'error'); return; }
  const appts = (await DB.getAppointments()).sort((a, b) => b.bookedAt - a.bookedAt).slice(0, 50);
  if (appts.length === 0) { showToast('No bookings to sync', 'info'); return; }
  showToast(`⏳ Syncing ${appts.length} bookings…`, 'info');
  let sent = 0;
  for (const appt of appts) {
    const row = { token: appt.token, patientName: appt.patientName, phone: appt.patientPhone || '', email: '', hospital: appt.hospitalName, dept: appt.dept, city: appt.city || '', date: appt.date, slot: appt.slot, bookedAt: new Date(appt.bookedAt).toLocaleString('en-IN') };
    try { await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) }); sent++; await new Promise(r => setTimeout(r, 300)); }
    catch (e) { console.warn('Sync error for', appt.token, e.message); }
  }
  showToast(`✅ Synced ${sent} bookings to Google Sheets`, 'success');
}

// ── GOOGLE SHEETS AUTO-SAVE ───────────────────────────────────
async function saveToGoogleSheets(appt) {
  const url = getGasUrl();
  if (!url) { console.log('📋 Google Sheets: Configure URL in Admin → Google Sheets panel.'); return; }
  const row = { token: appt.token, patientName: appt.patientName, phone: appt.patientPhone || '', email: currentUser?.email || '', hospital: appt.hospitalName, dept: appt.dept, city: appt.city || '', date: appt.date, slot: appt.slot, bookedAt: new Date(appt.bookedAt).toLocaleString('en-IN') };
  try { await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(row) }); }
  catch (e) { console.warn('GAS save error:', e.message); }
}

// ── MAKE.COM / VOICE WEBHOOK ──────────────────────────────────
async function triggerMakeWebhook(appt, user) {
  const url = getMakeWebhookUrl();
  if (!url) return;
  const payload = { patientName: appt.patientName, phone: appt.patientPhone || '', token: appt.token, hospital: appt.hospitalName, dept: appt.dept, date: appt.date, slot: appt.slot, city: appt.city || '', email: user?.email || '', bookedAt: new Date(appt.bookedAt).toLocaleString('en-IN'), source: 'DiagnoLens Booking' };
  try { await fetch(url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }
  catch (e) { console.warn('Make webhook error:', e.message); }
}


// ── BLOOD DONATION ────────────────────────────────────────────
let selectedUrgency = 'Critical';

// Firestore helpers for blood
const BloodDB = {
  async saveBloodRequest(req) {
    const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(db, 'bloodRequests', req.id), req);
  },
  async getBloodRequests() {
    const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    const snap = await getDocs(collection(db, 'bloodRequests'));
    return snap.docs.map(d => d.data()).sort((a,b) => b.createdAt - a.createdAt);
  },
  async saveDonor(donor) {
    const { setDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await setDoc(doc(db, 'bloodDonors', donor.id), donor);
  },
  async updateBloodReq(id, fields) {
    const { updateDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await updateDoc(doc(db, 'bloodRequests', id), fields);
  }
};

function showBloodSection(type) {
  document.getElementById('blood-donate-section').style.display = type === 'donate' ? 'block' : 'none';
  document.getElementById('blood-search-section').style.display = type === 'search' ? 'block' : 'none';
  // Pre-fill fields from currentUser
  if (type === 'donate' && currentUser) {
    const el = document.getElementById('donor-name'); if (el) el.value = currentUser.name || '';
    const ph = document.getElementById('donor-phone'); if (ph) ph.value = currentUser.phone || '';
  }
  if (type === 'search' && currentUser) {
    const el = document.getElementById('req-patient-name'); if (el) el.value = currentUser.name || '';
    const ph = document.getElementById('req-contact'); if (ph) ph.value = currentUser.phone || '';
  }
  setTimeout(() => document.getElementById(type === 'donate' ? 'blood-donate-section' : 'blood-search-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}
function hideBloodSections() {
  document.getElementById('blood-donate-section').style.display = 'none';
  document.getElementById('blood-search-section').style.display = 'none';
}
function selectUrgency(btn) {
  document.querySelectorAll('.urgency-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  selectedUrgency = btn.dataset.level;
}

async function registerDonor() {
  const bg   = document.getElementById('donor-blood-group').value;
  const city = document.getElementById('donor-city').value.trim();
  const name = document.getElementById('donor-name').value.trim();
  const phone= document.getElementById('donor-phone').value.trim();
  if (!bg || !city) { showToast('Please select blood group and enter city', 'error'); return; }
  showToast('⏳ Registering donor…', 'info');
  try {
    const donor = {
      id: DB.newId(), userId: currentUser?.uid || 'guest',
      name: name || currentUser?.name || 'Anonymous',
      phone: phone || currentUser?.phone || '',
      bloodGroup: bg, city,
      lastDonated: document.getElementById('donor-last-date').value || null,
      registeredAt: Date.now()
    };
    await BloodDB.saveDonor(donor);
    showToast('✅ You are now registered as a blood donor!', 'success');
    hideBloodSections();
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
}

async function submitBloodRequest() {
  const bg      = document.getElementById('req-blood-group').value;
  const units   = document.getElementById('req-units').value;
  const patient = document.getElementById('req-patient-name').value.trim();
  const contact = document.getElementById('req-contact').value.trim();
  const hospital= document.getElementById('req-hospital').value.trim();
  const city    = document.getElementById('req-city').value.trim();
  const notes   = document.getElementById('req-notes').value.trim();
  if (!bg || !patient || !contact || !hospital || !city) { showToast('Please fill all required fields', 'error'); return; }
  showToast('📢 Sending request to all admins…', 'info');
  try {
    const req = {
      id: DB.newId(), userId: currentUser?.uid || 'guest',
      patientName: patient, contactPhone: contact,
      bloodGroup: bg, units: units || '1',
      hospital, city, notes,
      urgency: selectedUrgency,
      status: 'pending',
      createdAt: Date.now(),
      createdBy: currentUser?.name || patient
    };
    await BloodDB.saveBloodRequest(req);
    // Update admin badge
    updateBloodBadge();
    showToast('✅ Blood request sent to all admins!', 'success');
    hideBloodSections();
    // Clear form
    ['req-blood-group','req-units','req-patient-name','req-contact','req-hospital','req-city','req-notes'].forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    renderMyBloodRequests();
  } catch(e) { showToast('❌ Error: ' + e.message, 'error'); }
}

async function renderMyBloodRequests() {
  const container = document.getElementById('my-blood-requests');
  if (!container || !currentUser) return;
  try {
    const all = await BloodDB.getBloodRequests();
    const mine = all.filter(r => r.userId === currentUser.uid);
    if (mine.length === 0) {
      container.innerHTML = '<div class="empty"><div class="empty-icon">🩸</div><h4>No requests yet</h4><p>Submit a blood request above and it will appear here</p></div>';
      return;
    }
    // For each request, render card + acceptors
    const cards = await Promise.all(mine.map(async r => {
      const acceptors = (r.acceptors || []);
      let acceptorHtml = '';
      if (acceptors.length > 0) {
        acceptorHtml = `
          <div class="blood-acceptors-wrap">
            <div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:4px">🙋 ${acceptors.length} person(s) accepted to help:</div>
            ${acceptors.map(a => `
              <div class="blood-acceptor-item">
                <div class="blood-acceptor-avatar">${(a.name||'?')[0].toUpperCase()}</div>
                <div>
                  <div class="blood-acceptor-name">${a.name}</div>
                  <div class="blood-acceptor-meta">${a.phone || 'No phone'} · ${new Date(a.acceptedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
                </div>
                ${a.phone ? `<a href="https://wa.me/${a.phone.replace(/\D/g,'')}" target="_blank" style="margin-left:auto;padding:5px 12px;background:#25d366;color:#fff;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none">📲 WA</a>` : ''}
              </div>
            `).join('')}
          </div>`;
      }
      return bloodReqCard(r, false) + acceptorHtml.replace('</div>\n  </div>', acceptorHtml + '</div>\n  </div>');
    }));
    // Simpler approach: render cards and append acceptors
    container.innerHTML = '';
    for (const r of mine) {
      const div = document.createElement('div');
      div.innerHTML = bloodReqCard(r, false);
      const acceptors = r.acceptors || [];
      if (acceptors.length > 0) {
        const wrap = document.createElement('div');
        wrap.className = 'blood-acceptors-wrap';
        wrap.style.cssText = 'margin-top:-8px;margin-bottom:14px;padding:0 4px';
        wrap.innerHTML = `
          <div style="font-size:12px;font-weight:700;color:var(--green);margin-bottom:6px;padding:0 4px">🙋 ${acceptors.length} person(s) accepted to help:</div>
          ${acceptors.map(a => `
            <div class="blood-acceptor-item">
              <div class="blood-acceptor-avatar">${(a.name||'?')[0].toUpperCase()}</div>
              <div>
                <div class="blood-acceptor-name">${a.name}</div>
                <div class="blood-acceptor-meta">${a.phone||'No phone'} · ${new Date(a.acceptedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}</div>
              </div>
              ${a.phone ? `<a href="https://wa.me/${a.phone.replace(/\D/g,'')}" target="_blank" style="margin-left:auto;padding:5px 12px;background:#25d366;color:#fff;border-radius:8px;font-size:11px;font-weight:700;text-decoration:none;white-space:nowrap">📲 WA</a>` : ''}
            </div>
          `).join('')}
        `;
        div.appendChild(wrap);
      }
      container.appendChild(div);
    }
  } catch(e) { console.warn('renderMyBloodRequests:', e); }
}

async function renderAdminBloodRequests() {
  const container = document.getElementById('admin-blood-list');
  if (!container) return;
  container.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div><h4>Loading…</h4></div>';
  try {
    const all = await BloodDB.getBloodRequests();
    if (all.length === 0) {
      container.innerHTML = '<div class="empty"><div class="empty-icon">🩸</div><h4>No blood requests yet</h4><p>When patients submit a blood request, it will appear here instantly.</p></div>';
      updateBloodBadge(0);
      return;
    }
    const pending = all.filter(r => r.status === 'pending').length;
    updateBloodBadge(pending);
    container.innerHTML = all.map(r => bloodReqCard(r, true)).join('');
  } catch(e) { container.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div><h4>Error loading requests</h4></div>'; }
}

function bloodReqCard(r, isAdmin) {
  const urgClass = (r.urgency || 'Medium').toLowerCase();
  const urgLabel = r.urgency === 'Critical' ? '🔴 Critical' : r.urgency === 'High' ? '🟠 High' : '🟡 Medium';
  const time = new Date(r.createdAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
  const statusBadge = r.status === 'fulfilled'
    ? '<span style="font-size:11px;font-weight:700;background:rgba(5,150,105,.1);color:var(--green);padding:3px 10px;border-radius:100px">✅ Fulfilled</span>'
    : '<span style="font-size:11px;font-weight:700;background:rgba(225,29,72,.1);color:var(--rose);padding:3px 10px;border-radius:100px">⏳ Pending</span>';
  const adminActions = isAdmin && r.status === 'pending' ? `
    <button onclick="markBloodFulfilled('${r.id}')" style="padding:7px 16px;background:var(--green);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif">✅ Mark Fulfilled</button>
    <button onclick="contactBloodPatient('${r.contactPhone}','${r.patientName}','${r.bloodGroup}')" style="padding:7px 16px;background:var(--accent);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif">📲 Contact via WhatsApp</button>` : '';
  return `
  <div class="blood-req-card ${urgClass}">
    <div class="blood-req-time">${time}</div>
    <div class="blood-req-top">
      <div class="blood-group-badge">${r.bloodGroup}</div>
      <div>
        <div class="blood-req-title">${r.patientName}</div>
        <div class="blood-req-sub">${r.hospital} · ${r.city}</div>
      </div>
      <span class="blood-urgency-tag urgency-${urgClass}">${urgLabel}</span>
    </div>
    <div class="blood-req-details">
      <span class="blood-req-detail">🩸 ${r.units || 1} unit(s) needed</span>
      <span class="blood-req-detail">📞 ${r.contactPhone}</span>
      ${r.notes ? `<span class="blood-req-detail">📝 ${r.notes}</span>` : ''}
      <span>${statusBadge}</span>
    </div>
    ${adminActions ? `<div class="blood-req-actions">${adminActions}</div>` : ''}
  </div>`;
}

async function markBloodFulfilled(id) {
  try {
    await BloodDB.updateBloodReq(id, { status: 'fulfilled' });
    showToast('✅ Request marked as fulfilled', 'success');
    renderAdminBloodRequests();
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
}

function contactBloodPatient(phone, name, bg) {
  const clean = phone.replace(/\D/g, '');
  const msg = encodeURIComponent(`🩸 *DiagnoLens Blood Request*\n\nHello ${name},\n\nWe have received your urgent blood request for *${bg}* blood group.\n\nA donor has been identified. Please contact the hospital blood bank immediately.\n\n_DiagnoLens — Smart Healthcare_`);
  window.open(`https://wa.me/${clean}?text=${msg}`, '_blank');
}

async function updateBloodBadge(count) {
  const badge = document.getElementById('blood-notif-badge');
  if (!badge) return;
  if (count === undefined) {
    try {
      const all = await BloodDB.getBloodRequests();
      count = all.filter(r => r.status === 'pending').length;
    } catch { count = 0; }
  }
  if (count > 0) { badge.textContent = count; badge.style.display = 'inline-flex'; }
  else badge.style.display = 'none';
}

// ══════════════════════════════════════════════════════════════
// ── BLOOD REQUEST POPUP NOTIFICATION SYSTEM ──────────────────
// ══════════════════════════════════════════════════════════════
let currentNotifRequestId = null;
let notifCheckInterval    = null;
let seenNotifIds          = new Set(JSON.parse(localStorage.getItem('dl_seen_blood_notifs') || '[]'));

function saveSeenNotifs() {
  localStorage.setItem('dl_seen_blood_notifs', JSON.stringify([...seenNotifIds].slice(-200)));
}

// Start polling for new blood requests (for logged-in patients/donors)
function startBloodNotifPolling() {
  if (notifCheckInterval) return; // already running
  notifCheckInterval = setInterval(checkForNewBloodRequests, 15000); // every 15s
  checkForNewBloodRequests(); // immediate check
}

function stopBloodNotifPolling() {
  if (notifCheckInterval) { clearInterval(notifCheckInterval); notifCheckInterval = null; }
}

async function checkForNewBloodRequests() {
  if (!currentUser || currentUser.role === 'admin') return;
  try {
    const all = await BloodDB.getBloodRequests();
    const pending = all.filter(r =>
      r.status === 'pending' &&
      r.userId !== currentUser.uid && // not own request
      !seenNotifIds.has(r.id)
    );
    if (pending.length > 0) {
      // Show the most recent unseen request
      const newest = pending[0];
      showBloodNotifPopup(newest);
    }
  } catch(e) { console.warn('Blood notif poll error:', e); }
}

function showBloodNotifPopup(req) {
  currentNotifRequestId = req.id;
  seenNotifIds.add(req.id);
  saveSeenNotifs();

  const overlay = document.getElementById('blood-notif-overlay');
  if (!overlay) return;

  document.getElementById('bnp-from-name').textContent = `From ${req.patientName || 'a patient'} at ${req.hospital || 'hospital'}`;
  document.getElementById('bnp-blood-group').textContent = req.bloodGroup || '?';

  const urgClass = req.urgency === 'Critical' ? '🔴' : req.urgency === 'High' ? '🟠' : '🟡';
  document.getElementById('bnp-details').innerHTML = `
    <div><strong>Patient:</strong> ${req.patientName}</div>
    <div><strong>Blood Group:</strong> <strong style="color:var(--rose)">${req.bloodGroup}</strong></div>
    <div><strong>Units Needed:</strong> ${req.units || 1}</div>
    <div><strong>Hospital:</strong> ${req.hospital}</div>
    <div><strong>City:</strong> ${req.city}</div>
    <div><strong>Urgency:</strong> ${urgClass} ${req.urgency}</div>
    ${req.notes ? `<div><strong>Notes:</strong> ${req.notes}</div>` : ''}
  `;

  overlay.style.display = 'flex';
}

async function acceptBloodRequest() {
  if (!currentNotifRequestId) return;
  const overlay = document.getElementById('blood-notif-overlay');
  if (overlay) overlay.style.display = 'none';

  try {
    // Save acceptance to Firestore
    const acceptId = DB.newId();
    await setDoc(doc(db, 'bloodAcceptances', acceptId), {
      id: acceptId,
      requestId: currentNotifRequestId,
      acceptedBy: currentUser.uid,
      acceptorName: currentUser.name || 'Unknown',
      acceptorPhone: currentUser.phone || '',
      acceptedAt: Date.now()
    });

    // Update the blood request with acceptor info
    const { arrayUnion } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
    await updateDoc(doc(db, 'bloodRequests', currentNotifRequestId), {
      acceptors: arrayUnion({
        uid: currentUser.uid,
        name: currentUser.name || 'Unknown',
        phone: currentUser.phone || '',
        acceptedAt: Date.now()
      })
    });

    showToast('✅ You accepted the blood request! The patient has been notified.', 'success');
    // Re-render if currently on blood page
    renderMyBloodRequests();
  } catch(e) {
    showToast('❌ Error accepting request: ' + e.message, 'error');
  }
  currentNotifRequestId = null;
}

function declineBloodRequest() {
  const overlay = document.getElementById('blood-notif-overlay');
  if (overlay) overlay.style.display = 'none';
  currentNotifRequestId = null;
}

// Extended BloodDB to get acceptors
BloodDB.getAcceptancesForRequest = async function(requestId) {
  const q = query(collection(db, 'bloodAcceptances'), where('requestId', '==', requestId));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data()).sort((a,b) => a.acceptedAt - b.acceptedAt);
};



// ══════════════════════════════════════════════════════════════
// ── AI PRESCRIPTION READER ────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let rxImageBase64 = null;
let rxImageMime   = 'image/jpeg';

function switchRxTab(tab, btn) {
  document.querySelectorAll('.rx-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('rx-upload-section').style.display = tab === 'upload' ? 'block' : 'none';
  document.getElementById('rx-text-section').style.display   = tab === 'text'   ? 'block' : 'none';
  clearRxResult();
}

function handleRxFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('File too large — max 5MB', 'error'); return; }
  rxImageMime = file.type || 'image/jpeg';
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    rxImageBase64 = dataUrl.split(',')[1];
    const img = document.getElementById('rx-preview-img');
    img.src = dataUrl;
    document.getElementById('rx-preview-wrap').style.display = 'block';
    document.getElementById('rx-drop-zone').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearRxInput() {
  rxImageBase64 = null;
  document.getElementById('rx-file-input').value = '';
  document.getElementById('rx-preview-wrap').style.display = 'none';
  document.getElementById('rx-drop-zone').style.display = 'block';
  clearRxResult();
}

function clearRxResult() {
  document.getElementById('rx-result').style.display  = 'none';
  document.getElementById('rx-loading').style.display = 'none';
  document.getElementById('rx-summary').innerHTML = '';
  document.getElementById('rx-medicines-list').innerHTML = '';
}

async function analyzeRxImage() {
  if (!rxImageBase64) { showToast('Please upload a prescription image first', 'error'); return; }
  await callRxAI({ type: 'image', base64: rxImageBase64, mime: rxImageMime });
}

async function analyzeRxText() {
  const text = document.getElementById('rx-text-input').value.trim();
  if (!text) { showToast('Please paste your prescription text first', 'error'); return; }
  await callRxAI({ type: 'text', text });
}

async function callRxAI({ type, base64, mime, text }) {
  document.getElementById('rx-loading').style.display = 'block';
  document.getElementById('rx-result').style.display  = 'none';
  window.scrollTo({ top: document.getElementById('rx-loading').offsetTop - 80, behavior: 'smooth' });

  try {
    let resp, data;

    if (type === 'image') {
      // Convert base64 back to a File/Blob and send as multipart form
      const byteString = atob(base64);
      const ab = new ArrayBuffer(byteString.length);
      const ia = new Uint8Array(ab);
      for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
      const blob = new Blob([ab], { type: mime });
      const formData = new FormData();
      formData.append('file', blob, 'prescription.' + (mime.split('/')[1] || 'jpg'));

      resp = await fetch(`${BLOOD_REPORT_API}/predict`, {
        method: 'POST',
        body: formData
      });
    } else {
      // Text prescription — send as JSON
      resp = await fetch(`${BLOOD_REPORT_API}/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
    }

    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    data = await resp.json();
    renderRxResult(data);
  } catch(e) {
    document.getElementById('rx-loading').style.display = 'none';
    showToast('❌ AI analysis failed: ' + e.message, 'error');
  }
}

function renderRxResult(data) {
  document.getElementById('rx-loading').style.display = 'none';
  document.getElementById('rx-result').style.display  = 'block';

  // Summary
  document.getElementById('rx-summary').innerHTML =
    `<strong>🔍 Summary:</strong> ${data.summary || 'Prescription analyzed successfully.'}`;

  // Medicines
  const medList = document.getElementById('rx-medicines-list');
  const meds = data.medicines || [];
  if (meds.length === 0) {
    medList.innerHTML = '<div class="empty"><div class="empty-icon">💊</div><h4>No medicines detected</h4><p>Try uploading a clearer image or typing the text</p></div>';
  } else {
    medList.innerHTML = meds.map((m, i) => `
      <div class="rx-medicine-card">
        <div class="rx-med-top">
          <div class="rx-med-icon">${getMedIcon(m.type)}</div>
          <div>
            <div class="rx-med-name">${m.name || 'Unknown Medicine'}</div>
            <div class="rx-med-type">${m.type || ''}</div>
          </div>
        </div>
        <div class="rx-med-grid">
          ${m.dosage     ? `<div class="rx-med-detail"><div class="rx-med-detail-label">Dosage</div><div class="rx-med-detail-val">${m.dosage}</div></div>` : ''}
          ${m.frequency  ? `<div class="rx-med-detail"><div class="rx-med-detail-label">Frequency</div><div class="rx-med-detail-val">${m.frequency}</div></div>` : ''}
          ${m.duration   ? `<div class="rx-med-detail"><div class="rx-med-detail-label">Duration</div><div class="rx-med-detail-val">${m.duration}</div></div>` : ''}
          ${m.instructions ? `<div class="rx-med-detail"><div class="rx-med-detail-label">Instructions</div><div class="rx-med-detail-val">${m.instructions}</div></div>` : ''}
        </div>
        ${m.purpose ? `<div class="rx-med-purpose">💡 <strong>Used for:</strong> ${m.purpose}</div>` : ''}
        ${m.warning ? `<div class="rx-med-warning">⚠️ ${m.warning}</div>` : ''}
      </div>`).join('');
  }

  // General Instructions
  const instrWrap = document.getElementById('rx-instructions-wrap');
  const instrEl   = document.getElementById('rx-instructions');
  if (data.generalInstructions) {
    instrWrap.style.display = 'block';
    instrEl.innerHTML = data.generalInstructions;
  } else {
    instrWrap.style.display = 'none';
  }

  window.scrollTo({ top: document.getElementById('rx-result').offsetTop - 80, behavior: 'smooth' });
}

function getMedIcon(type) {
  if (!type) return '💊';
  const t = type.toLowerCase();
  if (t.includes('syrup') || t.includes('liquid')) return '🍶';
  if (t.includes('inject') || t.includes('iv'))    return '💉';
  if (t.includes('drop'))  return '💧';
  if (t.includes('cream') || t.includes('oint'))   return '🧴';
  if (t.includes('inhale') || t.includes('spray')) return '💨';
  if (t.includes('capsule')) return '💊';
  return '💊';
}

// ══════════════════════════════════════════════════════════════
// ── AI PAGE MODE SWITCHER (Scan vs Prescription) ─────────────
// ══════════════════════════════════════════════════════════════
function switchRxMode(mode) {
  const scanSection = document.getElementById('rx-scan-section');
  const rxSection   = document.getElementById('rx-prescription-section');
  const scanBtn     = document.getElementById('rx-mode-scan-btn');
  const reportBtn   = document.getElementById('rx-mode-report-btn');
  if (mode === 'scan') {
    scanSection.style.display = 'block';
    rxSection.style.display   = 'none';
    scanBtn.classList.add('active');
    reportBtn.classList.remove('active');
  } else {
    scanSection.style.display = 'none';
    rxSection.style.display   = 'block';
    scanBtn.classList.remove('active');
    reportBtn.classList.add('active');
  }
}

// ══════════════════════════════════════════════════════════════
// ── SCAN TYPE SELECTOR ────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let currentScanType = 'chest';
function selectScanType(el, type) {
  document.querySelectorAll('.scan-type-card').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  currentScanType = type;
  const uploadCard   = document.getElementById('scan-upload-card');
  const comingSoon   = document.getElementById('scan-coming-soon');
  const scanResult   = document.getElementById('scan-result');
  const scanLoading  = document.getElementById('scan-loading');
  const liveTypes    = ['chest', 'blood'];
  if (liveTypes.includes(type)) {
    uploadCard.style.display  = 'block';
    comingSoon.style.display  = 'none';
    // Update banner and upload card text
    if (type === 'chest') {
      const title = document.getElementById('sib-title-text');
      const sub   = document.getElementById('sib-sub-text');
      const uTitle = document.getElementById('scan-upload-title');
      const uDesc  = document.getElementById('scan-upload-desc');
      if (title) title.textContent  = 'AI Scan Analysis — Powered by DiagnoLens Model';
      if (sub)   sub.innerHTML      = 'Upload a chest X-ray. Our model detects <strong>COVID-19</strong>, <strong>Pneumonia</strong>, <strong>Lung Opacity</strong>, and <strong>Normal</strong> conditions with high accuracy.';
      if (uTitle) uTitle.textContent = '📤 Upload Chest X-Ray';
      if (uDesc)  uDesc.textContent  = 'Upload a clear chest X-ray image. The AI model will analyze it and return a diagnosis with confidence score.';
    } else if (type === 'blood') {
      const title = document.getElementById('sib-title-text');
      const sub   = document.getElementById('sib-sub-text');
      const uTitle = document.getElementById('scan-upload-title');
      const uDesc  = document.getElementById('scan-upload-desc');
      if (title) title.textContent  = 'Blood Report AI Analysis — Powered by DiagnoLens';
      if (sub)   sub.innerHTML      = 'Upload a blood report image or <strong>PDF</strong>. Our deployed model analyzes it for <strong>Malaria</strong>, <strong>Typhoid</strong> and other conditions.';
      if (uTitle) uTitle.textContent = '📤 Upload Blood Report (Image or PDF)';
      if (uDesc)  uDesc.textContent  = 'Upload a blood report image (JPG/PNG) or PDF. The AI model will analyze it and return detected conditions.';
    }
  } else {
    uploadCard.style.display  = 'none';
    comingSoon.style.display  = 'block';
    if (scanResult)  scanResult.style.display  = 'none';
    if (scanLoading) scanLoading.style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════
// ── SCAN FILE HANDLER ─────────────────────────────────────────
// ══════════════════════════════════════════════════════════════
let scanFileData = null;

function handleScanFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showToast('❌ File too large — max 10MB', 'error'); return; }

  const preview   = document.getElementById('scan-preview-img');
  const dropInner = document.getElementById('scan-drop-inner');
  const fileInfo  = document.getElementById('scan-file-info');
  const fileName  = document.getElementById('scan-file-name');
  const isPdf     = file.type === 'application/pdf';

  const reader = new FileReader();
  reader.onload = (e) => {
    scanFileData = e.target.result;

    if (isPdf) {
      // PDFs can't show in <img> — show a PDF icon placeholder instead
      if (preview) {
        preview.style.display = 'none';
      }
      // Show a PDF badge in place of image preview
      const dropZone = document.getElementById('scan-drop-zone') || dropInner?.parentElement;
      if (dropZone) {
        let pdfBadge = document.getElementById('scan-pdf-badge');
        if (!pdfBadge) {
          pdfBadge = document.createElement('div');
          pdfBadge.id = 'scan-pdf-badge';
          pdfBadge.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;padding:28px 20px;gap:8px';
          dropZone.parentElement.insertBefore(pdfBadge, dropZone.nextSibling);
        }
        pdfBadge.style.display = 'flex';
        pdfBadge.innerHTML = `<div style="font-size:48px">📄</div><div style="font-size:14px;font-weight:700;color:var(--accent)">PDF Ready</div><div style="font-size:12px;color:var(--muted)">${file.name}</div>`;
      }
    } else {
      // Image — show preview as before
      if (preview) { preview.src = e.target.result; preview.style.display = 'block'; }
      const pdfBadge = document.getElementById('scan-pdf-badge');
      if (pdfBadge) pdfBadge.style.display = 'none';
    }

    if (dropInner) dropInner.style.display = 'none';
    if (fileInfo)  { fileInfo.style.display = 'flex'; if (fileName) fileName.textContent = file.name; }
    document.getElementById('scan-result').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function clearScanInput() {
  scanFileData = null;
  const preview   = document.getElementById('scan-preview-img');
  const dropInner = document.getElementById('scan-drop-inner');
  const fileInfo  = document.getElementById('scan-file-info');
  const fileInput = document.getElementById('scan-file-input');
  const pdfBadge  = document.getElementById('scan-pdf-badge');
  if (preview)   { preview.src = ''; preview.style.display = 'none'; }
  if (pdfBadge)  pdfBadge.style.display = 'none';
  if (dropInner) dropInner.style.display = 'flex';
  if (fileInfo)  fileInfo.style.display = 'none';
  if (fileInput) fileInput.value = '';
  document.getElementById('scan-result').style.display  = 'none';
  document.getElementById('scan-loading').style.display = 'none';
}

function clearScanResult() { clearScanInput(); }

// ══════════════════════════════════════════════════════════════
// ── SCAN ANALYSIS — calls deployed Railway model ──────────────
// ══════════════════════════════════════════════════════════════
const SCAN_API        = 'https://multi-disease-detection-model-production.up.railway.app';
const BLOOD_REPORT_API = 'https://web-production-8186b.up.railway.app';

async function analyzeScan() {
  if (!scanFileData) { showToast('❌ Please upload a scan image first', 'error'); return; }
  const fileInput = document.getElementById('scan-file-input');
  const file = fileInput.files[0];
  if (!file) { showToast('❌ No file selected', 'error'); return; }

  document.getElementById('scan-loading').style.display = 'block';
  document.getElementById('scan-result').style.display  = 'none';

  try {
    const formData = new FormData();

    const apiUrl = currentScanType === 'blood'
      ? `${BLOOD_REPORT_API}/predict`
      : `${SCAN_API}/predict`;

    // X-Ray backend expects key: 'image'
    // Blood Report backend expects key: 'file'
    const fileKey = currentScanType === 'blood' ? 'file' : 'image';
    formData.append(fileKey, file);

    const resp = await fetch(apiUrl, {
      method: 'POST',
      body: formData
    });

    if (!resp.ok) throw new Error(`API error ${resp.status}`);
    const data = await resp.json();
    document.getElementById('scan-loading').style.display = 'none';
    renderScanResult(data);
  } catch(e) {
    document.getElementById('scan-loading').style.display = 'none';
    showToast('❌ Scan analysis failed: ' + e.message, 'error');
  }
}

const SCAN_CONDITION_ICONS = {
  'covid': '🦠', 'covid-19': '🦠', 'pneumonia': '🫁', 'normal': '✅',
  'lung opacity': '🌫️', 'lung_opacity': '🌫️', 'opacity': '🌫️'
};

function renderScanResult(data) {
  console.log('🩺 API Response:', JSON.stringify(data));
  document.getElementById('scan-result').style.display = 'block';

  if (currentScanType === 'blood') {
    renderBloodReportResult(data);
    return;
  }
  renderXRayResult(data);
}

// ── X-Ray Result ─────────────────────────────────────────────────
function renderXRayResult(data) {
  const prediction =
    data.disease    || data.prediction || data.class ||
    data.label      || data.result     || 'Unknown';

  const confidence =
    data.confidence  !== undefined ? data.confidence  :
    data.probability !== undefined ? data.probability :
    data.score       !== undefined ? data.score       : null;

  const predLower = prediction.toLowerCase();

  // Severity colour for the pill
  const isNormal   = predLower.includes('normal');
  const isCritical = predLower.includes('covid') || predLower.includes('pneumonia');
  const pillColor  = isNormal ? 'background:rgba(5,150,105,.15);color:#059669;border-color:rgba(5,150,105,.2)'
                   : isCritical ? 'background:rgba(225,29,72,.12);color:#e11d48;border-color:rgba(225,29,72,.2)'
                   : 'background:rgba(245,158,11,.12);color:#d97706;border-color:rgba(245,158,11,.2)';
  const pillLabel  = isNormal ? '✅ Looks Normal' : isCritical ? '⚠️ Needs Attention' : '🔍 Review Advised';
  const icon       = SCAN_CONDITION_ICONS[predLower] || '🔬';

  // Fill hero
  document.getElementById('src-pred-icon').textContent  = icon;
  document.getElementById('src-pred-value').textContent = prediction;
  const pill = document.getElementById('src-pred-pill');
  if (pill) { pill.textContent = pillLabel; pill.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;border:1px solid;${pillColor}`; }

  // Confidence
  const confWrap = document.getElementById('src-confidence-wrap');
  if (confidence !== null) {
    confWrap.style.display = 'block';
    const pct = confidence > 1 ? confidence : confidence * 100;
    document.getElementById('src-conf-fill').style.width = `${pct.toFixed(1)}%`;
    document.getElementById('src-conf-pct').textContent  = `${pct.toFixed(1)}%`;
    const hint = document.getElementById('src-conf-hint');
    if (hint) hint.textContent = pct >= 85 ? '🟢 High confidence — strong signal'
                                : pct >= 60 ? '🟡 Moderate confidence — review advised'
                                : '🔴 Low confidence — please re-upload a clearer image';
  } else {
    confWrap.style.display = 'none';
  }

  // Clear breakdown (X-Ray API doesn't return per-class breakdown, so just empty)
  document.getElementById('src-all-predictions').innerHTML = '';

  window.scrollTo({ top: document.getElementById('scan-result').offsetTop - 80, behavior: 'smooth' });
}

// ── Blood Report Result ───────────────────────────────────────────
// API shape: { status, summary, conditions:[{title,description,severity,color}], recommendations:[] }
function renderBloodReportResult(data) {
  const confWrap = document.getElementById('src-confidence-wrap');
  confWrap.style.display = 'none';

  const summary      = data.summary || 'Report Analyzed';
  const summaryLower = summary.toLowerCase();
  const icon =
    summaryLower.includes('normal')    ? '✅' :
    summaryLower.includes('diabetes')  ? '💉' :
    summaryLower.includes('vitamin')   ? '💊' :
    summaryLower.includes('infection') ? '🦠' :
    summaryLower.includes('anemia')    ? '🩸' :
    summaryLower.includes('thyroid')   ? '🦋' : '🔬';

  document.getElementById('src-pred-icon').textContent  = icon;
  document.getElementById('src-pred-value').textContent = summary;

  // Status pill
  const conditions   = data.conditions || [];
  const hasHigh      = conditions.some(c => c.severity === 'High');
  const hasMod       = conditions.some(c => c.severity === 'Moderate');
  const pillLabel    = hasHigh ? '⚠️ Action Required' : hasMod ? '🔍 Follow Up Advised' : '✅ Looks Healthy';
  const pillStyle    = hasHigh
    ? 'background:rgba(225,29,72,.12);color:#e11d48;border-color:rgba(225,29,72,.2)'
    : hasMod
    ? 'background:rgba(245,158,11,.12);color:#d97706;border-color:rgba(245,158,11,.2)'
    : 'background:rgba(5,150,105,.12);color:#059669;border-color:rgba(5,150,105,.2)';
  const pill = document.getElementById('src-pred-pill');
  if (pill) { pill.textContent = pillLabel; pill.style.cssText = `display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;border:1px solid;${pillStyle}`; }

  const wrap = document.getElementById('src-all-predictions');
  let html   = '';

  // ── Conditions grid ──────────────────────────────────────────
  if (conditions.length > 0) {
    html += `<div style="font-size:11px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-bottom:12px">${conditions.length} Condition${conditions.length>1?'s':''} Found</div>`;
    html += `<div class="blood-cond-grid">`;
    html += conditions.map(c => {
      const isRed = c.color === 'red';
      const isOrg = c.color === 'orange';
      const isGrn = c.color === 'green';
      const bc  = isRed ? '#fef2f2' : isOrg ? '#fff7ed' : isGrn ? '#f0fdf4' : '#f5f3ff';
      const bdr = isRed ? '#fecaca' : isOrg ? '#fed7aa' : isGrn ? '#bbf7d0' : '#ddd6fe';
      const tc  = isRed ? '#b91c1c' : isOrg ? '#c2410c' : isGrn ? '#15803d' : '#6d28d9';
      const si  = c.severity==='High' ? '🔴' : c.severity==='Moderate' ? '🟠' : c.severity==='Low' ? '🟡' : '🟢';
      return `<div class="blood-cond-card" style="background:${bc};border-color:${bdr}">
        <div class="blood-cond-card-top">
          <div class="blood-cond-title" style="color:${tc}">${c.title||'—'}</div>
          <span class="blood-sev-badge" style="background:${bdr};color:${tc};border:1px solid ${bdr}">${si} ${c.severity||''}</span>
        </div>
        <div class="blood-cond-desc">${c.description||''}</div>
      </div>`;
    }).join('');
    html += `</div>`;
  } else {
    html += `<div style="padding:20px;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:14px;font-size:14px;font-weight:700;color:#15803d;text-align:center;margin-bottom:18px">✅ All parameters look normal — no abnormalities detected</div>`;
  }

  // ── Recommendations ──────────────────────────────────────────
  const recs = data.recommendations || [];
  if (recs.length > 0) {
    html += `<div class="blood-rec-box">
      <div class="blood-rec-title">💡 Recommendations</div>`;
    html += recs.map(r => `<div class="blood-rec-item"><span class="blood-rec-arrow">→</span><span>${r}</span></div>`).join('');
    html += `</div>`;
  }

  wrap.innerHTML = html;
  window.scrollTo({ top: document.getElementById('scan-result').offsetTop - 80, behavior: 'smooth' });
}
// ══════════════════════════════════════════════════════════════
// ── VAPI CALLBACK BOOKING + CALL BOOKINGS ADMIN
// ══════════════════════════════════════════════════════════════

const RAILWAY_BACKEND           = 'https://diagnolenss-production.up.railway.app';
const VAPI_INBOUND_ASSISTANT_ID = 'YOUR_VAPI_INBOUND_ASSISTANT_ID'; // paste from vapi.ai

// ── Call Bookings Firestore helpers ───────────────────────────
const CallBookingsDB = {
  async save(record) {
    await setDoc(doc(db, 'call_bookings', record.id), record, { merge: true });
  },
  async getAll() {
    const snap = await getDocs(collection(db, 'call_bookings'));
    return snap.docs.map(d => d.data()).sort((a, b) => b.requestedAt - a.requestedAt);
  },
  async update(id, fields) {
    await updateDoc(doc(db, 'call_bookings', id), fields);
  }
};

// ── In-session callback log ────────────────────────────────────
let callbackLog = JSON.parse(localStorage.getItem('dl_callback_log') || '[]');
function saveCallbackLog(log) {
  callbackLog = log;
  localStorage.setItem('dl_callback_log', JSON.stringify(log.slice(0, 100)));
}

// ── Landing page trigger ───────────────────────────────────────
// ── Landing trigger (removed — not used anymore) ───────────────
function triggerVapiCallbackLanding() {
  showToast('Please login first to book via call', 'info');
  goToAuth('patient');
}

// ── Patient dashboard trigger — uses registered phone ──────────
async function triggerVapiCallbackPatient() {
  if (!currentUser) { showToast('❌ Please login first', 'error'); return; }

  const phone = currentUser.phone;
  if (!phone) { showToast('❌ No phone number on your account. Please update your profile.', 'error'); return; }

  const btn    = document.getElementById('patient-call-btn');
  const result = document.getElementById('patient-call-result');

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Requesting Call…'; btn.style.opacity = '0.7'; }
  if (result) result.style.display = 'none';

  const MAKE_VOICE_WEBHOOK = 'https://hook.eu1.make.com/scmzmsdama2xa7vpqiij5kn9f7i0uvci';

  const payload = {
    name:        currentUser.name  || '',
    email:       currentUser.email || '',
    phone:       phone,
    requestedAt: new Date().toLocaleString('en-IN'),
    source:      'DiagnoLens Patient Dashboard'
  };

  try {
    await fetch(MAKE_VOICE_WEBHOOK, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload)
    });

    // Save to local admin dashboard
    const record = {
      id:          DB.newId(),
      phone,
      name:        currentUser.name,
      email:       currentUser.email || '',
      userId:      currentUser.uid,
      requestedAt: Date.now(),
      status:      'pending',
      source:      'dashboard'
    };
    try { await CallBookingsDB.save(record); } catch (e) { console.warn('CallBookingsDB save error:', e); }

    if (result) {
      result.style.display = 'block';
      result.style.cssText += ';background:rgba(5,150,105,.08);border:1px solid rgba(5,150,105,.2);color:#059669';
      result.innerHTML = `✅ <strong>Call request sent!</strong> Vaidya AI will call <strong>${phone}</strong> in seconds. Once done, you will receive a WhatsApp confirmation with your booking details.`;
    }
    showToast(`📞 Vaidya will call ${phone} shortly!`, 'success');

  } catch (err) {
    if (result) {
      result.style.display = 'block';
      result.style.cssText += ';background:rgba(225,29,72,.06);border:1px solid rgba(225,29,72,.15);color:#e11d48';
      result.innerHTML = `❌ <strong>Could not send request:</strong> ${err.message}. Please try again.`;
    }
    showToast('❌ Request failed — please try again', 'error');
  }

  if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = '📞 Call Me Now'; }
}
function scrollToCallBook() {
  const el = document.getElementById('landing-call-section');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Admin: Call Bookings tab ───────────────────────────────────
let cbFilter = 'all';

function filterCallBookings(f, btn) {
  cbFilter = f;
  document.querySelectorAll('#admin-callbookings-section .filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCallBookingsTable();
}

async function renderCallBookingsSection() {
  updateCbGasUrlStatus();
  await updateCallBookingStats();
  await renderCallBookingsTable();
}

async function updateCallBookingStats() {
  try {
    const all    = await CallBookingsDB.getAll();
    const today  = getTodayStr();
    const todayStr = new Date().toLocaleDateString('en-IN');
    document.getElementById('cb-stat-total').textContent   = all.length;
    document.getElementById('cb-stat-today').textContent   = all.filter(r => {
      if (!r.requestedAt) return false;
      return new Date(r.requestedAt).toLocaleDateString('en-IN') === todayStr;
    }).length;
    document.getElementById('cb-stat-upcoming').textContent = all.filter(r => r.status === 'called' || r.status === 'done').length;
    document.getElementById('cb-stat-pending').textContent  = all.filter(r => !r.status || r.status === 'pending').length;
  } catch(e) { console.warn('updateCallBookingStats:', e); }
}

async function renderCallBookingsTable() {
  const tbody = document.getElementById('call-bookings-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">⏳ Loading…</td></tr>';
  try {
    const search = (document.getElementById('cb-search')?.value || '').toLowerCase();
    const todayStr = new Date().toLocaleDateString('en-IN');
    let all = await CallBookingsDB.getAll();
    // Filter by date for today tab
    if (cbFilter === 'today') all = all.filter(r => {
      if (!r.requestedAt) return false;
      return new Date(r.requestedAt).toLocaleDateString('en-IN') === todayStr;
    });
    if (cbFilter === 'upcoming') all = all.filter(r => r.status === 'called' || r.status === 'done');
    if (cbFilter === 'completed') all = all.filter(r => r.status === 'done');
    if (search) all = all.filter(r =>
      (r.name||'').toLowerCase().includes(search) ||
      (r.phone||'').includes(search) ||
      (r.email||'').toLowerCase().includes(search)
    );
    if (all.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)"><div style="font-size:32px;margin-bottom:8px">📞</div>No voice call requests match your filter</td></tr>';
      return;
    }
    tbody.innerHTML = all.map(r => {
      const statusColor = r.status === 'done' ? '#059669' : r.status === 'called' ? '#2563eb' : '#d97706';
      const statusLabel = r.status === 'done' ? '✅ Booked' : r.status === 'called' ? '📞 Called' : '⏳ Pending';
      const safeName    = (r.name||'').replace(/'/g,"\\'");
      const timeStr     = r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}) : '—';
      return `<tr>
        <td style="font-weight:600">${r.name||'—'}</td>
        <td style="font-size:12px;color:var(--muted)">${r.email||'—'}</td>
        <td style="font-size:12px">${r.phone||'—'}</td>
        <td style="font-size:11px;color:var(--muted)">${timeStr}</td>
        <td><span style="font-size:11px;font-weight:700;color:${statusColor}">${statusLabel}</span></td>
        <td>
          <div style="display:flex;gap:5px;flex-wrap:wrap">
            ${r.phone ? `<button onclick="adminSendWhatsApp('${r.phone}','${safeName}','')"
              style="padding:3px 9px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">📲 WA</button>` : ''}
            ${r.phone ? `<button onclick="adminSendSMS('${r.phone}','${safeName}','')"
              style="padding:3px 9px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">💬 SMS</button>` : ''}
            <button onclick="removeCallRequest('${r.id}')"
              style="padding:3px 9px;background:#e11d48;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">🗑 Remove</button>
          </div>
        </td>
      </tr>`;
    }).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--rose)">❌ Error: ${e.message}</td></tr>`;
  }
}

// ── Remove a voice call request manually ─────────────────────
async function removeCallRequest(id) {
  if (!id) return;
  if (!confirm('Remove this voice call request? This cannot be undone.')) return;
  try {
    await deleteDoc(doc(db, 'call_bookings', id));
    showToast('✅ Request removed', 'success');
    await updateCallBookingStats();
    await renderCallBookingsTable();
  } catch(e) {
    showToast('❌ Could not remove: ' + e.message, 'error');
  }
}

// ── Load AI-booked appointments from Google Sheets ────────────
async function loadAICallAppointments() {
  const tbody = document.getElementById('ai-call-appts-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--muted)">⏳ Loading from Google Sheets…</td></tr>';
  try {
    const backend = 'https://diagnolenss-production.up.railway.app';
    const resp    = await fetch(`${backend}/fetch-gas?action=getAll`);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)"><div style="font-size:32px;margin-bottom:8px">🤖</div>No AI-booked appointments found in Google Sheets</td></tr>';
      return;
    }
    window._aiCallAppts = data;
    renderAICallApptsTable();
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:var(--rose)">❌ Error: ${e.message}</td></tr>`;
  }
}

function renderAICallApptsTable() {
  const tbody = document.getElementById('ai-call-appts-table');
  if (!tbody || !window._aiCallAppts) return;
  if (window._aiCallAppts.length === 0) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:32px;color:var(--muted)">No entries remaining</td></tr>';
    return;
  }
  tbody.innerHTML = window._aiCallAppts.map((row, i) => `<tr>
    <td style="font-weight:600">${row.patientName||row.name||'—'}</td>
    <td style="font-size:12px">${row.phone||'—'}</td>
    <td style="font-size:12px">${row.hospital||'—'}</td>
    <td style="font-size:12px">${row.dept||'—'}</td>
    <td style="font-size:12px">${row.date||'—'}</td>
    <td style="font-size:12px">${row.slot||'—'}</td>
    <td style="font-size:11px;color:var(--muted)">${row.requestedAt||'—'}</td>
    <td>
      <button onclick="removeAICallAppt(${i})"
        style="padding:3px 9px;background:#e11d48;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">🗑 Remove</button>
    </td>
  </tr>`).join('');
}

function removeAICallAppt(index) {
  if (!window._aiCallAppts) return;
  if (!confirm('Remove this entry from view? (The row in Google Sheets is not deleted.)')) return;
  window._aiCallAppts.splice(index, 1);
  renderAICallApptsTable();
  showToast('✅ Removed from view', 'success');
}

// ── Load and display cancelled bookings ───────────────────────
async function loadCancelledBookings() {
  const tbody = document.getElementById('cancelled-bookings-table');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--muted)">⏳ Loading…</td></tr>';
  try {
    const all       = await DB.getAppointments();
    const cancelled = all.filter(a => a.status === 'cancelled');
    if (cancelled.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--muted)"><div style="font-size:32px;margin-bottom:8px">✅</div>No cancelled bookings</td></tr>';
      return;
    }
    tbody.innerHTML = cancelled.map(a => `<tr>
      <td style="font-size:12px;font-weight:600">${a.token||'—'}</td>
      <td style="font-weight:600">${a.patientName||'—'}</td>
      <td style="font-size:12px">${a.phone||'—'}</td>
      <td style="font-size:12px">${a.hospitalName||'—'}</td>
      <td style="font-size:12px">${a.dept||'—'}</td>
      <td style="font-size:12px">${a.date||'—'}</td>
      <td>
        <button onclick="removeCancelledBooking('${a.id}')"
          style="padding:3px 9px;background:#e11d48;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">🗑 Remove</button>
      </td>
    </tr>`).join('');
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--rose)">❌ Error: ${e.message}</td></tr>`;
  }
}

async function removeCancelledBooking(id) {
  if (!id) return;
  if (!confirm('Permanently delete this cancelled booking?')) return;
  try {
    await deleteDoc(doc(db, 'appointments', id));
    showToast('✅ Booking removed', 'success');
    loadCancelledBookings();
    adminRender();
  } catch(e) {
    showToast('❌ Could not remove: ' + e.message, 'error');
  }
}

function renderCallbackLogTable() {
  const tbody = document.getElementById('callback-log-table');
  if (!tbody) return;
  const log = JSON.parse(localStorage.getItem('dl_callback_log') || '[]');
  if (log.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:24px">No callback requests yet</td></tr>';
    return;
  }
  tbody.innerHTML = log.slice(0, 50).map(r => {
    const statusColor = r.status === 'calling' ? '#d97706' : r.status === 'failed' ? '#e11d48' : '#059669';
    const statusLabel = r.status === 'calling' ? '📞 Calling' : r.status === 'failed' ? '❌ Failed' : '✅ Done';
    const sourceLabel = r.source === 'landing' ? '🌐 Landing Page' : '📊 Dashboard';
    return `<tr>
      <td style="font-size:12px;color:var(--muted)">${r.time||'—'}</td>
      <td style="font-weight:600">${r.phone}</td>
      <td><span style="font-size:11px;padding:3px 8px;background:rgba(124,58,237,.08);color:var(--accent2);border-radius:6px;font-weight:600">${sourceLabel}</span></td>
      <td style="font-size:11px;font-family:monospace;color:var(--muted)">${r.vapiCallId ? r.vapiCallId.substring(0,22)+'…' : '—'}</td>
      <td><span style="font-size:11px;font-weight:700;color:${statusColor}">${statusLabel}</span></td>
      <td>${r.phone ? `<button onclick="window.open('https://wa.me/${r.phone.replace('+','')}','_blank')"
        style="padding:3px 9px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">📲 WA</button>` : '—'}</td>
    </tr>`;
  }).join('');
}

async function exportCallBookingsCSV() {
  try {
    const all = await CallBookingsDB.getAll();
    if (all.length === 0) { showToast('No voice call requests to export', 'error'); return; }
    const headers = ['Name','Email','Phone','Requested At','Status'];
    const rows = all.map(r => [
      r.name||'', r.email||'', r.phone||'',
      r.requestedAt ? new Date(r.requestedAt).toLocaleString('en-IN') : '',
      r.status||'pending'
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    const csv  = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: `voice-call-requests-${getTodayStr()}.csv` });
    a.click(); URL.revokeObjectURL(url);
    showToast('✅ CSV exported!', 'success');
  } catch(e) { showToast('Export failed: ' + e.message, 'error'); }
}

// ── EXPOSE GLOBALS ────────────────────────────────────────────
window.showApptQR=showApptQR; window.closeApptQrModal=closeApptQrModal;
window.goHome=goHome; window.goToAuth=goToAuth; window.navBookAppointment=navBookAppointment;
window.navGoTo=navGoTo; window.switchRole=switchRole; window.switchForm=switchForm;
window.doLogin=doLogin; window.doRegister=doRegister; window.doLogout=doLogout;
window.showBookingForm=showBookingForm; window.cancelBookingForm=cancelBookingForm;
window.onCityChange=onCityChange; window.onHospitalChange=onHospitalChange;
window.onDeptChange=onDeptChange; window.onDateChange=onDateChange;
window.confirmBooking=confirmBooking; window.closeModal=closeModal;
window.filterAppts=filterAppts; window.cancelAppt=cancelAppt;
window.promptCancelAppt=promptCancelAppt; window.confirmCancelAppt=confirmCancelAppt; window.closeCancelModal=closeCancelModal;
window.loadQueueForAppt=loadQueueForAppt; window.sendTestWhatsApp=sendTestWhatsApp;
window.openWhatsApp=openWhatsApp; window.openWhatsAppFromLog=openWhatsAppFromLog;
window.startCallFlow=startCallFlow; window.toggleMic=toggleMic;
window.toggleCam=toggleCam; window.stopCall=stopCall;
window.adminTab=adminTab; window.adminRender=adminRender; window.adminCancelAppt=adminCancelAppt;
window.renderVoiceMemberTable=renderVoiceMemberTable;
window.adminDeleteMember=adminDeleteMember;
window.adminSendWhatsApp=adminSendWhatsApp;
window.adminDoSendWhatsApp=adminDoSendWhatsApp;
window.adminDoClearWaForm=adminDoClearWaForm;
window.setWaTpl=setWaTpl;
window.adminSendSMS=adminSendSMS;
window.adminDoSendSMS=adminDoSendSMS;
window.adminDoClearSmsForm=adminDoClearSmsForm;
window.setSmsTpl=setSmsTpl;
window.renderAdminWaTodayTable=renderAdminWaTodayTable;
window.renderSheetsRecent=renderSheetsRecent;
window.adminSmsTokenChange=adminSmsTokenChange;
window.adminWaTokenChange=adminWaTokenChange;
window.populateApptDropdowns=populateApptDropdowns;
window.saveGasUrl=saveGasUrl;
window.testGasUrl=testGasUrl;
window.saveMakeWebhookUrl=saveMakeWebhookUrl;
window.saveTwilioBackendUrl=saveTwilioBackendUrl;
window.triggerVoiceAgentWebhook=triggerVoiceAgentWebhook;
window.clearVoiceAgentForm=clearVoiceAgentForm;
window.syncAllToSheets=syncAllToSheets;
window.switchRxTab=switchRxTab; window.handleRxFile=handleRxFile;
window.clearRxInput=clearRxInput; window.clearRxResult=clearRxResult;
window.analyzeRxImage=analyzeRxImage; window.analyzeRxText=analyzeRxText;
window.switchRxMode=switchRxMode;
window.selectScanType=selectScanType; window.handleScanFile=handleScanFile;
window.clearScanInput=clearScanInput; window.clearScanResult=clearScanResult;
window.analyzeScan=analyzeScan;
window.showBloodSection=showBloodSection; window.hideBloodSections=hideBloodSections;
window.selectUrgency=selectUrgency; window.registerDonor=registerDonor;
window.submitBloodRequest=submitBloodRequest; window.markBloodFulfilled=markBloodFulfilled;
window.contactBloodPatient=contactBloodPatient; window.renderAdminBloodRequests=renderAdminBloodRequests;
window.acceptBloodRequest=acceptBloodRequest; window.declineBloodRequest=declineBloodRequest;
window.triggerVapiCallbackLanding=triggerVapiCallbackLanding;
window.triggerVapiCallbackPatient=triggerVapiCallbackPatient;
window.scrollToCallBook=scrollToCallBook;
window.filterCallBookings=filterCallBookings;
window.renderCallBookingsTable=renderCallBookingsTable;
window.removeCallRequest=removeCallRequest;
window.loadAICallAppointments=loadAICallAppointments;
window.removeAICallAppt=removeAICallAppt;
window.loadCancelledBookings=loadCancelledBookings;
window.removeCancelledBooking=removeCancelledBooking;
window.exportCallBookingsCSV=exportCallBookingsCSV;
window.saveCbGasUrl=saveCbGasUrl;
window.syncAllCallRequestsToSheets=syncAllCallRequestsToSheets;
