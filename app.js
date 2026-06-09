import { db } from './db.js';

// Active state values for the current tab
let activeSession = null; // { role: 'patient'|'receptionist'|'doctor', name: string, id?: string }
let currentRole = 'login'; // 'login' | 'patient' | 'receptionist' | 'doctor'
let loginSelectedRole = 'patient'; // Active tab on the login screen
let selectedDoctorIdForBooking = null;
let lastTicketStatus = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  db.init();
  setupLoginTabs();
  setupLoginForm();
  setupRoleSwitcher();
  setupLogoutButton();
  setupThemeToggle();
  setupBookingForm();
  setupReceptionistForm();
  setupDoctorControls();
  
  // Real-time synchronization listeners
  window.addEventListener('storage', handleDatabaseUpdate);
  window.addEventListener('storage-update', handleDatabaseUpdate);
  window.addEventListener('sms-sent', renderSMSLogs);

  // Restore saved session if any
  const savedSession = localStorage.getItem('smq_session');
  if (savedSession) {
    try {
      activeSession = JSON.parse(savedSession);
      if (activeSession && activeSession.role) {
        currentRole = activeSession.role;
        // If doctor was logged in, make sure their doctor ID is active
        if (activeSession.role === 'doctor' && activeSession.id) {
          localStorage.setItem('smq_active_doctor_id', activeSession.id);
        }
      } else {
        localStorage.removeItem('smq_session');
        currentRole = 'login';
      }
    } catch (err) {
      console.error('Corrupted session data. Clearing and defaulting to login:', err);
      localStorage.removeItem('smq_session');
      activeSession = null;
      currentRole = 'login';
    }
  } else {
    activeSession = null;
    currentRole = 'login';
  }

  // Initial render
  renderCurrentView();
  renderSMSLogs();
  
  // Initialize Lucide Icons
  if (window.lucide) {
    window.lucide.createIcons();
  }
});

// Theme Toggle Logic
function setupThemeToggle() {
  const themeBtn = document.getElementById('theme-toggle');
  const sunIcon = themeBtn.querySelector('.sun-icon');
  const moonIcon = themeBtn.querySelector('.moon-icon');
  
  // Apply saved theme
  const savedTheme = localStorage.getItem('smq_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    sunIcon.style.display = 'block';
    moonIcon.style.display = 'none';
  }

  themeBtn.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    const isLight = document.body.classList.contains('light-mode');
    localStorage.setItem('smq_theme', isLight ? 'light' : 'dark');
    
    if (isLight) {
      sunIcon.style.display = 'block';
      moonIcon.style.display = 'none';
    } else {
      sunIcon.style.display = 'none';
      moonIcon.style.display = 'block';
    }
  });
}

/* ---------------------------------------------------- */
/* LOGIN SCREEN LOGIC                                   */
/* ---------------------------------------------------- */

function setupLoginTabs() {
  const tabs = ['patient', 'receptionist', 'doctor'];
  tabs.forEach(role => {
    const tabBtn = document.getElementById(`login-tab-${role}`);
    tabBtn.addEventListener('click', () => {
      // Toggle button highlights
      tabs.forEach(r => {
        document.getElementById(`login-tab-${r}`).classList.remove('active');
        document.getElementById(`login-fields-${r}`).style.display = 'none';
      });
      tabBtn.classList.add('active');
      document.getElementById(`login-fields-${role}`).style.display = 'block';
      loginSelectedRole = role;
    });
  });
}

function setupLoginForm() {
  const form = document.getElementById('login-form-submit');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    if (loginSelectedRole === 'patient') {
      const name = document.getElementById('login-p-name').value.trim();
      const phone = document.getElementById('login-p-phone').value.trim();
      
      if (!name || !phone) {
        alert('Please enter your full name and phone number to sign in.');
        return;
      }
      
      // Patient Session (Simple local register)
      activeSession = { role: 'patient', name: name };
      localStorage.setItem('smq_session', JSON.stringify(activeSession));
      currentRole = 'patient';
      
      // Autofill booking details if empty
      document.getElementById('p-name').value = name;
      document.getElementById('p-phone').value = phone;
      
      renderCurrentView();
      alert(`Welcome, ${name}! Logged in to your patient dashboard.`);
      
    } else if (loginSelectedRole === 'receptionist') {
      const pass = document.getElementById('login-r-pass').value;
      if (pass !== 'admin123') {
        alert('Invalid passcode. (For testing, enter "admin123")');
        return;
      }
      
      activeSession = { role: 'receptionist', name: 'Receptionist Desk' };
      localStorage.setItem('smq_session', JSON.stringify(activeSession));
      currentRole = 'receptionist';
      
      renderCurrentView();
      alert('Access Granted. Receptionist Dashboard loaded.');
      
    } else if (loginSelectedRole === 'doctor') {
      const docSelect = document.getElementById('login-d-select');
      const docId = docSelect.value;
      const pass = document.getElementById('login-d-pass').value;
      
      if (!docId) {
        alert('Please select a doctor profile.');
        return;
      }
      if (pass !== 'doc123') {
        alert('Invalid passcode. (For testing, enter "doc123")');
        return;
      }
      
      const docName = docSelect.options[docSelect.selectedIndex].text;
      
      activeSession = { role: 'doctor', name: docName, id: docId };
      localStorage.setItem('smq_session', JSON.stringify(activeSession));
      localStorage.setItem('smq_active_doctor_id', docId);
      currentRole = 'doctor';
      
      renderCurrentView();
      alert(`Welcome, ${docName}! Doctor Terminal loaded with full access.`);
    }
  });
}

function setupLogoutButton() {
  const btn = document.getElementById('header-logout-btn');
  btn.addEventListener('click', () => {
    localStorage.removeItem('smq_session');
    activeSession = null;
    currentRole = 'login';
    
    // Clear forms on logout
    document.getElementById('login-p-name').value = '';
    document.getElementById('login-p-phone').value = '';
    document.getElementById('login-r-pass').value = '';
    document.getElementById('login-d-pass').value = '';
    
    renderCurrentView();
  });
}

/* ---------------------------------------------------- */
/* ROLE NAVIGATION SWITCHER (DOCTOR ONLY / ALL ACCESS)  */
/* ---------------------------------------------------- */

function setupRoleSwitcher() {
  const roleButtons = document.querySelectorAll('#header-role-switcher .role-btn');
  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Only doctors or administrators have access to switch active dashboards
      if (!activeSession || activeSession.role !== 'doctor') {
        alert('Access denied. Only doctor profiles are authorized to switch view portals.');
        return;
      }
      
      roleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      currentRole = btn.getAttribute('data-role');
      
      // Hide all views and show target view
      document.querySelectorAll('.dashboard-view').forEach(view => {
        view.classList.remove('active');
      });
      document.getElementById(`${currentRole}-dashboard`).classList.add('active');
      
      renderCurrentView();
    });
  });
}

// Global update handler (e.g. cross-tab queue call)
function handleDatabaseUpdate() {
  renderCurrentView();
}

// Render active view dashboard
function renderCurrentView() {
  const loginScreen = document.getElementById('login-screen');
  const patientDashboard = document.getElementById('patient-dashboard');
  const receptionistDashboard = document.getElementById('receptionist-dashboard');
  const doctorDashboard = document.getElementById('doctor-dashboard');
  const switcher = document.getElementById('header-role-switcher');
  const profileContainer = document.getElementById('header-user-profile');
  const headerName = document.getElementById('header-user-name');

  // Hide all sections initially
  loginScreen.classList.remove('active');
  patientDashboard.classList.remove('active');
  receptionistDashboard.classList.remove('active');
  doctorDashboard.classList.remove('active');
  
  if (currentRole === 'login') {
    loginScreen.classList.add('active');
    switcher.style.display = 'none';
    profileContainer.style.display = 'none';
    
    // Populate doctors select list on login form
    const loginDocSelect = document.getElementById('login-d-select');
    loginDocSelect.innerHTML = '<option value="">-- Choose Doctor Profile --</option>';
    db.getDoctors().forEach(doc => {
      loginDocSelect.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization})</option>`;
    });
    
  } else {
    // Show layout panel corresponding to the current active role selection
    document.getElementById(`${currentRole}-dashboard`).classList.add('active');
    profileContainer.style.display = 'flex';
    headerName.textContent = `${activeSession.name} (${activeSession.role.toUpperCase()})`;
    
    // Doctor gets "ALL ACCESS" role switcher buttons in header
    if (activeSession.role === 'doctor') {
      switcher.style.display = 'flex';
      
      // Highlight the active dashboard button in the switcher
      const roleButtons = document.querySelectorAll('#header-role-switcher .role-btn');
      roleButtons.forEach(btn => {
        if (btn.getAttribute('data-role') === currentRole) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    } else {
      switcher.style.display = 'none';
    }

    // Call sub-view renders
    if (currentRole === 'patient') {
      renderPatientView();
    } else if (currentRole === 'receptionist') {
      renderReceptionistView();
    } else if (currentRole === 'doctor') {
      renderDoctorView();
    }
  }
  
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

/* ---------------------------------------------------- */
/* 1. PATIENT DASHBOARD LOGIC                           */
/* ---------------------------------------------------- */

function renderPatientView() {
  const doctors = db.getDoctors();
  const docListContainer = document.getElementById('patient-doctor-list');
  docListContainer.innerHTML = '';

  // Render Doctor Selection Cards
  doctors.forEach(doc => {
    const isSelected = selectedDoctorIdForBooking === doc.id;
    const card = document.createElement('div');
    card.className = `doc-selection-card ${isSelected ? 'selected' : ''}`;
    
    // Status text and dot
    let statusClass = 'status-online';
    if (doc.status === 'On Break') statusClass = 'status-break';
    else if (doc.status === 'Offline') statusClass = 'status-offline';

    card.innerHTML = `
      <div style="font-weight: 700; font-size: 1.05rem;">${doc.name}</div>
      <div class="muted-text" style="font-size: 0.82rem;">${doc.specialization}</div>
      <div class="muted-text" style="font-size: 0.8rem; margin-top: 0.25rem;">
        <i data-lucide="map-pin" style="width: 12px; height: 12px; display: inline; vertical-align: middle;"></i> ${doc.cabin}
      </div>
      <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
        <span class="muted-text" style="font-size: 0.75rem;">Avg Wait: ${doc.avgTime}m</span>
        <span style="font-size: 0.75rem; font-weight: 600; display: inline-flex; align-items: center;">
          <span class="status-indicator ${statusClass}"></span> ${doc.status}
        </span>
      </div>
    `;
    
    card.addEventListener('click', () => {
      selectedDoctorIdForBooking = doc.id;
      renderPatientView();
    });
    docListContainer.appendChild(card);
  });

  // Render Ticket Panel
  const savedAptId = localStorage.getItem('smq_active_appointment_id');
  const noTicketView = document.getElementById('no-ticket-view');
  const activeTicketView = document.getElementById('active-ticket-view');

  if (!savedAptId) {
    noTicketView.style.display = 'block';
    activeTicketView.style.display = 'none';
    lastTicketStatus = null;
  } else {
    const appointments = db.getAppointments();
    const apt = appointments.find(a => a.id === savedAptId);

    if (!apt) {
      // Clean stale ticket reference
      localStorage.removeItem('smq_active_appointment_id');
      noTicketView.style.display = 'block';
      activeTicketView.style.display = 'none';
      lastTicketStatus = null;
      return;
    }

    noTicketView.style.display = 'none';
    activeTicketView.style.display = 'flex';

    // Update details
    document.getElementById('ticket-num').textContent = `#${apt.queueNumber}`;
    document.getElementById('ticket-patient-name').textContent = apt.patientName;
    document.getElementById('ticket-doc-info').textContent = `${apt.doctorName} (${apt.specialization})`;
    
    // Status badge styling
    const badge = document.getElementById('ticket-status-badge');
    badge.className = `badge badge-${apt.status.toLowerCase()}`;
    badge.textContent = apt.status === 'CheckedIn' ? 'Checked In' : apt.status;

    // Glowing ring pulse animation switch
    const ring = document.getElementById('ticket-ring');
    if (apt.status === 'Serving') {
      ring.classList.add('serving');
    } else {
      ring.classList.remove('serving');
    }

    // Dynamic Wait times & Ahead count
    const waitTime = db.calculateWaitTime(apt.id);
    const ahead = db.getQueuePosition(apt.id);

    document.getElementById('ticket-wait-time').textContent = apt.status === 'Serving' ? '0 min' : `${waitTime} min`;
    document.getElementById('ticket-people-ahead').textContent = apt.status === 'Serving' ? '0' : (ahead !== null ? (ahead - 1) : '--');

    // Progress bar estimation logic
    const bar = document.getElementById('ticket-progress-bar');
    if (apt.status === 'Scheduled') {
      bar.style.width = '15%';
    } else if (apt.status === 'CheckedIn') {
      const pos = ahead || 1;
      const progress = Math.max(20, Math.min(90, 100 - (pos * 15)));
      bar.style.width = `${progress}%`;
    } else if (apt.status === 'Serving') {
      bar.style.width = '100%';
    } else {
      bar.style.width = '0%';
    }

    // Generate simulated QR Code vector
    const qrContainer = document.getElementById('ticket-qr-code');
    qrContainer.innerHTML = generateMockQRCode(apt.id);

    // Play alert sound if status changed to 'Serving' in real-time
    if (lastTicketStatus && lastTicketStatus !== 'Serving' && apt.status === 'Serving') {
      playChime();
      alert(`🛎️ It is your turn! Please proceed to ${apt.doctorName}'s cabin (${apt.cabin || 'Room'}).`);
    }
    lastTicketStatus = apt.status;
  }
}

function setupBookingForm() {
  const form = document.getElementById('booking-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!selectedDoctorIdForBooking) {
      alert('Please select a doctor by clicking on their card profile.');
      return;
    }

    const name = document.getElementById('p-name').value;
    const phone = document.getElementById('p-phone').value;
    const email = document.getElementById('p-email').value;

    try {
      const apt = db.bookAppointment(name, phone, email, selectedDoctorIdForBooking);
      localStorage.setItem('smq_active_appointment_id', apt.id);
      
      // Reset form (keep name and phone fields populated)
      selectedDoctorIdForBooking = null;
      
      renderPatientView();
      alert(`Success! Appointment booked. Your ticket token is #${apt.queueNumber}. Please show your QR ticket code to reception to check-in.`);
    } catch (err) {
      alert(err.message);
    }
  });

  const cancelBtn = document.getElementById('cancel-booking-btn');
  cancelBtn.addEventListener('click', () => {
    const savedAptId = localStorage.getItem('smq_active_appointment_id');
    if (savedAptId && confirm('Are you sure you want to cancel this appointment queue ticket?')) {
      db.cancelAppointment(savedAptId);
      localStorage.removeItem('smq_active_appointment_id');
      renderPatientView();
    }
  });
}

/* ---------------------------------------------------- */
/* 2. RECEPTIONIST DASHBOARD LOGIC                      */
/* ---------------------------------------------------- */

function renderReceptionistView() {
  const appointments = db.getAppointments();
  const doctors = db.getDoctors();
  const todayStr = new Date().toDateString();
  
  const todayApts = appointments.filter(a => new Date(a.date).toDateString() === todayStr);

  // Update counters
  const total = todayApts.length;
  const queued = todayApts.filter(a => a.status === 'CheckedIn' || a.status === 'Serving').length;
  const completed = todayApts.filter(a => a.status === 'Completed').length;

  document.getElementById('rec-total-count').textContent = total;
  document.getElementById('rec-queue-count').textContent = queued;
  document.getElementById('rec-done-count').textContent = completed;

  // Render Check-In Select Dropdown (Only "Scheduled" appointments)
  const select = document.getElementById('rec-checkin-select');
  select.innerHTML = '<option value="">-- Choose Patient Appointment --</option>';
  todayApts.filter(a => a.status === 'Scheduled').forEach(a => {
    select.innerHTML += `<option value="${a.id}">${a.patientName} (Token #${a.queueNumber} - ${a.doctorName})</option>`;
  });

  // Populate doctor select for walk-ins
  const walkinDocSelect = document.getElementById('walkin-doctor-select');
  walkinDocSelect.innerHTML = '<option value="">-- Assign Doctor --</option>';
  doctors.forEach(doc => {
    walkinDocSelect.innerHTML += `<option value="${doc.id}">${doc.name} (${doc.specialization} - ${doc.status})</option>`;
  });

  // Render Queue Monitor Table
  const tableBody = document.getElementById('receptionist-queue-table').querySelector('tbody');
  tableBody.innerHTML = '';

  // Sort queue showing active ones first
  const sortedApts = [...todayApts].sort((a, b) => {
    const statusWeight = { 'Serving': 0, 'CheckedIn': 1, 'Scheduled': 2, 'Completed': 3, 'Cancelled': 4 };
    return statusWeight[a.status] - statusWeight[b.status] || a.queueNumber - b.queueNumber;
  });

  if (sortedApts.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;" class="muted-text">No active appointments scheduled today.</td></tr>';
    return;
  }

  sortedApts.forEach(apt => {
    const tr = document.createElement('tr');
    
    // Status class selection
    const badgeClass = `badge badge-${apt.status.toLowerCase()}`;
    const badgeText = apt.status === 'CheckedIn' ? 'Checked In' : apt.status;

    let actionBtnHtml = '';
    if (apt.status === 'Scheduled') {
      actionBtnHtml = `
        <button class="btn btn-sm btn-primary rec-checkin-btn" data-id="${apt.id}">Check In</button>
        <button class="btn btn-sm btn-danger rec-cancel-btn" data-id="${apt.id}">Cancel</button>
      `;
    } else if (apt.status === 'CheckedIn') {
      actionBtnHtml = `<button class="btn btn-sm btn-danger rec-cancel-btn" data-id="${apt.id}">Cancel</button>`;
    } else {
      actionBtnHtml = `<span class="muted-text" style="font-size: 0.8rem;">No actions</span>`;
    }

    tr.innerHTML = `
      <td style="font-weight: 700;">#${apt.queueNumber}</td>
      <td>
        <div style="font-weight: 600;">${apt.patientName}</div>
        <div class="muted-text" style="font-size: 0.78rem;">${apt.phone}</div>
      </td>
      <td>
        <div style="font-weight: 500;">${apt.doctorName}</div>
        <div class="muted-text" style="font-size: 0.78rem;">${apt.specialization}</div>
      </td>
      <td><span class="${badgeClass}">${badgeText}</span></td>
      <td><div style="display: flex; gap: 0.5rem;">${actionBtnHtml}</div></td>
    `;

    tableBody.appendChild(tr);
  });

  // Bind Actions in list
  tableBody.querySelectorAll('.rec-checkin-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      db.checkInPatient(id);
      renderReceptionistView();
    });
  });

  tableBody.querySelectorAll('.rec-cancel-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm('Cancel this queue appointment?')) {
        db.cancelAppointment(id);
        renderReceptionistView();
      }
    });
  });
}

function setupReceptionistForm() {
  const form = document.getElementById('receptionist-checkin-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const selectVal = document.getElementById('rec-checkin-select').value;
    const walkinName = document.getElementById('walkin-name').value;
    const walkinPhone = document.getElementById('walkin-phone').value;
    const walkinDoctorId = document.getElementById('walkin-doctor-select').value;

    if (selectVal) {
      db.checkInPatient(selectVal);
      form.reset();
      renderReceptionistView();
      alert('Patient checked-in successfully.');
    } else if (walkinName && walkinPhone && walkinDoctorId) {
      try {
        const walkinApt = db.bookAppointment(walkinName, walkinPhone, 'walkin@hospital.local', walkinDoctorId);
        db.checkInPatient(walkinApt.id);
        form.reset();
        renderReceptionistView();
        alert(`Registered and checked in! Token Ticket is #${walkinApt.queueNumber}.`);
      } catch (err) {
        alert(err.message);
      }
    } else {
      alert('Please select an online booking OR input all walk-in details (Name, Phone, Doctor).');
    }
  });
}

/* ---------------------------------------------------- */
/* 3. DOCTOR DASHBOARD LOGIC                            */
/* ---------------------------------------------------- */

function renderDoctorView() {
  const doctors = db.getDoctors();
  const select = document.getElementById('doctor-select');
  
  let currentDocId = localStorage.getItem('smq_active_doctor_id');
  if (!currentDocId || !doctors.some(d => d.id === currentDocId)) {
    currentDocId = doctors[0].id;
    localStorage.setItem('smq_active_doctor_id', currentDocId);
  }

  // Populate doctor dropdown selectors inside the terminal
  select.innerHTML = '';
  doctors.forEach(doc => {
    const option = document.createElement('option');
    option.value = doc.id;
    option.textContent = `${doc.name} (${doc.specialization})`;
    if (doc.id === currentDocId) option.selected = true;
    select.appendChild(option);
  });

  const activeDoc = doctors.find(d => d.id === currentDocId);
  if (!activeDoc) return;

  // Toggle Doctor status buttons
  const availBtn = document.getElementById('btn-status-available');
  const breakBtn = document.getElementById('btn-status-break');

  if (activeDoc.status === 'Available') {
    availBtn.className = 'btn btn-sm btn-primary';
    breakBtn.className = 'btn btn-sm btn-secondary';
  } else {
    availBtn.className = 'btn btn-sm btn-secondary';
    breakBtn.className = 'btn btn-sm btn-primary';
  }

  // Get active serving patient and waiting patient lists
  const appointments = db.getAppointments();
  const todayStr = new Date().toDateString();
  const docTodayApts = appointments.filter(a => a.doctorId === currentDocId && new Date(a.date).toDateString() === todayStr);

  const activeServing = docTodayApts.find(a => a.status === 'Serving');
  const waitingQueue = docTodayApts
    .filter(a => a.status === 'CheckedIn')
    .sort((a, b) => a.queueNumber - b.queueNumber);

  // Render active serving cabin panel
  const servingNum = document.getElementById('doctor-serving-num');
  const servingName = document.getElementById('doctor-serving-name');
  const servingTime = document.getElementById('doctor-serving-time');
  const completeBtn = document.getElementById('doctor-btn-complete');
  const nextBtn = document.getElementById('doctor-btn-next');

  if (activeServing) {
    servingNum.textContent = `#${activeServing.queueNumber}`;
    servingName.textContent = activeServing.patientName;
    
    const startTime = new Date(activeServing.servingTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    servingTime.textContent = `Consultation started at ${startTime}`;
    
    completeBtn.disabled = false;
    nextBtn.innerHTML = '<i data-lucide="volume-2"></i> Call Next Patient';
  } else {
    servingNum.textContent = '--';
    servingName.textContent = 'No active patient';
    servingTime.textContent = 'Queue is waiting for call';
    completeBtn.disabled = true;
  }

  nextBtn.disabled = waitingQueue.length === 0 && !activeServing;

  // Render Waiting table
  const tableBody = document.getElementById('doctor-waitlist-table').querySelector('tbody');
  tableBody.innerHTML = '';

  if (waitingQueue.length === 0) {
    tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center;" class="muted-text">No patients waiting in cabin queue.</td></tr>';
    return;
  }

  waitingQueue.forEach((apt, idx) => {
    const tr = document.createElement('tr');
    
    const checkinLocalTime = apt.checkInTime 
      ? new Date(apt.checkInTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '--';
      
    const isFirst = idx === 0;
    const callBtnHtml = `
      <button class="btn btn-sm ${isFirst ? 'btn-primary' : 'btn-secondary'} doc-call-patient-btn" data-id="${apt.id}">
        <i data-lucide="megaphone" style="width: 12px; height: 12px; display: inline;"></i> ${isFirst ? 'Call Now' : 'Prioritize Call'}
      </button>
    `;

    tr.innerHTML = `
      <td style="font-weight: 700;">#${apt.queueNumber}</td>
      <td style="font-weight: 600;">${apt.patientName}</td>
      <td>${checkinLocalTime}</td>
      <td>${callBtnHtml}</td>
    `;

    tableBody.appendChild(tr);
  });

  // Action listeners inside table
  tableBody.querySelectorAll('.doc-call-patient-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = btn.getAttribute('data-id');
      const apts = db.getAppointments();
      const apt = apts.find(a => a.id === id);
      if (apt) {
        db.callNextPatient(apt.doctorId);
        const updatedApts = db.getAppointments();
        updatedApts.forEach(a => {
          if (a.doctorId === apt.doctorId && a.status === 'Serving') {
            a.status = 'Completed';
            a.completionTime = new Date().toISOString();
          }
        });
        const match = updatedApts.find(a => a.id === id);
        if (match) {
          match.status = 'Serving';
          match.servingTime = new Date().toISOString();
        }
        localStorage.setItem('smq_appointments', JSON.stringify(updatedApts));
        db.triggerNotification(apt, `Priority Call! Please proceed to ${apt.doctorName}'s cabin (${activeDoc.cabin}).`);
        window.dispatchEvent(new Event('storage-update'));
      }
    });
  });
}

function setupDoctorControls() {
  const select = document.getElementById('doctor-select');
  select.addEventListener('change', (e) => {
    localStorage.setItem('smq_active_doctor_id', e.target.value);
    
    // If the logged in Doctor switches the doctor profile inside Doctor View, update session profile name
    if (activeSession && activeSession.role === 'doctor') {
      const doctors = db.getDoctors();
      const selectedDoc = doctors.find(d => d.id === e.target.value);
      if (selectedDoc) {
        activeSession.name = selectedDoc.name;
        activeSession.id = selectedDoc.id;
        localStorage.setItem('smq_session', JSON.stringify(activeSession));
        
        const headerName = document.getElementById('header-user-name');
        headerName.textContent = `${activeSession.name} (${activeSession.role.toUpperCase()})`;
      }
    }
    
    renderDoctorView();
  });

  const availBtn = document.getElementById('btn-status-available');
  availBtn.addEventListener('click', () => {
    const docId = localStorage.getItem('smq_active_doctor_id');
    db.updateDoctorStatus(docId, 'Available');
    renderDoctorView();
  });

  const breakBtn = document.getElementById('btn-status-break');
  breakBtn.addEventListener('click', () => {
    const docId = localStorage.getItem('smq_active_doctor_id');
    db.updateDoctorStatus(docId, 'On Break');
    renderDoctorView();
  });

  const completeBtn = document.getElementById('doctor-btn-complete');
  completeBtn.addEventListener('click', () => {
    const docId = localStorage.getItem('smq_active_doctor_id');
    db.completeCurrentPatient(docId);
    renderDoctorView();
  });

  const nextBtn = document.getElementById('doctor-btn-next');
  nextBtn.addEventListener('click', () => {
    const docId = localStorage.getItem('smq_active_doctor_id');
    const called = db.callNextPatient(docId);
    if (!called) {
      alert('There are no Checked-In patients waiting for you in the queue.');
    }
    renderDoctorView();
  });
}

/* ---------------------------------------------------- */
/* 4. SMS NOTIFICATION PANEL LOGGING                    */
/* ---------------------------------------------------- */

function renderSMSLogs() {
  const container = document.getElementById('sms-log-container');
  const badgeCount = document.getElementById('sms-badge-count');
  
  const logs = JSON.parse(localStorage.getItem('smq_sms_logs')) || [];
  badgeCount.textContent = `${logs.length} Sent`;

  if (logs.length === 0) {
    container.innerHTML = '<div class="muted-text" style="text-align: center; padding: 1.5rem 0;">No notification updates sent yet. Check in a patient or call them.</div>';
    return;
  }

  container.innerHTML = '';
  logs.forEach(log => {
    const div = document.createElement('div');
    div.className = 'sms-item';
    
    const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    
    div.innerHTML = `
      <div class="sms-header">
        <strong style="color: var(--accent-hover);">${log.patientName} (${log.phone})</strong>
        <span class="muted-text">${time}</span>
      </div>
      <div class="sms-body">${log.message}</div>
    `;
    container.appendChild(div);
  });
}

/* ---------------------------------------------------- */
/* HELPER: GENERATE MOCK VECTOR QR CODE                 */
/* ---------------------------------------------------- */

function generateMockQRCode(data) {
  let cells = "";
  const size = 17;
  
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const isAnchor1 = (r < 5 && c < 5);
      const isAnchor2 = (r < 5 && c >= size - 5);
      const isAnchor3 = (r >= size - 5 && c < 5);
      
      let fill = false;
      if (isAnchor1 || isAnchor2 || isAnchor3) {
        const relativeR = r < 5 ? r : (r >= size - 5 ? r - (size - 5) : r);
        const relativeC = c < 5 ? c : (c >= size - 5 ? c - (size - 5) : c);
        fill = (relativeR === 0 || relativeR === 4 || relativeC === 0 || relativeC === 4 || (relativeR >= 2 && relativeR <= 2 && relativeC >= 2 && relativeC <= 2));
      } else {
        let hash = 0;
        const str = data + r + c;
        for (let i = 0; i < str.length; i++) {
          hash = (hash << 5) - hash + str.charCodeAt(i);
          hash |= 0;
        }
        fill = (Math.abs(hash) % 2 === 0);
      }
      
      if (fill) {
        cells += `<rect x="${c}" y="${r}" width="1" height="1" fill="#0f172a" />`;
      }
    }
  }
  return `<svg viewBox="0 0 ${size} ${size}" class="qr-code-svg" style="width:100%; height:100%;">${cells}</svg>`;
}

/* ---------------------------------------------------- */
/* CLINICAL CHIME WEB AUDIO SYNTHESIZER                 */
/* ---------------------------------------------------- */

function playChime() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;
    
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.12, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.6);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.00, now + 0.15);
    gain2.gain.setValueAtTime(0, now + 0.15);
    gain2.gain.linearRampToValueAtTime(0.12, now + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.8);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.15);
    osc2.stop(now + 0.8);
  } catch (err) {
    console.error('Failed to play clinic chime synthesizer:', err);
  }
}
