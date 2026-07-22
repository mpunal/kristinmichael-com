/* kristinmichael.com — guest travel board */

const API = '/api/travel';
const REMIND_API = '/api/remind';
const KEY_STORAGE = 'guestKey';

let guestKey = localStorage.getItem(KEY_STORAGE) || '';
let editingId = null;

const gateEl      = document.getElementById('gate');
const gateForm    = document.getElementById('gate-form');
const gateInput   = document.getElementById('gate-password');
const gateError   = document.getElementById('gate-error');
const appEl       = document.getElementById('app');
const postForm    = document.getElementById('post-form');
const formTitle   = document.getElementById('form-title');
const formError   = document.getElementById('form-error');
const submitBtn   = document.getElementById('submit-btn');
const cancelBtn   = document.getElementById('cancel-edit');
const countLabel  = document.getElementById('count-label');
const pinLabel    = document.getElementById('pin-label');
const pinHint     = document.getElementById('pin-hint');
const postsEl     = document.getElementById('posts');
const postsEmpty  = document.getElementById('posts-empty');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Format 'YYYY-MM-DD' without new Date() — UTC parsing would shift the day.
function formatDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
  if (!m) return str || '';
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}`;
}

// Format a 24-hour 'HH:MM' time (from <input type="time">) as '9:00 AM'.
// Anything that isn't HH:MM is passed through unchanged.
function formatTime(str) {
  const m = /^(\d{2}):(\d{2})$/.exec(str || '');
  if (!m) return str || '';
  let h = Number(m[1]);
  const suffix = h < 12 ? 'AM' : 'PM';
  h = h % 12 || 12;
  return `${h}:${m[2]} ${suffix}`;
}

function apiFetch(method, url, body) {
  const opts = { method, headers: { 'X-Guest-Key': guestKey } };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  return fetch(url, opts);
}

// ── Gate ─────────────────────────────────────────────────────
async function tryKey(key) {
  const res = await fetch(API, { headers: { 'X-Guest-Key': key } });
  if (!res.ok) return null;
  return (await res.json()).posts;
}

async function init() {
  if (guestKey) {
    const posts = await tryKey(guestKey).catch(() => null);
    if (posts) {
      showApp(posts);
      return;
    }
    localStorage.removeItem(KEY_STORAGE);
    guestKey = '';
  }
  gateEl.hidden = false;
}

gateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  gateError.hidden = true;
  const key = gateInput.value;
  const posts = await tryKey(key).catch(() => null);
  if (posts === null) {
    gateError.hidden = false;
    return;
  }
  guestKey = key;
  localStorage.setItem(KEY_STORAGE, key);
  showApp(posts);
});

function showApp(posts) {
  gateEl.hidden = true;
  appEl.hidden = false;
  renderPosts(posts);
}

async function refresh() {
  const posts = await tryKey(guestKey).catch(() => null);
  if (posts === null) {
    // Password changed on the server — back to the gate.
    localStorage.removeItem(KEY_STORAGE);
    guestKey = '';
    appEl.hidden = true;
    gateEl.hidden = false;
    return;
  }
  renderPosts(posts);
}

// ── Rendering (textContent only — guest data is untrusted) ───
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function badgeFor(post) {
  if (post.ride === 'offer') {
    const n = post.seats;
    return el('span', 'post-badge post-badge--offer',
      n ? `Offering ${n} seat${n === 1 ? '' : 's'}` : 'Offering a ride');
  }
  const n = post.party_size;
  return el('span', 'post-badge post-badge--need',
    n ? `Needs a ride · party of ${n}` : 'Needs a ride');
}

function legLine(label, airport, date, time) {
  if (!airport && !date && !time) return null;
  const parts = [airport, formatDate(date), formatTime(time)].filter(Boolean);
  const p = el('p', 'post-leg');
  p.appendChild(el('strong', null, `${label}: `));
  p.appendChild(document.createTextNode(parts.join(' · ')));
  return p;
}

// Sort within a section: by arrival airport code (A–Z), then by arrival time
// latest-first. Posts missing an airport or time sort to the bottom of their
// group so the coordination-relevant entries stay at the top.
function sortForBoard(list) {
  const airport = (p) => (p.arrival_airport || '').toUpperCase();
  const time = (p) => p.arrival_time || '';
  return [...list].sort((a, b) => {
    const aa = airport(a), ba = airport(b);
    if (aa !== ba) {
      if (!aa) return 1;
      if (!ba) return -1;
      return aa < ba ? -1 : 1;
    }
    const at = time(a), bt = time(b);
    if (at === bt) return 0;
    if (!at) return 1;
    if (!bt) return -1;
    return at < bt ? 1 : -1; // descending — latest arrival first
  });
}

function renderPosts(posts) {
  postsEl.replaceChildren();
  postsEmpty.hidden = posts.length > 0;

  renderSection('Looking for rides', posts.filter((p) => p.ride === 'need'));
  renderSection('Space available', posts.filter((p) => p.ride === 'offer'));
}

function renderSection(title, posts) {
  if (posts.length === 0) return;

  const section = el('div', 'posts-section');
  section.appendChild(el('h3', 'posts-subheading', title));
  const list = el('div', 'posts-list');

  for (const post of sortForBoard(posts)) {
    const card = el('article', 'card post-card');

    const head = el('div', 'post-head');
    head.appendChild(el('h4', 'post-name', post.name));
    head.appendChild(badgeFor(post));
    card.appendChild(head);

    const arr = legLine('Arrives', post.arrival_airport, post.arrival_date, post.arrival_time);
    const dep = legLine('Departs', post.departure_airport, post.departure_date, post.departure_time);
    if (arr) card.appendChild(arr);
    if (dep) card.appendChild(dep);

    const contact = el('p', 'post-contact');
    const mail = el('a', 'text-link', post.email);
    mail.href = `mailto:${post.email}`;
    contact.appendChild(mail);
    if (post.phone) contact.appendChild(document.createTextNode(` · ${post.phone}`));
    card.appendChild(contact);

    const actions = el('div', 'post-actions');
    const editBtn = el('button', 'post-action', 'Edit');
    editBtn.type = 'button';
    editBtn.addEventListener('click', () => startEdit(post));
    const delBtn = el('button', 'post-action', 'Delete');
    delBtn.type = 'button';
    delBtn.addEventListener('click', () => deletePost(post));
    const remindBtn = el('button', 'post-action', 'Forgot PIN?');
    remindBtn.type = 'button';
    remindBtn.addEventListener('click', () => remindPin(post));
    actions.append(editBtn, delBtn, remindBtn);
    card.appendChild(actions);

    list.appendChild(card);
  }

  section.appendChild(list);
  postsEl.appendChild(section);
}

// ── Form ─────────────────────────────────────────────────────
function showFormError(msg) {
  formError.textContent = msg;
  formError.hidden = false;
}

function collectForm() {
  const get = (id) => document.getElementById(id).value;
  const ride = postForm.elements.ride.value;
  const count = get('f-count');
  return {
    name: get('f-name'),
    email: get('f-email'),
    phone: get('f-phone'),
    arrival_airport: get('f-arr-airport'),
    arrival_date: get('f-arr-date'),
    arrival_time: get('f-arr-time'),
    departure_airport: get('f-dep-airport'),
    departure_date: get('f-dep-date'),
    departure_time: get('f-dep-time'),
    ride,
    party_size: ride === 'offer' ? '' : count,
    seats: ride === 'offer' ? count : '',
    pin: get('f-pin'),
  };
}

function resetForm() {
  postForm.reset();
  editingId = null;
  formTitle.textContent = 'Share your travel plans';
  submitBtn.textContent = 'Post my plans';
  cancelBtn.hidden = true;
  pinLabel.childNodes[0].textContent = 'Choose a 4-digit PIN ';
  pinHint.textContent = "You'll use this PIN to edit or delete your post later.";
  formError.hidden = true;
  updateCountLabel();
}

function updateCountLabel() {
  countLabel.textContent = postForm.elements.ride.value === 'offer'
    ? 'Open seats'
    : 'People in your group';
}

for (const radio of postForm.elements.ride) {
  radio.addEventListener('change', updateCountLabel);
}

function startEdit(post) {
  editingId = post.id;
  const set = (id, v) => { document.getElementById(id).value = v || ''; };
  set('f-name', post.name);
  set('f-email', post.email);
  set('f-phone', post.phone);
  set('f-arr-airport', post.arrival_airport);
  set('f-arr-date', post.arrival_date);
  set('f-arr-time', post.arrival_time);
  set('f-dep-airport', post.departure_airport);
  set('f-dep-date', post.departure_date);
  set('f-dep-time', post.departure_time);
  postForm.elements.ride.value = post.ride;
  set('f-count', post.ride === 'offer' ? post.seats : post.party_size);
  set('f-pin', '');
  updateCountLabel();

  formTitle.textContent = `Edit ${post.name}'s post`;
  submitBtn.textContent = 'Save changes';
  cancelBtn.hidden = false;
  pinLabel.childNodes[0].textContent = 'Your 4-digit PIN ';
  pinHint.textContent = 'Enter the PIN you chose when you posted.';
  formError.hidden = true;
  document.querySelector('.form-card').scrollIntoView({ behavior: 'smooth' });
}

cancelBtn.addEventListener('click', resetForm);

postForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  formError.hidden = true;

  const body = collectForm();
  if (!body.name.trim()) return showFormError('Please enter your name.');
  if (!body.email.trim()) return showFormError('Please enter your email address.');
  if (!/^\d{4}$/.test(body.pin)) return showFormError('Your PIN must be exactly 4 digits.');

  let res;
  try {
    if (editingId !== null) {
      res = await apiFetch('PUT', API, { ...body, id: editingId });
    } else {
      res = await apiFetch('POST', API, body);
    }
  } catch {
    return showFormError('Network problem — please try again.');
  }

  if (res.status === 403) return showFormError("That PIN doesn't match this post.");
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    return showFormError(data.error || 'Something went wrong — please try again.');
  }

  resetForm();
  await refresh();
});

// ── Delete / Forgot PIN ──────────────────────────────────────
async function deletePost(post) {
  if (!confirm(`Delete ${post.name}'s post?`)) return;
  const pin = prompt('Enter the 4-digit PIN for this post to delete it:');
  if (pin === null) return;
  const res = await apiFetch('DELETE', API, { id: post.id, pin }).catch(() => null);
  if (!res) return alert('Network problem — please try again.');
  if (res.status === 403) return alert("That PIN doesn't match this post.");
  if (!res.ok) return alert('Something went wrong — please try again.');
  await refresh();
}

async function remindPin(post) {
  if (!confirm(`Email the PIN to the address on ${post.name}'s post?`)) return;
  const res = await apiFetch('POST', REMIND_API, { id: post.id }).catch(() => null);
  if (!res) return alert('Network problem — please try again.');
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return alert(data.error || 'Something went wrong — please try again.');
  alert(data.message || 'PIN sent to the email on this post.');
}

init();
