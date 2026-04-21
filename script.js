// ═══════════════════════════════════════════════════════════════
// DiagnoLens — script.js  (Enhanced Edition)
// All data stored in localStorage — users, appointments, notifications
// Admin sees ALL data; Voice Agent tab shows all registered members
// ═══════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════
// ── LOCAL DATABASE ENGINE ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════
const DB = {
  _read(key)  { try { return JSON.parse(localStorage.getItem('dl_'+key)||'[]'); } catch { return []; } },
  _write(key,val) { localStorage.setItem('dl_'+key, JSON.stringify(val)); },
  newId()     { return Date.now().toString(36)+Math.random().toString(36).slice(2,8); },

  // USERS
  getUsers()            { return this._read('users'); },
  getUserByEmail(email) { return this.getUsers().find(u=>u.email===email)||null; },
  getUserById(uid)      { return this.getUsers().find(u=>u.uid===uid)||null; },
  saveUser(user) {
    const list=this.getUsers(), idx=list.findIndex(u=>u.uid===user.uid);
    if(idx>=0) list[idx]=user; else list.push(user);
    this._write('users',list);
  },

  // APPOINTMENTS — stored globally, admin sees all
  getAppointments()     { return this._read('appointments'); },
  getApptsByUser(uid)   { return this.getAppointments().filter(a=>a.userId===uid); },
  saveAppt(appt) {
    const list=this.getAppointments(), idx=list.findIndex(a=>a.id===appt.id);
    if(idx>=0) list[idx]=appt; else list.push(appt);
    this._write('appointments',list);
    cloudSaveAppt(appt); // sync to cloud for cross-device visibility
    return appt;
  },
  updateAppt(id,fields) {
    const list=this.getAppointments(), idx=list.findIndex(a=>a.id===id);
    if(idx>=0){ list[idx]={...list[idx],...fields}; this._write('appointments',list); }
  },
  isTaken(hospitalId,dept,date,slot) {
    return this.getAppointments().some(a=>
      a.hospitalId===hospitalId&&a.dept===dept&&a.date===date&&a.slot===slot&&a.status!=='cancelled');
  },
  countActive(hospitalId,dept) {
    return this.getAppointments().filter(a=>
      a.hospitalId===hospitalId&&a.dept===dept&&a.status!=='cancelled').length;
  },
  getTakenSlots(hospitalId,dept,date) {
    return this.getAppointments()
      .filter(a=>a.hospitalId===hospitalId&&a.dept===dept&&a.date===date&&a.status!=='cancelled')
      .map(a=>a.slot);
  },

  // NOTIFICATIONS
  getNotifications()  { return this._read('notifications'); },
  saveNotification(n) { const list=this.getNotifications(); list.unshift(n); this._write('notifications',list.slice(0,200)); },
  getNotisByUser(uid) { return this.getNotifications().filter(n=>n.userId===uid); },

  // SESSION
  getSession()   { try{ return JSON.parse(localStorage.getItem('dl_session')||'null'); }catch{return null;} },
  setSession(uid){ localStorage.setItem('dl_session',JSON.stringify(uid)); },
  clearSession() { localStorage.removeItem('dl_session'); },
};

// ══════════════════════════════════════════════════════════════
// ── CROSS-DEVICE SYNC via Railway backend ─────────────────────
// All appointments are synced to/from the Railway backend so
// admin can see data from every device / user session.
// ══════════════════════════════════════════════════════════════
const RAILWAY_URL = 'https://diagnolenss-production.up.railway.app';

async function cloudSaveAppt(appt){
  try{
    await fetch(RAILWAY_URL+'/cloud-appt', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(appt)
    });
  } catch(e){ console.warn('Cloud save skipped:', e.message); }
}

async function cloudFetchAppts(){
  try{
    const res = await fetch(RAILWAY_URL+'/cloud-appts');
    if(!res.ok) return [];
    return await res.json();
  } catch(e){ return []; }
}

// Merge cloud appointments into local DB (cloud wins for same id)
async function syncCloudAppts(){
  const cloud = await cloudFetchAppts();
  if(!cloud || !cloud.length) return;
  const local = DB.getAppointments();
  const merged = [...local];
  for(const ca of cloud){
    const idx = merged.findIndex(a=>a.id===ca.id);
    if(idx>=0) merged[idx]=ca; else merged.push(ca);
  }
  DB._write('appointments', merged);
}

// ── SEED DEFAULT ADMIN ACCOUNT ────────────────────────────────
// Creates admin@diagnolens.com / Admin@123
// Also force-updates password if old hash was stored (fixes stale admin123)
(function seedDefaultAdmin(){
  const existing = DB.getUserByEmail('admin@diagnolens.com');
  const correctHash = hashPassFn('Admin@123');
  if(!existing){
    DB.saveUser({
      uid: 'admin-default-001',
      name: 'DiagnoLens Admin',
      email: 'admin@diagnolens.com',
      phone: '+919999900000',
      role: 'admin',
      hospital: 'DiagnoLens HQ',
      passwordHash: correctHash,
      createdAt: Date.now()
    });
  } else if(existing.passwordHash !== correctHash){
    // Force-update old password hash to new one
    existing.passwordHash = correctHash;
    DB.saveUser(existing);
  }
})();

function hashPassFn(p){ let h=0; for(let i=0;i<p.length;i++)h=(Math.imul(31,h)+p.charCodeAt(i))|0; return 'h_'+Math.abs(h).toString(36)+'_'+p.length; }

// ── HOSPITAL DATA ─────────────────────────────────────────────
const HOSPITALS = {
  "Delhi":[
    {id:"fortis-delhi",name:"Fortis Hospital",abbr:"FOR",depts:["Cardiology","Neurology","Orthopaedics","Oncology","Gynaecology","ENT","Dermatology","Nephrology"]},
    {id:"aiims-delhi",name:"AIIMS Delhi",abbr:"AII",depts:["General Medicine","Cardiology","Neurology","Orthopaedics","Paediatrics","Psychiatry","Ophthalmology"]},
    {id:"apollo-delhi",name:"Apollo Hospitals Delhi",abbr:"APO",depts:["Cardiology","Oncology","Neurology","Gastroenterology","Urology","Pulmonology"]},
    {id:"max-delhi",name:"Max Super Speciality",abbr:"MAX",depts:["Cardiology","Orthopaedics","Neurology","Oncology","Transplant","Bariatric Surgery"]}
  ],
  "Mumbai":[
    {id:"lilavati-mumbai",name:"Lilavati Hospital",abbr:"LIL",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Ophthalmology","Nephrology"]},
    {id:"kokilaben-mumbai",name:"Kokilaben Dhirubhai Ambani",abbr:"KOK",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Transplant","Robotic Surgery"]},
    {id:"hinduja-mumbai",name:"P.D. Hinduja Hospital",abbr:"HIN",depts:["Cardiology","Gastroenterology","Nephrology","Oncology","Neurology","ENT"]},
    {id:"breach-candy",name:"Breach Candy Hospital",abbr:"BRC",depts:["General Surgery","Gynaecology","Orthopaedics","Cardiology","Neurology"]}
  ],
  "Bangalore":[
    {id:"manipal-blr",name:"Manipal Hospital",abbr:"MAN",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Transplant","Urology"]},
    {id:"narayana-blr",name:"Narayana Health",abbr:"NAR",depts:["Cardiology","Neurosurgery","Oncology","Paediatrics","Orthopaedics","Nephrology"]},
    {id:"fortis-blr",name:"Fortis Hospital Bangalore",abbr:"FBL",depts:["Cardiology","Orthopaedics","Oncology","Neurology","Gynaecology","Urology"]}
  ],
  "Chennai":[
    {id:"apollo-chennai",name:"Apollo Hospitals Chennai",abbr:"APH",depts:["Cardiology","Neurology","Oncology","Gastroenterology","Transplant","Ophthalmology"]},
    {id:"miot-chennai",name:"MIOT International",abbr:"MIO",depts:["Orthopaedics","Cardiology","Neurology","Spine","Sports Medicine"]},
    {id:"kmch-chennai",name:"Kovai Medical Centre",abbr:"KMC",depts:["Cardiology","Neurology","Oncology","Nephrology","Paediatrics"]}
  ],
  "Hyderabad":[
    {id:"yashoda-hyd",name:"Yashoda Hospital",abbr:"YAS",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Gastroenterology","Nephrology"]},
    {id:"kims-hyd",name:"KIMS Hospital",abbr:"KIM",depts:["Cardiology","Neurology","Transplant","Oncology","Urology","Gynaecology"]},
    {id:"care-hyd",name:"CARE Hospitals",abbr:"CAR",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Emergency Medicine"]}
  ],
  "Kolkata":[
    {id:"amri-kol",name:"AMRI Hospitals",abbr:"AMR",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Gynaecology","Nephrology"]},
    {id:"bellevue-kol",name:"Bellevue Clinic",abbr:"BEL",depts:["General Medicine","Cardiology","Neurology","Orthopaedics","ENT","Ophthalmology"]}
  ],
  "Pune":[
    {id:"ruby-pune",name:"Ruby Hall Clinic",abbr:"RUB",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Gastroenterology"]},
    {id:"jehangir-pune",name:"Jehangir Hospital",abbr:"JEH",depts:["Cardiology","Orthopaedics","Gynaecology","Paediatrics","Neurology"]}
  ],
  "Gurgaon":[
    {id:"medanta-grg",name:"Medanta — The Medicity",abbr:"MDT",depts:["Cardiology","Neurology","Oncology","Transplant","Orthopaedics","Bariatric Surgery","Urology"]},
    {id:"artemis-grg",name:"Artemis Hospital",abbr:"ART",depts:["Cardiology","Neurology","Oncology","Orthopaedics","Nephrology","Gastroenterology"]}
  ]
};

const DEPT_ABBR = {
  "Cardiology":"CAR","Neurology":"NEU","Orthopaedics":"ORT","Oncology":"ONC",
  "Gynaecology":"GYN","ENT":"ENT","Dermatology":"DER","Nephrology":"NEP",
  "General Medicine":"GMD","Paediatrics":"PAD","Psychiatry":"PSY","Ophthalmology":"OPH",
  "Gastroenterology":"GAS","Urology":"URO","Pulmonology":"PUL","Transplant":"TRP",
  "Bariatric Surgery":"BAR","General Surgery":"GSR","Spine":"SPN","Sports Medicine":"SPO",
  "Emergency Medicine":"EMG","Neurosurgery":"NSG","Surgery":"SUR"
};

const TIME_SLOTS = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00","12:30","14:00","14:30","15:00","15:30","16:00","16:30","17:00"];

const DOCTORS = [
  {id:"dr-sharma",name:"Dr. Priya Sharma",spec:"Cardiologist",hospital:"Fortis Hospital, Delhi",emoji:"👩‍⚕️",status:"online",fee:"₹800",rating:"⭐ 4.9 (312 reviews)",available:true},
  {id:"dr-mehta",name:"Dr. Rohan Mehta",spec:"Neurologist",hospital:"Apollo Hospitals, Delhi",emoji:"👨‍⚕️",status:"online",fee:"₹1,000",rating:"⭐ 4.8 (198 reviews)",available:true},
  {id:"dr-iyer",name:"Dr. Kavitha Iyer",spec:"Orthopaedic Surgeon",hospital:"AIIMS Delhi",emoji:"👩‍⚕️",status:"busy",fee:"₹900",rating:"⭐ 4.7 (245 reviews)",available:false},
  {id:"dr-khan",name:"Dr. Imran Khan",spec:"Oncologist",hospital:"Max Super Speciality",emoji:"👨‍⚕️",status:"online",fee:"₹1,200",rating:"⭐ 4.9 (401 reviews)",available:true},
  {id:"dr-reddy",name:"Dr. Supriya Reddy",spec:"Gynaecologist",hospital:"Kokilaben Hospital",emoji:"👩‍⚕️",status:"online",fee:"₹750",rating:"⭐ 4.8 (289 reviews)",available:true},
  {id:"dr-nair",name:"Dr. Anil Nair",spec:"Gastroenterologist",hospital:"P.D. Hinduja Hospital",emoji:"👨‍⚕️",status:"offline",fee:"₹850",rating:"⭐ 4.6 (175 reviews)",available:false}
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
let pendingCancelId   = null;   // used by cancel confirmation modal

// ── HELPERS ───────────────────────────────────────────────────
function getTodayStr() {
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function getHospitalById(id) {
  for(const city in HOSPITALS){ const h=HOSPITALS[city].find(h=>h.id===id); if(h)return h; } return null;
}
function formatDate(str) {
  if(!str)return '—';
  try{ return new Date(str+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}); }
  catch{ return str; }
}
function showToast(msg,type='') {
  const t=document.getElementById('toast');
  t.textContent=msg; t.className='toast visible'+(type?' '+type:'');
  clearTimeout(t._to); t._to=setTimeout(()=>t.classList.remove('visible'),3500);
}
function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById(id).classList.add('active'); window.scrollTo(0,0);
}
function showAuthError(msg){ const el=document.getElementById('auth-error'); el.textContent=msg; el.classList.add('visible'); }
function clearAuthError(){ document.getElementById('auth-error').classList.remove('visible'); }
function fmtSecs(s){ return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; }
function hashPass(p){ return hashPassFn(p); }

// ── BOOT ──────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded',()=>{
  // Pull appointments from cloud first so admin sees all-device data
  syncCloudAppts().then(()=>{
    const uid=DB.getSession();
    if(uid){ const user=DB.getUserById(uid); if(user){ currentUser=user; afterLogin(user); return; } DB.clearSession(); }
    showPage('page-landing');
  });
});

// ── NAVIGATION ────────────────────────────────────────────────
function goHome(){ if(!currentUser){showPage('page-landing');return;} showPage(currentUser.role==='admin'?'page-admin':'page-patient'); }
function goToAuth(role){ currentRole=role; switchRole(role); showPage('page-auth'); }
function navBookAppointment(){
  if(currentUser&&currentUser.role==='patient'){ showPage('page-patient'); setTimeout(showBookingForm,120); }
  else goToAuth('patient');
}
function navGoTo(pageId){
  if(!currentUser){goToAuth('patient');return;}
  showPage(pageId);
  if(pageId==='page-queue')    initQueuePage();
  if(pageId==='page-whatsapp') initWhatsappPage();
  if(pageId==='page-video')    initVideoPage();
}

// ── AUTH ──────────────────────────────────────────────────────
function switchRole(role){
  currentRole=role;
  document.getElementById('tab-patient').classList.toggle('active',role==='patient');
  document.getElementById('tab-admin').classList.toggle('active',role==='admin');
  const rg=document.getElementById('reg-hospital-group');
  if(rg)rg.style.display=role==='admin'?'block':'none';
  // Show/hide admin credential hint
  const hint=document.getElementById('admin-cred-hint');
  if(hint)hint.style.display=role==='admin'?'flex':'none';
  clearAuthError();
}
function switchForm(form){
  document.getElementById('form-login').style.display    =form==='login'?'block':'none';
  document.getElementById('form-register').style.display =form==='register'?'block':'none';
  document.getElementById('auth-heading').textContent    =form==='login'?'Welcome back':'Create account';
  document.getElementById('auth-subhead').textContent    =form==='login'?'Sign in to your account':'Register as '+currentRole;
  clearAuthError();
}

function doLogin(){
  const email=document.getElementById('login-email').value.trim().toLowerCase();
  const pass =document.getElementById('login-password').value;
  if(!email||!pass){showAuthError('Please fill in all fields');return;}
  const user=DB.getUserByEmail(email);
  if(!user){showAuthError('No account found with this email');return;}
  if(user.passwordHash!==hashPass(pass)){showAuthError('Incorrect password');return;}
  if(user.role!==currentRole){showAuthError(`No ${currentRole} account found with these credentials`);return;}
  currentUser=user; DB.setSession(user.uid); afterLogin(user);
}

function doRegister(){
  const fname   =document.getElementById('reg-fname').value.trim();
  const lname   =document.getElementById('reg-lname').value.trim();
  const email   =document.getElementById('reg-email').value.trim().toLowerCase();
  const phone   =document.getElementById('reg-phone').value.trim();
  const pass    =document.getElementById('reg-password').value;
  const hospital=currentRole==='admin'?document.getElementById('reg-hospital').value.trim():'';
  if(!fname||!lname||!email||!phone||!pass){showAuthError('Please fill all required fields');return;}
  if(pass.length<6){showAuthError('Password must be at least 6 characters');return;}
  if(currentRole==='admin'&&!hospital){showAuthError('Please enter hospital name');return;}
  const phoneClean=phone.replace(/\D/g,'');
  if(phoneClean.length<10){showAuthError('Please enter a valid phone number');return;}
  if(DB.getUserByEmail(email)){showAuthError('Email already registered — please sign in');return;}
  const profile={
    uid:DB.newId(), name:fname+' '+lname, email,
    phone:'+91'+phoneClean.slice(-10), role:currentRole,
    hospital:hospital||'', passwordHash:hashPass(pass), createdAt:Date.now()
  };
  DB.saveUser(profile); currentUser=profile; DB.setSession(profile.uid);
  showToast('Account created! Welcome to DiagnoLens 🎉','success');
  afterLogin(profile);
}

function doLogout(){
  stopCall(); DB.clearSession(); currentUser=null; waAlertLog=[];
  updateNavForLogout(); showPage('page-landing'); showToast('Signed out successfully');
}

function afterLogin(user){
  document.getElementById('nav-avatar').textContent=user.name.charAt(0).toUpperCase();
  document.getElementById('nav-name').textContent  =user.name.split(' ')[0];
  document.getElementById('nav-user').classList.add('visible');
  document.getElementById('btn-logout').style.display='block';
  const rt=document.getElementById('nav-role-tag');
  rt.textContent=user.role==='admin'?'Admin':'Patient'; rt.style.display='block';
  const nb=document.getElementById('nav-book-btn');
  if(nb)nb.style.display=user.role==='patient'?'inline-flex':'none';
  // Nav feature links — only for patients
  const nl=document.getElementById('nav-feature-links');
  if(nl)nl.style.display=user.role==='patient'?'flex':'none';
  if(user.role==='admin'){
    document.getElementById('admin-hosp-name').textContent=user.hospital?'— '+user.hospital:'';
    renderAdminDashboard(); showPage('page-admin');
  } else {
    document.getElementById('patient-name').textContent=user.name.split(' ')[0];
    renderPatientAppointments(); showPage('page-patient');
  }
}
function updateNavForLogout(){
  document.getElementById('nav-user').classList.remove('visible');
  document.getElementById('btn-logout').style.display='none';
  document.getElementById('nav-role-tag').style.display='none';
  const nb=document.getElementById('nav-book-btn'); if(nb)nb.style.display='inline-flex';
  const nl=document.getElementById('nav-feature-links'); if(nl)nl.style.display='none';
}

// ── BOOKING FLOW ──────────────────────────────────────────────
function showBookingForm(){
  bookingForm={};
  const cityEl=document.getElementById('sel-city');
  cityEl.innerHTML='<option value="">— Choose a city —</option>';
  Object.keys(HOSPITALS).sort().forEach(c=>cityEl.innerHTML+=`<option value="${c}">${c}</option>`);
  const di=document.getElementById('sel-date'); di.min=getTodayStr(); di.value='';
  document.getElementById('appt-patient-name').value=currentUser?.name||'';
  ['step2','step3','step4'].forEach(id=>document.getElementById(id).style.display='none');
  document.getElementById('step1').style.display='block';
  updateStepIndicator(1);
  document.getElementById('booking-section').style.display='block';
  document.getElementById('booking-section').scrollIntoView({behavior:'smooth',block:'start'});
}
function cancelBookingForm(){ document.getElementById('booking-section').style.display='none'; bookingForm={}; }
function updateStepIndicator(active){
  for(let i=1;i<=4;i++){
    const el=document.getElementById('sn'+i);
    if(i<active){el.className='step-num done';el.textContent='✓';}
    else if(i===active){el.className='step-num active';el.textContent=i;}
    else{el.className='step-num';el.textContent=i;}
    if(el.nextElementSibling)el.nextElementSibling.className=i===active?'step-label active':'step-label';
  }
}
function onCityChange(){
  const city=document.getElementById('sel-city').value;
  bookingForm.city=city; bookingForm.hospital=null; bookingForm.dept=null;
  ['step2','step3','step4'].forEach(id=>document.getElementById(id).style.display='none');
  if(!city)return;
  const el=document.getElementById('sel-hospital');
  el.innerHTML='<option value="">— Choose a hospital —</option>';
  (HOSPITALS[city]||[]).forEach(h=>el.innerHTML+=`<option value="${h.id}">${h.name}</option>`);
  document.getElementById('step2').style.display='block'; updateStepIndicator(2);
}
function onHospitalChange(){
  const hid=document.getElementById('sel-hospital').value;
  const hospital=getHospitalById(hid); bookingForm.hospital=hospital; bookingForm.dept=null;
  ['step3','step4'].forEach(id=>document.getElementById(id).style.display='none');
  if(!hospital)return;
  const el=document.getElementById('sel-dept');
  el.innerHTML='<option value="">— Choose a department —</option>';
  hospital.depts.forEach(d=>el.innerHTML+=`<option value="${d}">${d}</option>`);
  document.getElementById('step3').style.display='block'; updateStepIndicator(3);
}
function onDeptChange(){
  const dept=document.getElementById('sel-dept').value;
  bookingForm.dept=dept; bookingForm.slot=null;
  document.getElementById('step4').style.display='none';
  if(!dept)return;
  document.getElementById('step4').style.display='block';
  document.getElementById('sel-date').value='';
  document.getElementById('slots-grid').innerHTML='';
  updateStepIndicator(4);
}
function onDateChange(){
  const date=document.getElementById('sel-date').value;
  if(date&&date<getTodayStr()){showToast('Please select today or a future date','error');document.getElementById('sel-date').value='';return;}
  bookingForm.date=date; bookingForm.slot=null;
  if(!date||!bookingForm.hospital||!bookingForm.dept)return;
  renderSlots(date,bookingForm.hospital.id,bookingForm.dept);
}
function renderSlots(date,hospitalId,dept){
  const taken=DB.getTakenSlots(hospitalId,dept,date);
  const grid=document.getElementById('slots-grid');
  const isToday=date===getTodayStr();
  const nowMins=isToday?(new Date().getHours()*60+new Date().getMinutes()):-1;
  grid.innerHTML='';
  TIME_SLOTS.forEach(t=>{
    const [h,m]=t.split(':').map(Number);
    const isPastTime=isToday&&(h*60+m)<=nowMins;
    const isTaken=taken.includes(t)||isPastTime;
    const div=document.createElement('div');
    div.className='slot'+(isTaken?' taken':'');
    div.textContent=t;
    if(taken.includes(t)&&!isPastTime)div.title='Already booked';
    if(isPastTime)div.title='Time passed';
    if(!isTaken)div.onclick=()=>selectSlot(t,div);
    grid.appendChild(div);
  });
}
function selectSlot(time,el){
  document.querySelectorAll('.slot').forEach(s=>s.classList.remove('selected'));
  el.classList.add('selected'); bookingForm.slot=time;
}
function confirmBooking(){
  const{city,hospital,dept,date,slot}=bookingForm;
  const patName=document.getElementById('appt-patient-name').value.trim();
  if(!city||!hospital||!dept||!date||!slot){showToast('Please complete all steps','error');return;}
  if(!patName){showToast('Please enter patient name','error');return;}
  if(date<getTodayStr()){showToast('Cannot book a past date','error');return;}
  if(DB.isTaken(hospital.id,dept,date,slot)){showToast('Slot just taken — please choose another','error');renderSlots(date,hospital.id,dept);return;}
  const count=DB.countActive(hospital.id,dept);
  const deptCode=DEPT_ABBR[dept]||dept.substring(0,3).toUpperCase();
  const token=`${hospital.abbr}-${deptCode}-${String(count+1).padStart(3,'0')}`;
  const appt=DB.saveAppt({
    id:DB.newId(), userId:currentUser.uid, patientName:patName,
    patientPhone:currentUser.phone||'', city, hospitalId:hospital.id,
    hospitalName:hospital.name, dept, date, slot, token,
    status:'upcoming', queuePosition:count+1, bookedAt:Date.now()
  });
  showBookingSuccess({token,hospital,dept,date,slot,apptId:appt.id,phone:currentUser.phone||''});
  saveToGoogleSheets(appt);   // ← auto-save to Google Sheets
  triggerMakeWebhook(appt, currentUser); // ← trigger Make.com voice/SMS automation
  cancelBookingForm();
  renderPatientAppointments();
}

// ── QR + BOOKING SUCCESS MODAL ────────────────────────────────
function showBookingSuccess({token,hospital,dept,date,slot,apptId,phone}){
  document.getElementById('modal-token-code').textContent=token;
  document.getElementById('modal-token-details').textContent=`${hospital.name} · ${dept} · ${formatDate(date)} at ${slot}`;
  const qrData=`DiagnoLens Appointment\nToken: ${token}\nHospital: ${hospital.name}\nDept: ${dept}\nDate: ${formatDate(date)}\nTime: ${slot}\nID: ${apptId}`;
  const qrContainer=document.getElementById('qr-container');
  qrContainer.innerHTML='';
  new QRCode(qrContainer,{text:qrData,width:180,height:180,colorDark:'#0d0d14',colorLight:'#ffffff',correctLevel:QRCode.CorrectLevel.H});
  const waBtn=document.getElementById('wa-send-qr-btn');
  if(phone){
    waBtn.style.display='inline-flex';
    waBtn.onclick=()=>openWhatsApp(phone,token,hospital.name,dept,formatDate(date),slot);
  } else waBtn.style.display='none';
  document.getElementById('modal-success').classList.add('visible');
  // Auto-log WhatsApp alert
  if(phone) logWhatsAppNotification(phone,token,hospital.name,dept,formatDate(date),slot,apptId);
}
function closeModal(){ document.getElementById('modal-success').classList.remove('visible'); }

// ── WHATSAPP — WORKING (opens wa.me link) ─────────────────────
function openWhatsApp(phone,token,hospital,dept,date,slot){
  const msg=`🏥 *DiagnoLens Appointment Confirmed!*\n\n*Token:* ${token}\n*Hospital:* ${hospital}\n*Department:* ${dept}\n*Date:* ${date}\n*Time:* ${slot}\n\nPlease show your token QR code at the OPD counter.\n\n_DiagnoLens — Smart Healthcare Booking_`;
  let clean=phone.replace(/\D/g,'');
  if(clean.length===10) clean='91'+clean;
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(msg)}`,'_blank');
  showToast('📱 Opening WhatsApp…','success');
}

function logWhatsAppNotification(phone,token,hospital,dept,date,slot,apptId){
  const msg=`🏥 DiagnoLens: Token ${token} — ${hospital} · ${dept} · ${date} at ${slot}`;
  DB.saveNotification({
    id:DB.newId(), userId:currentUser?.uid||'', phone, msg,
    token, hospital, dept, date, slot, apptId,
    type:'whatsapp_booking', status:'logged', createdAt:Date.now()
  });
  addAlertToLog(phone,msg,token,hospital,dept,date,slot);
}

function addAlertToLog(phone,msg,token,hospital,dept,date,slot){
  waAlertLog.unshift({phone,msg,token,hospital,dept,date,slot,
    time:new Date().toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})});
  refreshAlertLog();
}
function refreshAlertLog(){
  const el=document.getElementById('wa-alert-log'); if(!el)return;
  if(waAlertLog.length===0){
    el.innerHTML='<div class="empty"><div class="empty-icon">💬</div><h4>No alerts yet</h4><p>Alerts are sent automatically when a booking is confirmed</p></div>';
    return;
  }
  el.innerHTML=waAlertLog.map((a,i)=>`
    <div class="alert-item">
      <div class="alert-wa-icon">📱</div>
      <div class="alert-info">
        <div class="alert-phone">${a.phone}</div>
        <div class="alert-msg">${a.msg.replace(/\*/g,'').replace(/\n/g,' ')}</div>
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
function openWhatsAppFromLog(idx){
  const a=waAlertLog[idx]; if(!a)return;
  openWhatsApp(a.phone,a.token||'N/A',a.hospital||'DiagnoLens',a.dept||'',a.date||'',a.slot||'');
}

// ── PATIENT APPOINTMENTS ──────────────────────────────────────
function filterAppts(f,btn){
  currentApptFilter=f;
  document.querySelectorAll('.filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active'); renderPatientAppointments();
}
function renderPatientAppointments(){
  if(!currentUser)return;
  let appts=DB.getApptsByUser(currentUser.uid).sort((a,b)=>b.bookedAt-a.bookedAt);
  const today=getTodayStr();
  if(currentApptFilter==='upcoming') appts=appts.filter(a=>a.date>=today&&a.status==='upcoming');
  if(currentApptFilter==='done')     appts=appts.filter(a=>a.date<today||a.status==='done');
  const container=document.getElementById('patient-appt-list');
  if(appts.length===0){container.innerHTML='<div class="empty"><div class="empty-icon">📋</div><h4>No appointments found</h4><p>Book your first appointment above</p></div>';return;}
  const icons={Cardiology:'❤️',Neurology:'🧠',Orthopaedics:'🦴',Oncology:'🔬',Gynaecology:'🌸',ENT:'👂',Dermatology:'💊',Nephrology:'🫘','General Medicine':'🩺',Paediatrics:'👶',Psychiatry:'🧘',Ophthalmology:'👁️',Gastroenterology:'🔬',Urology:'💉',Pulmonology:'🫁',Transplant:'🏥','Bariatric Surgery':'⚕️'};
  container.innerHTML=appts.map(a=>{
    const isPast=a.date<today;
    const sc=a.status==='cancelled'?'badge-cancelled':(isPast?'badge-done':'badge-upcoming');
    const st=a.status==='cancelled'?'Cancelled':(isPast?'Completed':'Upcoming');
    const canCancel=a.status==='upcoming'&&a.date>=today;
    return `<div class="appt-item">
      <div class="appt-left">
        <div class="appt-icon">${icons[a.dept]||'🏥'}</div>
        <div>
          <div class="appt-name">${a.hospitalName}</div>
          <div class="appt-meta">${a.dept} · ${formatDate(a.date)} at ${a.slot} · ${a.city}</div>
          <div class="appt-meta">Patient: ${a.patientName} · 📞 ${a.patientPhone||'—'}</div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0">
        <div class="token-chip">${a.token}</div>
        <span class="badge ${sc}">${st}</span>
        ${canCancel?`<button onclick="promptCancelAppt('${a.id}','${a.token}','${a.hospitalName}','${a.dept}')"
          style="font-size:11px;color:var(--rose);border:1px solid rgba(225,29,72,.2);background:rgba(225,29,72,.05);padding:4px 11px;border-radius:7px;cursor:pointer;font-family:'DM Sans',sans-serif;font-weight:600">✕ Cancel</button>`:''}
      </div>
    </div>`;
  }).join('');
}

// ── CANCEL APPOINTMENT — WITH CONFIRMATION MODAL ──────────────
function promptCancelAppt(id,token,hospital,dept){
  pendingCancelId=id;
  document.getElementById('cancel-token-display').textContent=token;
  document.getElementById('cancel-details').textContent=`${hospital} · ${dept}`;
  document.getElementById('modal-cancel').classList.add('visible');
}
function confirmCancelAppt(){
  if(!pendingCancelId)return;
  DB.updateAppt(pendingCancelId,{status:'cancelled'});
  showToast('Appointment cancelled','success');
  closeCancelModal();
  renderPatientAppointments();
}
function closeCancelModal(){
  document.getElementById('modal-cancel').classList.remove('visible');
  pendingCancelId=null;
}
// Legacy alias (used in old HTML cancel buttons)
function cancelAppt(id){
  pendingCancelId=id;
  document.getElementById('cancel-token-display').textContent='This appointment';
  document.getElementById('cancel-details').textContent='';
  document.getElementById('modal-cancel').classList.add('visible');
}

// ── LIVE QUEUE TRACKER ────────────────────────────────────────
function initQueuePage(){
  if(!currentUser)return;
  const today=getTodayStr();
  // Show ALL upcoming appointments (including future dates) so user can select
  const appts=DB.getApptsByUser(currentUser.uid).filter(a=>a.status==='upcoming'&&a.date>=today);
  const sel=document.getElementById('queue-appt-select'); if(!sel)return;
  sel.innerHTML='<option value="">— Select your appointment —</option>';
  appts.sort((a,b)=>a.date.localeCompare(b.date)).forEach(a=>{
    const isToday=a.date===today;
    const label=isToday?'🟢 Today':'📅 '+formatDate(a.date);
    sel.innerHTML+=`<option value="${a.hospitalId}|${a.dept}|${a.date}|${a.id}">${label} — ${a.hospitalName} · ${a.dept} at ${a.slot} (${a.token})</option>`;
  });
  const mainEl=document.getElementById('queue-main');
  if(appts.length===0){
    mainEl.innerHTML='<div class="empty"><div class="empty-icon">🎟️</div><h4>No upcoming appointments</h4><p>Book an appointment first to track your queue position</p></div>';
  } else {
    mainEl.innerHTML=`<div class="section-title">Queue Overview</div><div class="queue-list" id="queue-list"><div class="empty"><div class="empty-icon">📊</div><h4>Select an appointment above</h4><p>Your live queue position will appear here</p></div></div>`;
  }
}

function loadQueueForAppt(){
  const sel=document.getElementById('queue-appt-select'); const val=sel?.value; if(!val)return;
  const[hospitalId,dept,date,apptId]=val.split('|');
  const today=getTodayStr();
  const posCard=document.getElementById('queue-position-card');

  // ── FUTURE APPOINTMENT (not today) → show pre-registered banner ──
  if(date > today){
    posCard.style.display='block';
    document.getElementById('queue-pos-number').textContent='✅';
    document.getElementById('queue-pos-label').textContent='Pre-Registered';
    document.getElementById('queue-wait-time').textContent=`Appointment: ${formatDate(date)}`;
    document.getElementById('queue-wait-sublabel').textContent='Live queue tracking activates on your appointment day';
    document.getElementById('queue-progress-fill').style.width='0%';
    document.getElementById('queue-progress-pct').textContent='—';
    const listEl=document.getElementById('queue-list');
    if(listEl) listEl.innerHTML=`<div class="queue-future-banner">
      <div style="font-size:38px;margin-bottom:10px">📅</div>
      <h4 style="font-family:'Syne',sans-serif;font-weight:800;font-size:17px;margin-bottom:6px;color:var(--accent)">Your slot is confirmed!</h4>
      <p style="font-size:14px;color:var(--muted);line-height:1.7">Your appointment is on <strong>${formatDate(date)}</strong>.<br>Come back on that day to see your live queue position.</p>
    </div>`;
    return;
  }

  // ── TODAY'S APPOINTMENT → show live queue ──
  const allAppts=DB.getAppointments()
    .filter(a=>a.hospitalId===hospitalId&&a.dept===dept&&a.date===date&&a.status!=='cancelled')
    .sort((a,b)=>a.queuePosition-b.queuePosition);
  const myEntry=allAppts.find(a=>a.id===apptId);
  const waitingBefore=myEntry?allAppts.filter(a=>a.queuePosition<myEntry.queuePosition).length:0;
  const total=allAppts.length;
  const progress=myEntry&&total>0?Math.max(0,Math.min(100,((total-waitingBefore)/total)*100)):0;

  if(myEntry){
    posCard.style.display='block';
    const isMyTurn=waitingBefore===0;
    document.getElementById('queue-pos-number').textContent =isMyTurn?'🔔':waitingBefore;
    document.getElementById('queue-pos-label').textContent  =isMyTurn?"It's your turn!":'Patients before you';
    document.getElementById('queue-wait-time').textContent  =isMyTurn?'Please go to the OPD counter':`~${waitingBefore*10} min wait`;
    document.getElementById('queue-wait-sublabel').textContent=isMyTurn?'':'Estimated waiting time';
    document.getElementById('queue-progress-fill').style.width=progress+'%';
    document.getElementById('queue-progress-pct').textContent=Math.round(progress)+'%';
    if(isMyTurn) showToast("🔔 It's your turn! Please go to the OPD counter.",'info');
  } else posCard.style.display='none';

  const listEl=document.getElementById('queue-list');
  if(!listEl)return;
  if(allAppts.length===0){listEl.innerHTML='<div class="empty"><div class="empty-icon">✅</div><h4>Queue is empty</h4></div>';return;}
  listEl.innerHTML=allAppts.slice(0,15).map((e,i)=>{
    const isMe=e.id===apptId;
    return `<div class="queue-item ${isMe?'active-patient':''}">
      <div class="queue-pos ${isMe?'current':''}">${i+1}</div>
      <div class="queue-item-info">
        <div class="queue-item-name">${isMe?'<strong>You — </strong>':''}${e.patientName}</div>
        <div class="queue-item-meta">${e.token} · ${e.slot}</div>
      </div>
      <span class="q-badge waiting">${isMe?'You':'Waiting'}</span>
    </div>`;
  }).join('');
}

// ── WHATSAPP ALERTS PAGE ──────────────────────────────────────
function initWhatsappPage(){
  if(!currentUser)return;
  const notis=DB.getNotisByUser(currentUser.uid);
  waAlertLog=notis.map(n=>({
    phone:n.phone, msg:n.msg, token:n.token||'',
    hospital:n.hospital||'', dept:n.dept||'', date:n.date||'', slot:n.slot||'',
    time:new Date(n.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'})
  }));
  refreshAlertLog();
  const ph=document.getElementById('wa-phone-display');
  if(ph)ph.textContent=currentUser?.phone||'Not set';
}
function sendTestWhatsApp(){
  if(!currentUser?.phone){showToast('No phone number on your account','error');return;}
  openWhatsApp(currentUser.phone,'TEST-001','DiagnoLens Test','General Medicine','Today','10:00');
}

// ── VIDEO CALL (WebRTC) ───────────────────────────────────────
function initVideoPage(){ renderDoctorGrid(); }
function renderDoctorGrid(){
  const grid=document.getElementById('doctor-grid'); if(!grid)return;
  grid.innerHTML=DOCTORS.map(d=>`
    <div class="doctor-card" style="${!d.available?'opacity:.65;cursor:not-allowed':''}">
      <div class="doctor-avatar">${d.emoji}</div>
      <div class="doctor-name">${d.name}</div>
      <div class="doctor-spec">${d.spec}</div>
      <div class="doctor-hospital">🏥 ${d.hospital}</div>
      <div class="doc-status"><div class="dot-${d.status}"></div>${d.status==='online'?'Available Now':d.status==='busy'?'In a call':'Offline'}</div>
      <div class="doctor-fee">Consultation: <strong>${d.fee}</strong></div>
      <div class="doctor-rating">${d.rating}</div>
      ${d.available
        ?`<button class="btn-accent" style="width:100%;margin-top:14px;justify-content:center" onclick="startCallFlow('${d.id}')">📹 Start Video Consult</button>`
        :`<button disabled style="width:100%;margin-top:14px;padding:11px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);color:var(--muted);font-size:14px;font-weight:600;cursor:not-allowed">${d.status==='busy'?'⏳ In a Call':'⛔ Offline'}</button>`
      }
    </div>`).join('');
}
function startCallFlow(doctorId){
  const doctor=DOCTORS.find(d=>d.id===doctorId); if(!doctor||!doctor.available)return;
  document.getElementById('waiting-room').style.display='block';
  document.getElementById('waiting-doctor-name').textContent=doctor.name;
  document.getElementById('video-room-wrap').style.display='none';
  document.getElementById('doctor-grid-section').style.display='none';
  setTimeout(()=>beginWebRTCCall(doctor),2000);
}
async function beginWebRTCCall(doctor){
  try{
    localStream=await navigator.mediaDevices.getUserMedia({video:true,audio:true});
    const lv=document.getElementById('localVideo');
    lv.srcObject=localStream; lv.style.display='block';
    try{ await lv.play(); }catch(e){}
    document.getElementById('waiting-room').style.display='none';
    document.getElementById('video-room-wrap').style.display='block';
    document.getElementById('call-name-tag').textContent=doctor.name;
    document.getElementById('call-name-tag').style.display='block';
    document.getElementById('call-timer').style.display='block';
    const rp=document.getElementById('remote-placeholder');
    if(rp)rp.innerHTML=`<div class="video-placeholder"><div class="big-icon">${doctor.emoji}</div><p style="font-size:15px;font-weight:700;color:rgba(255,255,255,.8)">${doctor.name}</p><p style="font-size:12px;margin-top:4px;opacity:.5">Video connected</p></div>`;
    callSeconds=0; clearInterval(callTimer);
    callTimer=setInterval(()=>{ callSeconds++; document.getElementById('call-timer').textContent=fmtSecs(callSeconds); },1000);
    showToast(`🎉 Connected to ${doctor.name}`,'success');
  }catch(e){
    document.getElementById('waiting-room').style.display='none';
    document.getElementById('doctor-grid-section').style.display='block';
    if(e.name==='NotAllowedError'||e.name==='PermissionDeniedError'){
      showToast('❌ Camera/mic permission denied — please allow in browser settings','error');
    } else if(e.name==='NotFoundError'){
      showToast('❌ No camera or microphone found on this device','error');
    } else {
      showToast('❌ Could not start video: '+e.message,'error');
    }
  }
}
function toggleMic(){
  if(!localStream)return;
  const btn=document.getElementById('btn-mic'),track=localStream.getAudioTracks()[0]; if(!track)return;
  track.enabled=!track.enabled; btn.classList.toggle('muted-state',!track.enabled); btn.textContent=track.enabled?'🎤':'🔇';
}
function toggleCam(){
  if(!localStream)return;
  const btn=document.getElementById('btn-cam'),track=localStream.getVideoTracks()[0]; if(!track)return;
  track.enabled=!track.enabled; btn.classList.toggle('muted-state',!track.enabled); btn.textContent=track.enabled?'📷':'🚫';
}
function stopCall(){
  clearInterval(callTimer); callTimer=null;
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null;}
  if(peerConnection){peerConnection.close();peerConnection=null;}
  callSeconds=0;
  ['video-room-wrap','call-timer','call-name-tag','localVideo'].forEach(id=>{
    const el=document.getElementById(id); if(!el)return;
    if(id==='video-room-wrap') el.style.display='none';
    else if(id==='localVideo'){el.srcObject=null;el.style.display='none';}
    else{el.style.display='none';if(id==='call-timer')el.textContent='00:00';}
  });
  const ds=document.getElementById('doctor-grid-section'); if(ds)ds.style.display='block';
  renderDoctorGrid(); showToast('Call ended','info');
}

// ── ADMIN DASHBOARD ───────────────────────────────────────────
function adminTab(tab,btn){
  adminFilter=tab;
  document.querySelectorAll('.admin-tab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');

  const tableWrap    =document.getElementById('admin-table-wrap');
  const voiceSection =document.getElementById('admin-voice-section');
  const waSection    =document.getElementById('admin-wa-section');
  const sheetsSection=document.getElementById('admin-sheets-section');

  // Hide all panels first
  tableWrap.style.display    ='none';
  voiceSection.style.display ='none';
  waSection.style.display    ='none';
  sheetsSection.style.display='none';

  if(tab==='voice'){
    voiceSection.style.display='block';
    renderVoiceMemberTable();
    setTimeout(updateMakeWebhookStatus, 50);
  } else if(tab==='whatsapp'){
    waSection.style.display='block';
    syncCloudAppts().then(()=>{
      renderAdminWaTodayTable();
      populateApptDropdowns();
    });
    setTimeout(updateTwilioBackendStatus, 50);
  } else if(tab==='sheets'){
    sheetsSection.style.display='block';
    renderSheetsRecent();
    setTimeout(updateGasUrlStatus, 50);
  } else {
    tableWrap.style.display='block';
    const titles={appointments:'All Appointments',today:"Today's Appointments",members:'All Registered Members (Permanent List)'};
    document.getElementById('admin-table-title').textContent=titles[tab]||'';
    adminRender();
  }
}

// Render today's patients in the admin WA/SMS broadcast table
function renderAdminWaTodayTable(){
  const today=getTodayStr();
  const appts=DB.getAppointments().filter(a=>a.date===today&&a.status!=='cancelled');
  const tbody=document.getElementById('admin-wa-today-table'); if(!tbody)return;
  if(appts.length===0){
    tbody.innerHTML='<tr><td colspan="8" style="text-align:center;padding:28px;color:var(--muted)">No appointments today</td></tr>';
    return;
  }
  tbody.innerHTML=appts.map(a=>{
    const safeName=(a.patientName||'').replace(/'/g,"\\'");
    return `<tr>
      <td><span class="token-chip" style="font-size:11px">${a.token}</span></td>
      <td style="font-weight:600">${a.patientName}</td>
      <td>${a.patientPhone||'—'}</td>
      <td style="font-size:12px">${a.hospitalName}</td>
      <td>${a.dept}</td>
      <td>${a.slot}</td>
      <td>${a.patientPhone
        ?`<button onclick="adminSendWhatsApp('${a.patientPhone}','${safeName}','${a.token}')"
            style="padding:3px 10px;background:#25d366;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">📲 WA</button>`
        :'—'}</td>
      <td>${a.patientPhone
        ?`<button onclick="adminSendSMS('${a.patientPhone}','${safeName}','${a.token}')"
            style="padding:3px 10px;background:#2563eb;color:#fff;border:none;border-radius:7px;font-size:11px;font-weight:700;cursor:pointer">💬 SMS</button>`
        :'—'}</td>
    </tr>`;
  }).join('');
}

// Render last 10 bookings in the Sheets panel
function renderSheetsRecent(){
  const appts=DB.getAppointments().sort((a,b)=>b.bookedAt-a.bookedAt).slice(0,10);
  const tbody=document.getElementById('sheets-recent-table'); if(!tbody)return;
  if(appts.length===0){
    tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:28px;color:var(--muted)">No bookings yet</td></tr>';
    return;
  }
  tbody.innerHTML=appts.map(a=>`<tr>
    <td><span class="token-chip" style="font-size:11px">${a.token}</span></td>
    <td style="font-weight:600">${a.patientName}</td>
    <td style="font-size:12px">${a.patientPhone||'—'}</td>
    <td style="font-size:12px">${a.hospitalName}</td>
    <td>${formatDate(a.date)}</td>
    <td>${a.slot}</td>
    <td style="font-size:11px;color:var(--muted)">${new Date(a.bookedAt).toLocaleString('en-IN')}</td>
  </tr>`).join('');
}

// WA template messages
function setWaTpl(type){
  const templates={
    booking: '🏥 *DiagnoLens — Slot Confirmed!*\n\nHello {name} 👋\n\nYour OPD appointment has been confirmed.\n*Token:* {token}\n\nPlease show this token at the OPD counter.\n\n_DiagnoLens — Smart Healthcare_',
    reminder:'🔔 *Appointment Reminder*\n\nHello {name}, this is a reminder for your appointment today.\n*Token:* {token}\n\nPlease arrive 10 minutes early.\n\n_DiagnoLens_',
    delay:   '⏳ *Queue Delay Notice*\n\nDear {name}, there is a slight delay in today\'s OPD queue.\nWe apologise for the inconvenience. Please wait for your token {token} to be called.\n\n_DiagnoLens Team_',
    turn:    '🔔 *Your Turn!*\n\nDear {name}, it\'s almost your turn!\nToken: *{token}*\n\nPlease proceed to the OPD counter now.\n\n_DiagnoLens_',
    cancel:  '❌ *Appointment Cancelled*\n\nDear {name}, your appointment (Token: {token}) has been cancelled.\nIf this was an error, please re-book at DiagnoLens.\n\n_DiagnoLens Team_'
  };
  const el=document.getElementById('admin-wa-msg');
  if(el&&templates[type]) el.value=templates[type];
}
function adminDoClearWaForm(){
  ['admin-wa-phone','admin-wa-name','admin-wa-msg'].forEach(id=>{
    const el=document.getElementById(id); if(el)el.value='';
  });
  const sel=document.getElementById('admin-wa-token');
  if(sel){ sel.value=''; sel.dataset.apptId=''; }
}

function renderAdminDashboard(){
  // Pull latest cloud appointments before rendering
  syncCloudAppts().then(()=>{
    const appts=DB.getAppointments(), today=getTodayStr();
    const patients=DB.getUsers().filter(u=>u.role==='patient');
    document.getElementById('stat-total').textContent    =appts.length;
    document.getElementById('stat-today').textContent    =appts.filter(a=>a.date===today).length;
    document.getElementById('stat-upcoming').textContent =appts.filter(a=>a.date>=today&&a.status==='upcoming').length;
    document.getElementById('stat-depts').textContent    =new Set(appts.map(a=>a.dept)).size;
    document.getElementById('stat-members').textContent  =patients.length;
    adminRender();
  });
}

function adminRender(){
  const appts=DB.getAppointments();
  const today=getTodayStr();
  const search=(document.getElementById('admin-search')?.value||'').toLowerCase();

  // ── Members tab ───────────────────────────────────────────
  if(adminFilter==='members'){
    const thead=document.getElementById('admin-table-head');
    thead.innerHTML=`<tr>
      <th>#</th><th>Full Name</th><th>Email</th><th>📞 Phone / WA / SMS</th>
      <th>Registered On</th><th>Bookings</th><th>Last Booking</th><th>Status</th><th>Action</th>
    </tr>`;
    const users=DB.getUsers().filter(u=>u.role==='patient');
    const tbody=document.getElementById('admin-table-body');
    const filtered=users.filter(u=>!search||
      u.name.toLowerCase().includes(search)||
      u.email.toLowerCase().includes(search)||
      (u.phone||'').includes(search));
    if(filtered.length===0){
      tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--muted)">No members registered yet</td></tr>';
      return;
    }
    tbody.innerHTML=filtered.map((u,i)=>{
      const userAppts=appts.filter(a=>a.userId===u.uid);
      const lastAppt=userAppts.sort((a,b)=>b.bookedAt-a.bookedAt)[0];
      const safeName=u.name.replace(/'/g,"\\'").replace(/"/g,'&quot;');
      return `<tr>
        <td style="font-weight:700;color:var(--muted)">${i+1}</td>
        <td><strong>${u.name}</strong></td>
        <td style="font-size:12px">${u.email}</td>
        <td>
          <span style="font-weight:700;color:var(--green)">${u.phone||'—'}</span>
          ${u.phone?`
            <button onclick="adminSendWhatsApp('${u.phone}','${safeName}','')"
              style="margin-left:7px;padding:2px 8px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer">📲 WA</button>
            <button onclick="adminSendSMS('${u.phone}','${safeName}','')"
              style="margin-left:4px;padding:2px 8px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer">💬 SMS</button>`:''}
        </td>
        <td style="font-size:12px">${formatDate(new Date(u.createdAt||Date.now()).toISOString().split('T')[0])}</td>
        <td style="font-weight:700;color:var(--accent)">${userAppts.length}</td>
        <td style="font-size:12px">${lastAppt?`${lastAppt.hospitalName} · ${formatDate(lastAppt.date)}`:'—'}</td>
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

  // ── Appointments / Today tabs ─────────────────────────────
  const thead=document.getElementById('admin-table-head');
  thead.innerHTML=`<tr>
    <th>Token</th><th>Patient</th><th>Phone</th><th>Hospital</th>
    <th>Dept</th><th>Date</th><th>Time</th><th>Status</th><th>Action</th>
  </tr>`;

  let filtered=adminFilter==='today'?appts.filter(a=>a.date===today):[...appts];
  if(search) filtered=filtered.filter(a=>
    (a.token||'').toLowerCase().includes(search)||
    (a.patientName||'').toLowerCase().includes(search)||
    (a.hospitalName||'').toLowerCase().includes(search)||
    (a.patientPhone||'').includes(search));
  filtered.sort((a,b)=>b.bookedAt-a.bookedAt);

  const tbody=document.getElementById('admin-table-body');
  if(filtered.length===0){tbody.innerHTML=`<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--muted)">No appointments found</td></tr>`;return;}
  tbody.innerHTML=filtered.map(a=>{
    const isPast=a.date<today;
    const sc=a.status==='cancelled'?'badge-cancelled':(isPast?'badge-done':'badge-upcoming');
    const st=a.status==='cancelled'?'Cancelled':(isPast?'Completed':'Upcoming');
    return `<tr>
      <td><span class="token-chip" style="font-size:11px">${a.token}</span></td>
      <td style="font-weight:600">${a.patientName}</td>
      <td>${a.patientPhone
        ?`<span>${a.patientPhone}</span>
           <button onclick="adminSendWhatsApp('${a.patientPhone}','${(a.patientName||'').replace(/'/g,"\\'")}','${a.token}')"
             style="margin-left:5px;padding:2px 7px;background:#25d366;color:#fff;border:none;border-radius:5px;font-size:10px;font-weight:700;cursor:pointer">WA</button>`
        :'—'}</td>
      <td style="font-size:12px">${a.hospitalName}</td>
      <td>${a.dept}</td>
      <td>${formatDate(a.date)}</td>
      <td>${a.slot}</td>
      <td><span class="badge ${sc}">${st}</span></td>
      <td>${a.status==='upcoming'&&a.date>=today
        ?`<button onclick="adminCancelAppt('${a.id}')"
            style="font-size:11px;color:var(--rose);border:1px solid rgba(225,29,72,.2);background:rgba(225,29,72,.05);padding:3px 9px;border-radius:6px;cursor:pointer;font-family:'DM Sans',sans-serif">Cancel</button>`
        :'—'}</td>
    </tr>`;
  }).join('');
}

// ── ADMIN DELETE MEMBER ───────────────────────────────────────
// Deletes user permanently — they can re-register as a new user
function adminDeleteMember(uid, name){
  if(!confirm(`Delete member "${name}"?\n\nThis removes their account permanently so they can re-register as a new user.\n\nTheir past appointment records will be kept.`)) return;
  const users=DB.getUsers().filter(u=>u.uid!==uid);
  DB._write('users', users);
  showToast(`✅ ${name} removed — they can now re-register`,'success');
  renderAdminDashboard();
}
function adminCancelAppt(id){
  DB.updateAppt(id,{status:'cancelled'});
  showToast('Appointment cancelled','success');
  renderAdminDashboard();
}

// ── VOICE AGENT — MEMBER TABLE ────────────────────────────────
function renderVoiceMemberTable(){
  const appts=DB.getAppointments();
  const members=DB.getUsers().filter(u=>u.role==='patient');
  const countEl=document.getElementById('voice-member-count');
  if(countEl) countEl.textContent=`${members.length} member${members.length===1?'':'s'}`;
  const tbody=document.getElementById('voice-member-table'); if(!tbody)return;
  if(members.length===0){
    tbody.innerHTML='<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--muted)">No patients have registered yet.</td></tr>';
    return;
  }
  tbody.innerHTML=members.map((u,i)=>{
    const userAppts=appts.filter(a=>a.userId===u.uid);
    const lastAppt=userAppts.sort((a,b)=>b.bookedAt-a.bookedAt)[0];
    const regDate=new Date(u.createdAt||Date.now()).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
    const safeName=u.name.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    return `<tr>
      <td style="font-weight:700;color:var(--muted)">${i+1}</td>
      <td><strong>${u.name}</strong></td>
      <td style="font-size:12px">${u.email}</td>
      <td>
        <strong style="color:var(--green)">${u.phone||'—'}</strong>
        ${u.phone?`
          <button onclick="adminSendWhatsApp('${u.phone}','${safeName}','')"
            style="margin-left:6px;padding:2px 8px;background:#25d366;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;vertical-align:middle">📲 WA</button>
          <button onclick="adminSendSMS('${u.phone}','${safeName}','')"
            style="margin-left:4px;padding:2px 8px;background:#2563eb;color:#fff;border:none;border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;vertical-align:middle">💬 SMS</button>`:''}
      </td>
      <td style="font-size:12px">${regDate}</td>
      <td style="font-weight:700;color:var(--accent);text-align:center">${userAppts.length}</td>
      <td style="font-size:12px">${lastAppt?`${lastAppt.hospitalName}<br><span style="color:var(--muted)">${formatDate(lastAppt.date)}</span>`:'—'}</td>
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

// ── INTEGRATIONS CONFIG ───────────────────────────────────────
// URLs are now stored in localStorage — configurable from the Admin UI
// (no need to edit script.js)

function getGasUrl()         { return localStorage.getItem('dl_gas_url')  || ''; }
function getMakeWebhookUrl() { return localStorage.getItem('dl_make_url') || ''; }
function getTwilioBackend()  { return 'https://diagnolenss-production.up.railway.app'; }

// Legacy constants — kept for backwards compat if set directly in code
const GOOGLE_APPS_SCRIPT_URL = '';   // Use Admin UI → Google Sheets panel instead
const MAKE_WEBHOOK_URL       = '';   // Use Admin UI → Voice Agent panel instead

// ── GAS URL ADMIN UI ──────────────────────────────────────────
function saveGasUrl(){
  const val=(document.getElementById('gas-url-input')?.value||'').trim();
  if(!val){showToast('Please paste your Apps Script URL','error');return;}
  if(!val.startsWith('https://script.google.com')){showToast('URL must be a Google Apps Script URL','error');return;}
  localStorage.setItem('dl_gas_url', val);
  updateGasUrlStatus();
  showToast('✅ Google Sheets URL saved!','success');
}

function testGasUrl(){
  const url=getGasUrl();
  if(!url){showToast('Please save your Apps Script URL first','error');return;}
  // Send a test row
  const testRow={token:'TEST-001',patientName:'DiagnoLens Test',phone:'+910000000000',
    email:'test@diagnolens.com',hospital:'Test Hospital',dept:'General',city:'Delhi',
    date:getTodayStr(),slot:'10:00',bookedAt:new Date().toLocaleString('en-IN')};
  fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(testRow)})
    .then(()=>showToast('🧪 Test row sent to Google Sheets (check your sheet)','success'))
    .catch(e=>showToast('❌ Test failed: '+e.message,'error'));
}

function updateGasUrlStatus(){
  const el=document.getElementById('gas-url-status'); if(!el)return;
  const url=getGasUrl();
  const input=document.getElementById('gas-url-input');
  if(url){
    el.textContent='✅ Configured — auto-saving all new bookings to Google Sheets';
    el.style.color='#1e6b3c';
    if(input)input.value=url;
  } else {
    el.textContent='Not configured — paste your Apps Script URL above to enable auto-save';
    el.style.color='var(--muted)';
  }
}

// ── MAKE WEBHOOK ADMIN UI ─────────────────────────────────────
function saveMakeWebhookUrl(){
  const val=(document.getElementById('make-webhook-input')?.value||'').trim();
  if(!val){showToast('Please paste your webhook URL','error');return;}
  localStorage.setItem('dl_make_url', val);
  updateMakeWebhookStatus();
  showToast('✅ Make.com webhook URL saved!','success');
}

function updateMakeWebhookStatus(){
  const el=document.getElementById('make-webhook-status'); if(!el)return;
  const url=getMakeWebhookUrl();
  const input=document.getElementById('make-webhook-input');
  if(url){
    el.textContent='✅ Configured — webhook fires on every new booking';
    el.style.color='var(--accent2)';
    if(input)input.value=url;
  } else {
    el.textContent='Not configured — paste your webhook URL above';
    el.style.color='var(--muted)';
  }
}

// ── TWILIO BACKEND ADMIN UI ───────────────────────────────────
function saveTwilioBackendUrl(){
  const val=(document.getElementById('twilio-backend-input')?.value||'').trim();
  if(!val){showToast('Please enter your backend URL','error');return;}
  localStorage.setItem('dl_twilio_url', val);
  updateTwilioBackendStatus();
  showToast('✅ Twilio backend URL saved!','success');
}

function updateTwilioBackendStatus(){
  const el=document.getElementById('twilio-backend-status'); if(!el)return;
  const url=getTwilioBackend();
  const input=document.getElementById('twilio-backend-input');
  if(url){
    el.textContent=`✅ Configured — SMS will be sent via Twilio (${url})`;
    el.style.color='var(--accent)';
    if(input)input.value=url;
  } else {
    el.textContent='Not configured — SMS will open native SMS app as fallback';
    el.style.color='var(--muted)';
  }
}

// ── VOICE AGENT WEBHOOK FORM ──────────────────────────────────
async function triggerVoiceAgentWebhook(){
  const phone=(document.getElementById('voice-agent-phone')?.value||'').trim();
  const name =(document.getElementById('voice-agent-name')?.value||'').trim();
  if(!phone){showToast('Please enter a phone number','error');return;}
  const url=getMakeWebhookUrl();
  if(!url){showToast('Please configure your Make.com webhook URL above first','error');return;}
  const payload={
    patientName: name||'Patient',
    phone, token:  (document.getElementById('voice-agent-token')?.value||'').trim(),
    hospital:      (document.getElementById('voice-agent-hospital')?.value||'').trim(),
    date:          (document.getElementById('voice-agent-date')?.value||'').trim(),
    slot:          (document.getElementById('voice-agent-slot')?.value||'').trim(),
    message:       (document.getElementById('voice-agent-message')?.value||'').trim(),
    triggeredAt:   new Date().toLocaleString('en-IN'),
    source:        'DiagnoLens Voice Agent Panel'
  };
  const resultEl=document.getElementById('voice-agent-result');
  if(resultEl){resultEl.style.display='block';resultEl.textContent='⏳ Sending…';resultEl.style.color='var(--muted)';}
  try{
    await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    showToast('⚡ Webhook triggered for '+payload.patientName,'success');
    if(resultEl){resultEl.textContent=`✅ Webhook fired for ${payload.patientName} (${phone}) at ${payload.triggeredAt}`;resultEl.style.color='#1e6b3c';}
  }catch(e){
    showToast('❌ Webhook failed: '+e.message,'error');
    if(resultEl){resultEl.textContent='❌ Failed: '+e.message;resultEl.style.color='var(--rose)';}
  }
}

function clearVoiceAgentForm(){
  ['voice-agent-name','voice-agent-phone','voice-agent-token',
   'voice-agent-hospital','voice-agent-date','voice-agent-slot','voice-agent-message'].forEach(id=>{
    const el=document.getElementById(id); if(el)el.value='';
  });
  const r=document.getElementById('voice-agent-result');
  if(r){r.style.display='none';r.textContent='';}
}

// ── SYNC ALL BOOKINGS TO SHEETS ───────────────────────────────
async function syncAllToSheets(){
  const url=getGasUrl();
  if(!url){showToast('Please configure your Apps Script URL in the Google Sheets panel first','error');return;}
  const appts=DB.getAppointments().sort((a,b)=>b.bookedAt-a.bookedAt).slice(0,50);
  if(appts.length===0){showToast('No bookings to sync','info');return;}
  showToast(`⏳ Syncing ${appts.length} bookings…`,'info');
  let sent=0;
  for(const appt of appts){
    const row={
      token:appt.token,patientName:appt.patientName,phone:appt.patientPhone||'',
      email:'',hospital:appt.hospitalName,dept:appt.dept,city:appt.city||'',
      date:appt.date,slot:appt.slot,bookedAt:new Date(appt.bookedAt).toLocaleString('en-IN')
    };
    try{
      await fetch(url,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify(row)});
      sent++;
      await new Promise(r=>setTimeout(r,300)); // small delay to avoid rate-limits
    }catch(e){console.warn('Sync error for',appt.token,e.message);}
  }
  showToast(`✅ Synced ${sent} bookings to Google Sheets`,'success');
}

// ── GOOGLE SHEETS AUTO-SAVE via Apps Script Webhook ───────────
async function saveToGoogleSheets(appt){
  const url = getGasUrl();
  if(!url){
    console.log('📋 Google Sheets: Configure URL in Admin → Google Sheets panel. Row data:', appt);
    renderSheetsRecent();
    return;
  }
  try{
    const row={
      token:       appt.token,
      patientName: appt.patientName,
      phone:       appt.patientPhone||'',
      email:       currentUser?.email||'',
      hospital:    appt.hospitalName,
      dept:        appt.dept,
      city:        appt.city||'',
      date:        appt.date,
      slot:        appt.slot,
      bookedAt:    new Date(appt.bookedAt).toLocaleString('en-IN')
    };
    await fetch(url, {
      method: 'POST',
      mode:   'no-cors',
      headers:{'Content-Type':'application/json'},
      body:   JSON.stringify(row)
    });
    console.log('✅ Sent to Google Sheets webhook:', appt.token);
    showToast('📊 Saved to Google Sheets ✅','success');
  } catch(e){
    console.warn('⚠️ Google Sheets webhook failed:', e.message);
    showToast('⚠️ Sheets save failed: '+e.message,'error');
  }
  renderSheetsRecent();
}

// ── MAKE.COM WEBHOOK — fires on every new booking ────────────
// In Make.com: Create scenario → Webhooks → Custom webhook → copy URL above
// The webhook receives full appointment JSON — use it to trigger SMS, calls, etc.
async function triggerMakeWebhook(appt, user){
  const url = getMakeWebhookUrl();
  if(!url) return;
  try{
    const payload={
      token:       appt.token,
      patientName: appt.patientName,
      phone:       appt.patientPhone||'',
      email:       user?.email||'',
      hospital:    appt.hospitalName,
      dept:        appt.dept,
      city:        appt.city||'',
      date:        appt.date,
      slot:        appt.slot,
      bookedAt:    new Date(appt.bookedAt).toLocaleString('en-IN'),
      userId:      appt.userId,
      apptId:      appt.id
    };
    await fetch(url,{
      method:'POST', mode:'no-cors',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    console.log('✅ Make.com webhook triggered for:', appt.token);
  } catch(e){
    console.warn('⚠️ Make webhook error:', e.message);
  }
}

// Open the admin WA panel prefilled for a patient (from any table row)
function adminSendWhatsApp(phone, patientName, token){
  const waTabBtn=document.querySelector('.admin-tab[onclick*="whatsapp"]');
  if(waTabBtn) adminTab('whatsapp', waTabBtn);
  setTimeout(()=>{
    populateApptDropdowns();
    const appt = DB.getAppointments().find(a=>
      (token && a.token===token) || (!token && a.patientPhone===phone));
    const sel = document.getElementById('admin-wa-token');
    if(sel && appt){ sel.value=appt.id; sel.dataset.apptId=appt.id; }
    const phoneEl=document.getElementById('admin-wa-phone');
    const nameEl =document.getElementById('admin-wa-name');
    if(phoneEl) phoneEl.value=phone;
    if(nameEl)  nameEl.value=patientName;
    const panel=document.getElementById('admin-wa-panel');
    if(panel) panel.scrollIntoView({behavior:'smooth',block:'start'});
  },200);
}

// ── POPULATE APPOINTMENT DROPDOWNS in SMS/WA panels ──────────
function populateApptDropdowns(){
  const appts = DB.getAppointments().filter(a=>a.status!=='cancelled')
    .sort((a,b)=>b.bookedAt-a.bookedAt);

  function buildOptions(currentVal){
    const placeholder = '<option value="">— Select an appointment —</option>';
    return placeholder + appts.map(a=>{
      const label = `${a.token} — ${a.patientName} — ${a.hospitalName} (${formatDate(a.date)} ${a.slot})`;
      return `<option value="${a.id}" ${currentVal===a.id?'selected':''}>${label}</option>`;
    }).join('');
  }

  const smsEl = document.getElementById('admin-sms-token');
  const waEl  = document.getElementById('admin-wa-token');
  if(smsEl){ const v=smsEl.dataset.apptId||''; smsEl.innerHTML=buildOptions(v); }
  if(waEl){  const v=waEl.dataset.apptId||'';  waEl.innerHTML=buildOptions(v); }
}

// Called when admin selects an appointment in the SMS dropdown
function adminSmsTokenChange(){
  const sel = document.getElementById('admin-sms-token');
  const apptId = sel?.value;
  if(!apptId) return;
  const appt = DB.getAppointments().find(a=>a.id===apptId);
  if(!appt) return;
  const phoneEl = document.getElementById('admin-sms-phone');
  const nameEl  = document.getElementById('admin-sms-name');
  if(phoneEl) phoneEl.value = appt.patientPhone||'';
  if(nameEl)  nameEl.value  = appt.patientName||'';
  sel.dataset.apptId = apptId;
}

// Called when admin selects an appointment in the WA dropdown
function adminWaTokenChange(){
  const sel = document.getElementById('admin-wa-token');
  const apptId = sel?.value;
  if(!apptId) return;
  const appt = DB.getAppointments().find(a=>a.id===apptId);
  if(!appt) return;
  const phoneEl = document.getElementById('admin-wa-phone');
  const nameEl  = document.getElementById('admin-wa-name');
  if(phoneEl) phoneEl.value = appt.patientPhone||'';
  if(nameEl)  nameEl.value  = appt.patientName||'';
  sel.dataset.apptId = apptId;
}

// Open the admin SMS panel prefilled for a patient
function adminSendSMS(phone, patientName, token){
  const waTabBtn=document.querySelector('.admin-tab[onclick*="whatsapp"]');
  if(waTabBtn) adminTab('whatsapp', waTabBtn);
  setTimeout(()=>{
    populateApptDropdowns();
    // Find matching appointment by token or phone and pre-select
    const appt = DB.getAppointments().find(a=>
      (token && a.token===token) || (!token && a.patientPhone===phone));
    const sel = document.getElementById('admin-sms-token');
    if(sel && appt){ sel.value=appt.id; sel.dataset.apptId=appt.id; }
    const phoneEl=document.getElementById('admin-sms-phone');
    const nameEl =document.getElementById('admin-sms-name');
    if(phoneEl) phoneEl.value=phone;
    if(nameEl)  nameEl.value=patientName;
    const panel=document.getElementById('admin-sms-panel');
    if(panel) panel.scrollIntoView({behavior:'smooth',block:'start'});
  },200);
}

// Send SMS — uses Twilio backend if configured, otherwise opens sms: URI
async function adminDoSendSMS(){
  const phone=(document.getElementById('admin-sms-phone')?.value||'').trim();
  const name =(document.getElementById('admin-sms-name')?.value||'').trim();
  // Get the human-readable token from the selected appointment
  const sel  = document.getElementById('admin-sms-token');
  const apptId = sel?.value||'';
  const appt = apptId ? DB.getAppointments().find(a=>a.id===apptId) : null;
  const token = appt ? appt.token : apptId;
  const msg  =(document.getElementById('admin-sms-msg')?.value||'').trim();
  if(!phone){showToast('Please enter a phone number','error');return;}
  if(!msg){showToast('Please enter a message','error');return;}
  const finalMsg=msg
    .replace('{name}',name||'Patient')
    .replace('{token}',token||'N/A')
    .replace('{date}',getTodayStr());
  let clean=phone.replace(/\D/g,'');
  if(clean.length===10) clean='+91'+clean;
  else if(!clean.startsWith('+')) clean='+'+clean;

  const backendUrl=getTwilioBackend();
  if(backendUrl){
    // Send via Twilio backend
    try{
      showToast('⏳ Sending SMS via Twilio…','info');
      const res=await fetch(backendUrl.replace(/\/$/,'')+'/send-sms',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({to:clean,message:finalMsg})
      });
      const data=await res.json();
      if(data.success){
        showToast('✅ SMS sent via Twilio!','success');
      } else {
        showToast('❌ Twilio error: '+(data.error||'Unknown error'),'error');
        console.error('Twilio SMS error:', data);
      }
    } catch(e){
      showToast('❌ Backend unreachable: '+e.message+' — falling back to SMS app','error');
      window.open(`sms:${clean}?body=${encodeURIComponent(finalMsg)}`,'_blank');
    }
  } else {
    // Fallback: open native SMS app (works on mobile)
    window.open(`sms:${clean}?body=${encodeURIComponent(finalMsg)}`,'_blank');
    showToast('📨 Opening SMS app (configure Twilio backend for direct sending)','info');
  }
}
function adminDoClearSmsForm(){
  ['admin-sms-phone','admin-sms-name','admin-sms-msg'].forEach(id=>{
    const el=document.getElementById(id); if(el)el.value='';
  });
  const sel=document.getElementById('admin-sms-token');
  if(sel){ sel.value=''; sel.dataset.apptId=''; }
}
function setSmsTpl(type){
  const templates={
    booking: 'DiagnoLens: Hi {name}, your OPD slot is confirmed. Token: {token}. Show this at the OPD counter.',
    reminder:'DiagnoLens: Reminder — your appointment is today. Token: {token}. Please arrive 10 min early.',
    turn:    'DiagnoLens: {name}, it\'s almost your turn! Token {token} — please proceed to the OPD counter now.',
    cancel:  'DiagnoLens: Your appointment (Token: {token}) has been cancelled. Please re-book if needed.'
  };
  const el=document.getElementById('admin-sms-msg');
  if(el&&templates[type]) el.value=templates[type];
}

// Send WhatsApp from the admin panel form
function adminDoSendWhatsApp(){
  const phone =(document.getElementById('admin-wa-phone')?.value||'').trim();
  const name  =(document.getElementById('admin-wa-name')?.value||'').trim();
  const waSel = document.getElementById('admin-wa-token');
  const waApptId = waSel?.value||'';
  const waAppt = waApptId ? DB.getAppointments().find(a=>a.id===waApptId) : null;
  const token = waAppt ? waAppt.token : waApptId;
  const msg   =(document.getElementById('admin-wa-msg')?.value||'').trim();
  if(!phone){showToast('Please enter a phone number','error');return;}
  if(!msg){showToast('Please enter a message','error');return;}
  const finalMsg=msg
    .replace('{name}',name||'Patient')
    .replace('{token}',token||'N/A')
    .replace('{hospital}','DiagnoLens')
    .replace('{date}',getTodayStr());
  let clean=phone.replace(/\D/g,'');
  if(clean.length===10) clean='91'+clean;
  window.open(`https://wa.me/${clean}?text=${encodeURIComponent(finalMsg)}`,'_blank');
  showToast('📱 Opening WhatsApp…','success');
}

// ── VOICE MEMBER TABLE (delete + WA + SMS) ────────────────────
// NOTE: first definition at ~line 934 is replaced by this authoritative one

// ── EXPOSE GLOBALS ────────────────────────────────────────────
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
window.syncCloudAppts=syncCloudAppts;
// New config functions
window.saveGasUrl=saveGasUrl;
window.testGasUrl=testGasUrl;
window.saveMakeWebhookUrl=saveMakeWebhookUrl;
window.saveTwilioBackendUrl=saveTwilioBackendUrl;
window.triggerVoiceAgentWebhook=triggerVoiceAgentWebhook;
window.clearVoiceAgentForm=clearVoiceAgentForm;
window.syncAllToSheets=syncAllToSheets;
