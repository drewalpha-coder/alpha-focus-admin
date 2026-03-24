// =============================================
// FILL IN THESE VALUES
// =============================================
const SUPABASE_URL = 'https://bzzykkemlpaqeaqvlakt.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6enlra2VtbHBhcWVhcXZsYWt0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDI4OTE2MCwiZXhwIjoyMDg5ODY1MTYwfQ.eCwCw5qO7coQmDp0hZtcWM6q6j2rVL5s-4XLMRz8t4I';
const ADMIN_PASSWORD = 'alphafocus2024';  // <-- CHANGE THIS to your own password

// =============================================
// SUPABASE CLIENT (service role — full access)
// =============================================

class AdminSupabase {
  constructor(url, key) {
    this.url = url;
    this.key = key;
    this.authToken = null;
  }

  headers() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Prefer': 'return=representation',
    };
  }

  async query(table, params = '') {
    const r = await fetch(`${this.url}/rest/v1/${table}?${params}`, { headers: this.headers() });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async insert(table, data) {
    const r = await fetch(`${this.url}/rest/v1/${table}`, {
      method: 'POST', headers: this.headers(), body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async update(table, match, data) {
    const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join('&');
    const r = await fetch(`${this.url}/rest/v1/${table}?${params}`, {
      method: 'PATCH', headers: this.headers(), body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  }

  async delete(table, match) {
    const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join('&');
    const r = await fetch(`${this.url}/rest/v1/${table}?${params}`, {
      method: 'DELETE', headers: this.headers(),
    });
    if (!r.ok) throw new Error(await r.text());
    return r;
  }

  async signOut() {
    localStorage.removeItem('admin_authed');
    window.location.reload();
  }
}

const db = new AdminSupabase(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// =============================================
// STATE
// =============================================

let state = {
  students: [],
  groups: [],
  globalSites: [],
  selectedStudent: null,
  selectedGroup: null,
};

// =============================================
// AUTH
// =============================================

async function initAuth() {
  // Check if already logged in
  if (localStorage.getItem('admin_authed') === 'true') {
    showApp();
    return;
  }
  showLogin();
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showLoginError(msg) {
  showLogin();
  const el = document.getElementById('login-error');
  el.style.display = 'block';
  el.textContent = msg;
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  loadAll();
}

// =============================================
// NAVIGATION
// =============================================

document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const section = link.dataset.section;

    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    link.classList.add('active');

    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(`section-${section}`).classList.add('active');

    // Reload data for the section
    if (section === 'students') loadStudents();
    if (section === 'groups') loadGroups();
    if (section === 'global-sites') loadGlobalSites();
    if (section === 'requests') loadRequests();
    if (section === 'activity') loadActivity();
  });
});

// =============================================
// DATA LOADING
// =============================================

async function loadAll() {
  await Promise.all([loadStudents(), loadGroups(), loadGlobalSites()]);
}

async function loadStudents() {
  try {
    state.students = await db.query('students', 'order=display_name.asc.nullsfirst');
    state.groups = await db.query('groups', 'order=name.asc');
    renderStudents();
  } catch (err) {
    console.error('Failed to load students:', err);
  }
}

async function loadGroups() {
  try {
    state.groups = await db.query('groups', 'order=name.asc');
    state.students = await db.query('students', 'order=display_name.asc.nullsfirst');
    renderGroups();
  } catch (err) {
    console.error('Failed to load groups:', err);
  }
}

async function loadGlobalSites() {
  try {
    state.globalSites = await db.query('allowed_sites', 'is_global=eq.true&order=domain.asc');
    renderGlobalSites();
  } catch (err) {
    console.error('Failed to load global sites:', err);
  }
}

async function loadActivity(filters = {}) {
  try {
    let params = 'select=*,students(display_name,email)&order=attempted_at.desc&limit=200';
    if (filters.studentId) params += `&student_id=eq.${filters.studentId}`;
    if (filters.dateFrom) params += `&attempted_at=gte.${filters.dateFrom}T00:00:00`;
    if (filters.dateTo) params += `&attempted_at=lte.${filters.dateTo}T23:59:59`;
    if (filters.tamperOnly) params += `&url_attempted=eq.CLOCK_TAMPER_DETECTED`;

    const attempts = await db.query('blocked_attempts', params);
    renderActivity(attempts);
  } catch (err) {
    console.error('Failed to load activity:', err);
  }
}

// =============================================
// RENDER: STUDENTS
// =============================================

function renderStudents() {
  const tbody = document.getElementById('students-tbody');
  const groupMap = Object.fromEntries(state.groups.map(g => [g.id, g.name]));

  tbody.innerHTML = state.students.map(s => `
    <tr data-id="${s.id}">
      <td>${esc(s.display_name || 'Unknown')}</td>
      <td>${esc(s.email || '')}</td>
      <td>${s.group_id ? `<span class="status-badge active">${esc(groupMap[s.group_id] || '')}</span>` : '<span class="status-badge no-group">None</span>'}</td>
      <td>${s.is_blocked ? '<span class="status-badge blocked">Blocked</span>' : '<span class="status-badge active">Active</span>'}</td>
    </tr>
  `).join('');

  tbody.querySelectorAll('tr').forEach(tr => {
    tr.addEventListener('click', () => openStudentDetail(tr.dataset.id));
  });

  // Hide detail when returning to list
  document.getElementById('students-list-panel').style.display = '';
  document.getElementById('student-detail').style.display = 'none';

  // Populate activity filter
  const sel = document.getElementById('activity-student-filter');
  sel.innerHTML = '<option value="">All students</option>' +
    state.students.map(s => `<option value="${s.id}">${esc(s.display_name || s.email || 'Unknown')}</option>`).join('');
}

async function openStudentDetail(studentId) {
  const student = state.students.find(s => s.id === studentId);
  if (!student) return;
  state.selectedStudent = student;

  document.getElementById('students-list-panel').style.display = 'none';
  document.getElementById('student-detail').style.display = '';

  document.getElementById('detail-student-name').textContent = student.display_name || 'Unknown';
  document.getElementById('detail-student-email').textContent = student.email || '';

  // Check for clock tamper events in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const tamperBadge = document.getElementById('detail-student-tamper-badge');
  try {
    const tamperEvents = await db.query('blocked_attempts',
      `student_id=eq.${studentId}&url_attempted=eq.CLOCK_TAMPER_DETECTED&attempted_at=gte.${sevenDaysAgo}&limit=1`
    );
    tamperBadge.style.display = tamperEvents.length > 0 ? 'inline-block' : 'none';
  } catch (e) {
    tamperBadge.style.display = 'none';
  }

  // Blocked toggle
  const toggle = document.getElementById('student-blocked-toggle');
  toggle.checked = student.is_blocked;
  toggle.onchange = async () => {
    await db.update('students', { id: student.id }, { is_blocked: toggle.checked });
    student.is_blocked = toggle.checked;
  };

  // Load allowed sites for this student
  const allSites = await db.query('allowed_sites',
    `or=(is_global.eq.true,student_id.eq.${studentId}${student.group_id ? `,group_id.eq.${student.group_id}` : ''})&order=domain.asc`
  );

  const siteList = document.getElementById('detail-sites-list');
  siteList.innerHTML = allSites.map(s => {
    const source = s.is_global ? 'global' : s.group_id ? 'group' : 'personal';
    const canRemove = source === 'personal';
    return `<span class="site-tag ${source}">
      ${esc(s.label || s.domain)}
      <span class="source">(${source})</span>
      ${canRemove ? `<button class="remove-btn" data-site-id="${s.id}">&times;</button>` : ''}
    </span>`;
  }).join('');

  siteList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.delete('allowed_sites', { id: btn.dataset.siteId });
      openStudentDetail(studentId);
    });
  });

  // Load blocked attempts
  const attempts = await db.query('blocked_attempts',
    `student_id=eq.${studentId}&order=attempted_at.desc&limit=20`
  );
  const atBody = document.getElementById('detail-blocked-tbody');
  atBody.innerHTML = attempts.map(a => `
    <tr>
      <td style="word-break:break-all;max-width:300px">${esc(a.url_attempted)}</td>
      <td>${formatTime(a.attempted_at)}</td>
    </tr>
  `).join('') || '<tr><td colspan="2" style="color:var(--text-muted)">No blocked attempts</td></tr>';
}

// =============================================
// RENDER: GROUPS
// =============================================

function renderGroups() {
  const container = document.getElementById('groups-list');
  const studentCounts = {};
  for (const s of state.students) {
    if (s.group_id) studentCounts[s.group_id] = (studentCounts[s.group_id] || 0) + 1;
  }

  container.innerHTML = state.groups.map(g => `
    <div class="group-card" data-id="${g.id}">
      <h3>${esc(g.name)}</h3>
      <div class="count">${studentCounts[g.id] || 0} students</div>
    </div>
  `).join('') || '<p style="color:var(--text-muted)">No groups yet.</p>';

  container.querySelectorAll('.group-card').forEach(card => {
    card.addEventListener('click', () => openGroupDetail(card.dataset.id));
  });

  document.getElementById('groups-list-panel').style.display = '';
  document.getElementById('group-detail').style.display = 'none';
}

async function openGroupDetail(groupId) {
  const group = state.groups.find(g => g.id === groupId);
  if (!group) return;
  state.selectedGroup = group;

  document.getElementById('groups-list-panel').style.display = 'none';
  document.getElementById('group-detail').style.display = '';
  document.getElementById('detail-group-name').textContent = group.name;

  // Members
  const members = state.students.filter(s => s.group_id === groupId);
  const memberList = document.getElementById('group-members');
  memberList.innerHTML = members.map(m => `
    <span class="member-tag">
      ${esc(m.display_name || m.email || 'Unknown')}
      <button class="remove-btn" data-student-id="${m.id}">&times;</button>
    </span>
  `).join('') || '<span style="color:var(--text-muted)">No members</span>';

  memberList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.update('students', { id: btn.dataset.studentId }, { group_id: null });
      await loadGroups();
      openGroupDetail(groupId);
    });
  });

  // Add member dropdown (students not in this group)
  const sel = document.getElementById('add-member-select');
  const available = state.students.filter(s => s.group_id !== groupId);
  sel.innerHTML = '<option value="">Add student...</option>' +
    available.map(s => `<option value="${s.id}">${esc(s.display_name || s.email || 'Unknown')}</option>`).join('');

  // Group sites
  const sites = await db.query('allowed_sites', `group_id=eq.${groupId}&order=domain.asc`);
  const siteList = document.getElementById('group-sites-list');
  siteList.innerHTML = sites.map(s => `
    <span class="site-tag group">
      ${esc(s.label || s.domain)}
      <button class="remove-btn" data-site-id="${s.id}">&times;</button>
    </span>
  `).join('') || '<span style="color:var(--text-muted)">No group sites</span>';

  siteList.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.delete('allowed_sites', { id: btn.dataset.siteId });
      openGroupDetail(groupId);
    });
  });
}

// =============================================
// RENDER: GLOBAL SITES
// =============================================

async function renderGlobalSites() {
  const tbody = document.getElementById('global-sites-tbody');

  // For auto-detected sites, count how many students have that domain
  const autoDetectedDomains = state.globalSites.filter(s => s.added_by === 'auto-detected');

  // Get per-student auto-detected counts for each domain
  const domainStudentCounts = {};
  if (state.globalSites.length > 0) {
    try {
      const allAutoSites = await db.query('allowed_sites', 'added_by=eq.auto-detected&select=domain,student_id');
      for (const s of allAutoSites) {
        if (!domainStudentCounts[s.domain]) domainStudentCounts[s.domain] = new Set();
        if (s.student_id) domainStudentCounts[s.domain].add(s.student_id);
      }
    } catch (e) { /* ignore */ }
  }

  tbody.innerHTML = state.globalSites.map(s => `
    <tr>
      <td><strong>${esc(s.domain)}</strong></td>
      <td>${esc(s.label || '—')}</td>
      <td>${s.added_by === 'auto-detected' ? '<span class="status-badge" style="background:#fef3c7;color:#92400e">Auto</span>' : '<span class="status-badge active">Manual</span>'}</td>
      <td>${domainStudentCounts[s.domain] ? domainStudentCounts[s.domain].size : '—'}</td>
      <td><button class="btn btn-danger btn-sm" data-site-id="${s.id}">Remove</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="color:var(--text-muted)">No global sites</td></tr>';

  tbody.querySelectorAll('.btn-danger').forEach(btn => {
    btn.addEventListener('click', async () => {
      await db.delete('allowed_sites', { id: btn.dataset.siteId });
      await loadGlobalSites();
    });
  });
}

// =============================================
// RENDER: ACTIVITY LOG
// =============================================

function renderActivity(attempts) {
  const tbody = document.getElementById('activity-tbody');

  // Count repeats per student+domain
  const repeatMap = {};
  for (const a of attempts) {
    const isTamper = a.url_attempted === 'CLOCK_TAMPER_DETECTED';
    let domain;
    if (isTamper) {
      domain = 'CLOCK_TAMPER_DETECTED';
    } else {
      try { domain = new URL(a.url_attempted).hostname; } catch { domain = a.url_attempted; }
    }
    const key = `${a.student_id}::${domain}`;
    repeatMap[key] = (repeatMap[key] || 0) + 1;
  }

  tbody.innerHTML = attempts.map(a => {
    const isTamper = a.url_attempted === 'CLOCK_TAMPER_DETECTED';
    let domain;
    if (isTamper) {
      domain = 'CLOCK_TAMPER_DETECTED';
    } else {
      try { domain = new URL(a.url_attempted).hostname; } catch { domain = a.url_attempted; }
    }
    const key = `${a.student_id}::${domain}`;
    const count = repeatMap[key];
    const isHighRepeat = !isTamper && count >= 3;
    const studentName = a.students ? (a.students.display_name || a.students.email || 'Unknown') : 'Unknown';

    const rowClass = isTamper ? 'tamper-row' : (isHighRepeat ? 'repeat-high' : '');
    const urlDisplay = isTamper
      ? '<span class="tamper-label">Clock change detected</span>'
      : esc(a.url_attempted);

    return `<tr class="${rowClass}">
      <td>${esc(studentName)}</td>
      <td style="word-break:break-all;max-width:400px">${urlDisplay}</td>
      <td>${formatTime(a.attempted_at)}</td>
      <td>${isHighRepeat ? `<span class="repeat-count">${count}x</span>` : (isTamper ? '' : count)}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="4" style="color:var(--text-muted)">No blocked attempts</td></tr>';
}

// =============================================
// EVENT HANDLERS
// =============================================

// Login
document.getElementById('login-btn').addEventListener('click', () => {
  const pwd = document.getElementById('login-password').value;
  if (pwd === ADMIN_PASSWORD) {
    localStorage.setItem('admin_authed', 'true');
    showApp();
  } else {
    showLoginError('Incorrect password.');
  }
});
document.getElementById('logout-btn').addEventListener('click', () => db.signOut());

// Student back button
document.getElementById('student-back-btn').addEventListener('click', () => {
  document.getElementById('students-list-panel').style.display = '';
  document.getElementById('student-detail').style.display = 'none';
});

// Add personal site
document.getElementById('add-personal-site-btn').addEventListener('click', async () => {
  const input = document.getElementById('add-personal-site');
  const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain || !state.selectedStudent) return;

  await db.insert('allowed_sites', {
    domain,
    student_id: state.selectedStudent.id,
    is_global: false,
    added_by: 'admin',
  });
  input.value = '';
  openStudentDetail(state.selectedStudent.id);
});

// Create group
document.getElementById('create-group-btn').addEventListener('click', async () => {
  const input = document.getElementById('new-group-name');
  const name = input.value.trim();
  if (!name) return;

  await db.insert('groups', { name });
  input.value = '';
  await loadGroups();
});

// Group back button
document.getElementById('group-back-btn').addEventListener('click', () => {
  document.getElementById('groups-list-panel').style.display = '';
  document.getElementById('group-detail').style.display = 'none';
});

// Add member to group
document.getElementById('add-member-btn').addEventListener('click', async () => {
  const sel = document.getElementById('add-member-select');
  const studentId = sel.value;
  if (!studentId || !state.selectedGroup) return;

  await db.update('students', { id: studentId }, { group_id: state.selectedGroup.id });
  await loadGroups();
  openGroupDetail(state.selectedGroup.id);
});

// Add group site
document.getElementById('add-group-site-btn').addEventListener('click', async () => {
  const input = document.getElementById('add-group-site');
  const domain = input.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain || !state.selectedGroup) return;

  await db.insert('allowed_sites', {
    domain,
    group_id: state.selectedGroup.id,
    is_global: false,
    added_by: 'admin',
  });
  input.value = '';
  openGroupDetail(state.selectedGroup.id);
});

// Add global site
document.getElementById('add-global-btn').addEventListener('click', async () => {
  const domainInput = document.getElementById('new-global-domain');
  const labelInput = document.getElementById('new-global-label');
  const domain = domainInput.value.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!domain) return;

  await db.insert('allowed_sites', {
    domain,
    label: labelInput.value.trim() || null,
    is_global: true,
    added_by: 'admin',
  });
  domainInput.value = '';
  labelInput.value = '';
  await loadGlobalSites();
});

// Activity filter
document.getElementById('activity-filter-btn').addEventListener('click', () => {
  loadActivity({
    studentId: document.getElementById('activity-student-filter').value || undefined,
    dateFrom: document.getElementById('activity-date-from').value || undefined,
    dateTo: document.getElementById('activity-date-to').value || undefined,
    tamperOnly: document.getElementById('activity-tamper-only').checked || undefined,
  });
});

// =============================================
// SITE REQUESTS
// =============================================

async function loadRequests(filter = 'pending') {
  try {
    let params = 'select=*,students(display_name,email)&order=created_at.desc&limit=100';
    if (filter && filter !== 'all') {
      params += `&status=eq.${filter}`;
    }
    const requests = await db.query('site_requests', params);
    renderRequests(requests);
  } catch (err) {
    console.error('Failed to load requests:', err);
  }
}

function renderRequests(requests) {
  const tbody = document.getElementById('requests-tbody');
  const empty = document.getElementById('requests-empty');
  const table = document.getElementById('requests-table');

  if (requests.length === 0) {
    empty.style.display = 'block';
    table.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  table.style.display = '';

  tbody.innerHTML = requests.map(r => {
    const studentName = r.students ? (r.students.display_name || r.students.email || 'Unknown') : 'Unknown';
    const statusClass = r.status === 'pending' ? 'request-pending' : r.status === 'approved' ? 'request-approved' : 'request-denied';

    let actions = '';
    if (r.status === 'pending') {
      actions = `
        <button class="btn btn-primary btn-sm approve-btn" data-id="${r.id}" data-domain="${esc(r.domain)}" data-student="${r.student_id}">Approve</button>
        <button class="btn btn-danger btn-sm deny-btn" data-id="${r.id}">Deny</button>
      `;
    } else if (r.status === 'approved') {
      actions = '<span class="status-badge active">Approved</span>';
    } else {
      actions = '<span class="status-badge blocked">Denied</span>';
    }

    return `<tr class="${statusClass}">
      <td>${esc(studentName)}</td>
      <td><strong>${esc(r.domain)}</strong></td>
      <td style="word-break:break-all;max-width:300px;font-size:12px;color:var(--text-muted)">${esc(r.url_requested)}</td>
      <td>${formatTime(r.created_at)}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');

  // Approve buttons
  tbody.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const domain = btn.dataset.domain;
      const studentId = btn.dataset.student;

      btn.disabled = true;
      btn.textContent = '...';

      // Add domain to student's allowed sites
      await db.insert('allowed_sites', {
        domain,
        student_id: studentId,
        is_global: false,
        added_by: 'admin',
      });

      // Update request status
      await db.update('site_requests', { id }, { status: 'approved' });

      loadRequests(document.getElementById('requests-filter').value);
    });
  });

  // Deny buttons
  tbody.querySelectorAll('.deny-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      btn.disabled = true;
      btn.textContent = '...';

      await db.update('site_requests', { id }, { status: 'denied' });
      loadRequests(document.getElementById('requests-filter').value);
    });
  });
}

// Requests filter
document.getElementById('requests-filter-btn').addEventListener('click', () => {
  loadRequests(document.getElementById('requests-filter').value);
});

// =============================================
// HELPERS
// =============================================

function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// =============================================
// INIT
// =============================================

initAuth();
