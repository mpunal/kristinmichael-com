/* kristinmichael.com — shared JS */

// ── Nav: scrolled state ──────────────────────────────────────
const header    = document.querySelector('.site-header');
const navToggle = document.querySelector('.nav-toggle');
const navMenu   = document.querySelector('.nav-menu');

window.addEventListener('scroll', () => {
  header.classList.toggle('scrolled', window.scrollY > 60);
}, { passive: true });

// Trigger on load in case page is already scrolled (e.g. browser back)
if (window.scrollY > 60) header.classList.add('scrolled');

// ── Nav: mobile menu ─────────────────────────────────────────
function openMenu() {
  navToggle.setAttribute('aria-expanded', 'true');
  navMenu.classList.add('is-open');
  document.body.style.overflow = 'hidden';
}

function closeMenu() {
  navToggle.setAttribute('aria-expanded', 'false');
  navMenu.classList.remove('is-open');
  document.body.style.overflow = '';
}

navToggle?.addEventListener('click', () => {
  navToggle.getAttribute('aria-expanded') === 'true' ? closeMenu() : openMenu();
});

// Close on any nav link click (catches anchor links on same page)
navMenu?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', closeMenu);
});

// Close on Escape and return focus to toggle
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && navMenu?.classList.contains('is-open')) {
    closeMenu();
    navToggle?.focus();
  }
});

// ── Countdown ────────────────────────────────────────────────
// Update to actual ceremony time once confirmed (currently set to 4 PM CT)
const WEDDING = new Date('2026-09-25T16:00:00-05:00');

const elDays    = document.getElementById('cd-days');
const elHours   = document.getElementById('cd-hours');
const elMinutes = document.getElementById('cd-minutes');
const elSeconds = document.getElementById('cd-seconds');
const elTimer   = document.getElementById('countdown');

function pad(n) {
  return String(Math.max(0, n)).padStart(2, '0');
}

function showDayOfMessage() {
  if (!elTimer) return;
  // Clear existing children safely
  while (elTimer.firstChild) elTimer.removeChild(elTimer.firstChild);
  const p = document.createElement('p');
  p.className = 'countdown-complete';
  p.textContent = 'Today is the day! ♥';
  elTimer.appendChild(p);
}

function tick() {
  const diff = WEDDING - Date.now();

  if (diff <= 0) {
    clearInterval(countdownTimer);
    showDayOfMessage();
    return;
  }

  const totalSecs = Math.floor(diff / 1000);
  const s = totalSecs % 60;
  const m = Math.floor(totalSecs / 60) % 60;
  const h = Math.floor(totalSecs / 3600) % 24;
  const d = Math.floor(totalSecs / 86400);

  if (elDays)    elDays.textContent    = pad(d);
  if (elHours)   elHours.textContent   = pad(h);
  if (elMinutes) elMinutes.textContent = pad(m);
  if (elSeconds) elSeconds.textContent = pad(s);
}

tick();
const countdownTimer = setInterval(tick, 1000);
