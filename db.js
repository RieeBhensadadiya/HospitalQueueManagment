// Database management layer using localStorage with cross-tab syncing support

const DB_KEYS = {
  DOCTORS: 'smq_doctors',
  APPOINTMENTS: 'smq_appointments',
  APP_STATE: 'smq_state'
};

const DEFAULT_DOCTORS = [
  { id: 'doc-1', name: 'Dr. Sarah Connor', specialization: 'Cardiology', cabin: 'Room 101', status: 'Available', avgTime: 12 },
  { id: 'doc-2', name: 'Dr. Alex Mercer', specialization: 'Pediatrics', cabin: 'Room 105', status: 'Available', avgTime: 10 },
  { id: 'doc-3', name: 'Dr. Gregory House', specialization: 'Diagnostics', cabin: 'Room 204', status: 'Available', avgTime: 20 },
  { id: 'doc-4', name: 'Dr. Stephen Strange', specialization: 'Neurology', cabin: 'Room 302', status: 'On Break', avgTime: 15 }
];

// Seed initial data if not present
function initializeDatabase() {
  if (!localStorage.getItem(DB_KEYS.DOCTORS)) {
    localStorage.setItem(DB_KEYS.DOCTORS, JSON.stringify(DEFAULT_DOCTORS));
  }
  if (!localStorage.getItem(DB_KEYS.APPOINTMENTS)) {
    localStorage.setItem(DB_KEYS.APPOINTMENTS, JSON.stringify([]));
  }
}

// Get raw data
function getData(key) {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : [];
  } catch (err) {
    console.error(`Error parsing localStorage key "${key}":`, err);
    return [];
  }
}

// Save raw data and trigger custom event for local tab updates
function saveData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
  // Dispatch local event because localStorage storage events only fire in OTHER tabs
  window.dispatchEvent(new Event('storage-update'));
}

// Doctor Operations
export const db = {
  init: initializeDatabase,

  getDoctors() {
    return getData(DB_KEYS.DOCTORS);
  },

  updateDoctorStatus(doctorId, status) {
    const doctors = this.getDoctors();
    const docIndex = doctors.findIndex(d => d.id === doctorId);
    if (docIndex !== -1) {
      doctors[docIndex].status = status;
      saveData(DB_KEYS.DOCTORS, doctors);
    }
  },

  getAppointments() {
    return getData(DB_KEYS.APPOINTMENTS);
  },

  bookAppointment(patientName, phone, email, doctorId) {
    const appointments = this.getAppointments();
    const doctors = this.getDoctors();
    const doctor = doctors.find(d => d.id === doctorId);
    
    if (!doctor) throw new Error('Doctor not found');

    // Generate queue number: sequence of today's appointments for this doctor
    const todayStr = new Date().toDateString();
    const docTodayAppointments = appointments.filter(a => 
      a.doctorId === doctorId && 
      new Date(a.date).toDateString() === todayStr
    );

    const queueNumber = docTodayAppointments.length + 1;
    const appointmentId = 'apt-' + Date.now() + '-' + Math.floor(Math.random() * 1000);

    const newAppointment = {
      id: appointmentId,
      patientName,
      phone,
      email,
      doctorId,
      doctorName: doctor.name,
      specialization: doctor.specialization,
      date: new Date().toISOString(),
      queueNumber,
      status: 'Scheduled', // Scheduled -> CheckedIn -> Serving -> Completed (or Cancelled)
      checkInTime: null,
      servingTime: null,
      completionTime: null
    };

    appointments.push(newAppointment);
    saveData(DB_KEYS.APPOINTMENTS, appointments);
    return newAppointment;
  },

  checkInPatient(appointmentId) {
    const appointments = this.getAppointments();
    const apt = appointments.find(a => a.id === appointmentId);
    if (apt && apt.status === 'Scheduled') {
      apt.status = 'CheckedIn';
      apt.checkInTime = new Date().toISOString();
      saveData(DB_KEYS.APPOINTMENTS, appointments);
      this.triggerNotification(apt, `Checked in! Your queue number is ${apt.queueNumber} for ${apt.doctorName}.`);
    }
  },

  cancelAppointment(appointmentId) {
    const appointments = this.getAppointments();
    const apt = appointments.find(a => a.id === appointmentId);
    if (apt) {
      apt.status = 'Cancelled';
      saveData(DB_KEYS.APPOINTMENTS, appointments);
    }
  },

  callNextPatient(doctorId) {
    const appointments = this.getAppointments();
    
    // 1. Complete the currently serving patient for this doctor (if any)
    appointments.forEach(apt => {
      if (apt.doctorId === doctorId && apt.status === 'Serving') {
        apt.status = 'Completed';
        apt.completionTime = new Date().toISOString();
      }
    });

    // 2. Find the next 'CheckedIn' patient for this doctor, sorted by queue number
    const nextApt = appointments
      .filter(apt => apt.doctorId === doctorId && apt.status === 'CheckedIn')
      .sort((a, b) => a.queueNumber - b.queueNumber)[0];

    if (nextApt) {
      nextApt.status = 'Serving';
      nextApt.servingTime = new Date().toISOString();
      saveData(DB_KEYS.APPOINTMENTS, appointments);
      this.triggerNotification(nextApt, `It is your turn! Please proceed to ${nextApt.doctorName}'s cabin (${DEFAULT_DOCTORS.find(d => d.id === doctorId).cabin}).`);
      return nextApt;
    }

    saveData(DB_KEYS.APPOINTMENTS, appointments);
    return null;
  },

  completeCurrentPatient(doctorId) {
    const appointments = this.getAppointments();
    const activeApt = appointments.find(apt => apt.doctorId === doctorId && apt.status === 'Serving');
    if (activeApt) {
      activeApt.status = 'Completed';
      activeApt.completionTime = new Date().toISOString();
      saveData(DB_KEYS.APPOINTMENTS, appointments);
      return activeApt;
    }
    return null;
  },

  // Calculates wait time in minutes
  calculateWaitTime(appointmentId) {
    const appointments = this.getAppointments();
    const apt = appointments.find(a => a.id === appointmentId);
    if (!apt) return 0;
    if (apt.status === 'Serving') return 0;
    if (apt.status === 'Completed' || apt.status === 'Cancelled') return 0;

    const doctors = this.getDoctors();
    const doctor = doctors.find(d => d.id === apt.doctorId);
    if (!doctor) return 0;

    // If doctor is offline or on break, calculate basic queue wait time + a break buffer
    let breakBuffer = doctor.status === 'On Break' ? 15 : 0;

    // Find all patients in the queue for this doctor who are either "Serving" or "CheckedIn" and have a lower queue number
    const activeQueue = appointments
      .filter(a => a.doctorId === apt.doctorId && (a.status === 'Serving' || a.status === 'CheckedIn'))
      .sort((a, b) => a.queueNumber - b.queueNumber);

    const targetIndex = activeQueue.findIndex(a => a.id === appointmentId);
    if (targetIndex === -1) {
      // If not checked in yet, calculate based on overall waiting queue length
      const waitingCount = appointments.filter(a => a.doctorId === apt.doctorId && a.status === 'CheckedIn').length;
      return (waitingCount + 1) * doctor.avgTime + breakBuffer;
    }

    // Wait time = (number of checked-in people ahead of us + 1 if someone is currently serving) * avgTime
    let peopleAhead = 0;
    for (let i = 0; i < targetIndex; i++) {
      if (activeQueue[i].status === 'CheckedIn' || activeQueue[i].status === 'Serving') {
        peopleAhead++;
      }
    }

    return (peopleAhead * doctor.avgTime) + breakBuffer;
  },

  // Returns live position in checked-in queue (1-based, e.g., "1st in line")
  getQueuePosition(appointmentId) {
    const appointments = this.getAppointments();
    const apt = appointments.find(a => a.id === appointmentId);
    if (!apt || apt.status !== 'CheckedIn') return null;

    const activeQueue = appointments
      .filter(a => a.doctorId === apt.doctorId && (a.status === 'Serving' || a.status === 'CheckedIn'))
      .sort((a, b) => a.queueNumber - b.queueNumber);

    const index = activeQueue.findIndex(a => a.id === appointmentId);
    if (index === -1) return null;

    // Count how many "CheckedIn" are ahead of us (ignoring "Serving" or counting them separately)
    // Position 1 means next up.
    let position = 1;
    for (let i = 0; i < index; i++) {
      if (activeQueue[i].status === 'CheckedIn') {
        position++;
      }
    }
    return position;
  },

  // Helper to trigger SMS notification logging
  triggerNotification(appointment, message) {
    const notificationLog = JSON.parse(localStorage.getItem('smq_sms_logs')) || [];
    notificationLog.unshift({
      id: 'sms-' + Date.now(),
      phone: appointment.phone,
      patientName: appointment.patientName,
      message,
      timestamp: new Date().toISOString()
    });
    localStorage.setItem('smq_sms_logs', JSON.stringify(notificationLog));
    window.dispatchEvent(new Event('sms-sent'));
  }
};
