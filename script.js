/* ---------- Utility helpers ---------- */
const qs = (sel) => document.querySelector(sel);
const qsa = (sel) => Array.from(document.querySelectorAll(sel));

function formatISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseISO(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

/* ---------- Persistence and keys ---------- */
const STORAGE_KEY = 'menstrualCycleSettings_v1';
const THEME_KEY = 'cicloTheme';
const LANG_KEY = 'cicloLang';

/* ---------- Internationalized strings ---------- */
const I18N = {
  'en-US': {
    appTitle: 'Female Cycle',
    tagline: 'Menstrual Cycle Calendar - Respect the menstrual cycle: empathy and dignity for all',
    configTitle: 'Initial Configuration',
    saveBtn: 'Save and Calculate Cycle',
    resetBtn: 'Reset',
    lastPeriod: 'Start of Last Period',
    cycleLength: 'Average Cycle Length (days)',
    periodLength: 'Average Period Length (days)',
    menstruation: 'Menstruation',
    fertile: 'Fertile Window',
    ovulation: 'Ovulation',
    today: 'Today',
    pleaseSet: 'Please set your last period and cycle preferences to see predictions.',
    developedBy: 'Developed by Gabriela Neves - Updated by Nivaldo Beirão 2026',
    predictionBased: (dateISO, cycle) => `Prediction based on: ${dateISO} | ${cycle} days (cycle)`,
    weekdays: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
  },
  'pt-BR': {
    appTitle: 'Ciclo Feminino',
    tagline: 'Calendário Menstrual - Respeite o ciclo menstrual: empatia e dignidade para todas as mulheres',
    configTitle: 'Configuração Inicial',
    saveBtn: 'Salvar e Calcular Ciclo',
    resetBtn: 'Redefinir',
    lastPeriod: 'Início da Última Menstruação',
    cycleLength: 'Duração Média do Ciclo (dias)',
    periodLength: 'Duração Média do Período (dias)',
    menstruation: 'Menstruação',
    fertile: 'Janela Fértil',
    ovulation: 'Ovulação',
    today: 'Hoje',
    pleaseSet: 'Por favor, defina sua última menstruação e preferências para ver previsões.',
    developedBy: 'Desenvolvido por Gabriela Neves - Atualizado por Nivaldo Beirão 2026',
    predictionBased: (dateISO, cycle) => `Previsão baseada em: ${dateISO} | ${cycle} dias (ciclo)`,
    weekdays: ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  },
  'es-ES': {
    appTitle: 'Ciclo Femenino',
    tagline: 'Calendario Menstrual - Respeta el ciclo menstrual: empatía y dignidad para todas las mujeres',
    configTitle: 'Configuración Inicial',
    saveBtn: 'Guardar y Calcular Ciclo',
    resetBtn: 'Restablecer',
    lastPeriod: 'Inicio de la Última Menstruación',
    cycleLength: 'Duración Media del Ciclo (días)',
    periodLength: 'Duración Media del Período (días)',
    menstruation: 'Menstruación',
    fertile: 'Ventana Fértil',
    ovulation: 'Ovulación',
    today: 'Hoy',
    pleaseSet: 'Por favor, establezca su última menstruación y preferencias para ver predicciones.',
    developedBy: 'Desarrollado por Gabriela Neves - Actualizado por Nivaldo Beirão 2026',
    predictionBased: (dateISO, cycle) => `Predicción basada en: ${dateISO} | ${cycle} días (ciclo)`,
    weekdays: ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
  }
};

/* ---------- Prediction logic ---------- */
function loadSettings() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/*
  Heuristic:
  - ovulation ≈ cycleStart + (cycleLength - 14)
  - fertile window ≈ ovulation -5 .. ovulation +1
*/
function generateCycleEvents(lastPeriodDate, cycleLength, periodLength, monthsRange = 6) {
  const events = new Map();
  if (!lastPeriodDate || !cycleLength || !periodLength) return events;

  const startWindow = addDays(new Date(), -30 * monthsRange);
  const endWindow = addDays(new Date(), 30 * monthsRange);

  const cycleStarts = [];
  let base = new Date(lastPeriodDate.getFullYear(), lastPeriodDate.getMonth(), lastPeriodDate.getDate());

  let cur = new Date(base);
  while (cur > startWindow) {
    cycleStarts.push(new Date(cur));
    cur = addDays(cur, -cycleLength);
  }
  cur = addDays(base, cycleLength);
  while (cur <= endWindow) {
    cycleStarts.push(new Date(cur));
    cur = addDays(cur, cycleLength);
  }

  cycleStarts.forEach((startDate) => {
    for (let i = 0; i < periodLength; i++) {
      const d = addDays(startDate, i);
      const key = formatISO(d);
      const set = events.get(key) || new Set();
      set.add('menstruation');
      events.set(key, set);
    }

    const ovulation = addDays(startDate, cycleLength - 14);
    const ovKey = formatISO(ovulation);
    const ovSet = events.get(ovKey) || new Set();
    ovSet.add('ovulation');
    events.set(ovKey, ovSet);

    for (let i = -5; i <= 1; i++) {
      const d = addDays(ovulation, i);
      const k = formatISO(d);
      const s = events.get(k) || new Set();
      s.add('fertile');
      events.set(k, s);
    }
  });

  return events;
}

/* ---------- Calendar rendering ---------- */
let currentYear, currentMonth;
let cachedEvents = new Map();
let currentLang = localStorage.getItem(LANG_KEY) || 'en-US';

function renderWeekdays() {
  const grid = qs('#calendarGrid');
  // Remove existing weekday headers if any
  grid.innerHTML = '';
  const wk = I18N[currentLang].weekdays || I18N['en-US'].weekdays;
  wk.forEach(w => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = w;
    grid.appendChild(el);
  });
}

function renderCalendar(year, month, eventsMap) {
  const grid = qs('#calendarGrid');
  grid.innerHTML = '';

  // Weekday headers
  const wk = I18N[currentLang].weekdays || I18N['en-US'].weekdays;
  wk.forEach(w => {
    const el = document.createElement('div');
    el.className = 'weekday';
    el.textContent = w;
    grid.appendChild(el);
  });

  const firstOfMonth = new Date(year, month, 1);
  const startDay = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < startDay; i++) {
    const blank = document.createElement('div');
    blank.className = 'day inactive';
    grid.appendChild(blank);
  }

  const today = new Date();

  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const iso = formatISO(dateObj);
    const dayEl = document.createElement('div');
    dayEl.className = 'day';
    if (sameDay(dateObj, today)) dayEl.classList.add('today');

    const num = document.createElement('div');
    num.className = 'date-num';
    num.textContent = d;
    dayEl.appendChild(num);

    const tags = eventsMap.get(iso);
    if (tags) {
      if (tags.has('menstruation')) dayEl.classList.add('menstruation');
      else if (tags.has('ovulation')) dayEl.classList.add('ovulation');
      else if (tags.has('fertile')) dayEl.classList.add('fertile');

      const dot = document.createElement('i');
      dot.className = 'dot-indicator';
      if (tags.has('menstruation')) dot.classList.add('menstruation');
      else if (tags.has('ovulation')) dot.classList.add('ovulation');
      else if (tags.has('fertile')) dot.classList.add('fertile');
      dayEl.appendChild(dot);
    }

    grid.appendChild(dayEl);
  }
}

/* ---------- UI wiring and i18n ---------- */
function updateMonthLabel() {
  const label = qs('#monthLabel');
  const date = new Date(currentYear, currentMonth, 1);
  const opts = { year: 'numeric', month: 'long' };
  try {
    label.textContent = date.toLocaleDateString(currentLang, opts);
  } catch {
    label.textContent = date.toLocaleDateString('en-US', opts);
  }
}

function updateSummary(settings) {
  const summary = qs('#summary');
  const i = I18N[currentLang] || I18N['en-US'];
  if (!settings || !settings.lastPeriod) {
    summary.innerHTML = `<p class="muted">${i.pleaseSet}</p>`;
    qs('#footerNote').textContent = '';
    return;
  }
  const last = parseISO(settings.lastPeriod);
  summary.innerHTML = `<p><strong>${i.lastPeriod}</strong>: ${formatISO(last)} — <strong>${i.cycleLength}</strong>: ${settings.cycleLength} — <strong>${i.periodLength}</strong>: ${settings.periodLength}</p>`;
  qs('#footerNote').textContent = i.predictionBased(formatISO(last), settings.cycleLength);
}

function applySettingsToForm(settings) {
  if (!settings) return;
  qs('#lastPeriod').value = settings.lastPeriod || '';
  qs('#cycleLength').value = settings.cycleLength || 28;
  qs('#periodLength').value = settings.periodLength || 5;
}

function refreshCalendarFromSettings(settings) {
  if (!settings || !settings.lastPeriod) return;
  const last = parseISO(settings.lastPeriod);
  const cycleLength = Number(settings.cycleLength);
  const periodLength = Number(settings.periodLength);

  cachedEvents = generateCycleEvents(last, cycleLength, periodLength, 6);
  renderCalendar(currentYear, currentMonth, cachedEvents);
  updateSummary(settings);
}

/* ---------- Theme and language ---------- */
function applyTheme(theme) {
  if (theme === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  localStorage.setItem(THEME_KEY, theme);
}

function applyLanguage(lang) {
  currentLang = lang || 'en-US';
  localStorage.setItem(LANG_KEY, currentLang);

  // Set document language attribute for accessibility and date formatting
  try { document.documentElement.lang = currentLang; } catch {}

  const s = I18N[currentLang] || I18N['en-US'];

  // Update visible UI strings
  qs('#configTitle').textContent = s.configTitle;
  qs('#saveBtn').textContent = s.saveBtn;
  qs('#resetBtn').textContent = s.resetBtn;
  qs('#labelLastPeriod').textContent = s.lastPeriod;
  qs('#labelCycleLength').textContent = s.cycleLength;
  qs('#labelPeriodLength').textContent = s.periodLength;
  qs('#appTitle').textContent = s.appTitle;
  qs('.tagline').textContent = s.tagline;
  qs('#footerCredit').textContent = s.developedBy;

  qs('#legendMenstruation').innerHTML = `<i class="dot menstruation"></i> ${s.menstruation}`;
  qs('#legendFertile').innerHTML = `<i class="dot fertile"></i> ${s.fertile}`;
  qs('#legendOvulation').innerHTML = `<i class="dot ovulation"></i> ${s.ovulation}`;
  qs('#legendToday').innerHTML = `<i class="dot today"></i> ${s.today}`;

  // Re-render calendar labels and month label
  renderWeekdays();
  updateMonthLabel();
  // Update summary/footer if settings exist
  const settings = loadSettings();
  updateSummary(settings);
}

/* ---------- Event listeners ---------- */
document.addEventListener('DOMContentLoaded', () => {
  const now = new Date();
  currentYear = now.getFullYear();
  currentMonth = now.getMonth();

  // Theme
  const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
  applyTheme(savedTheme);
  qs('#darkToggle').checked = savedTheme === 'dark';

  // Language
  const savedLang = localStorage.getItem(LANG_KEY) || 'en-US';
  qs('#langSelect').value = savedLang;
  applyLanguage(savedLang);

  // Load settings
  const settings = loadSettings();
  applySettingsToForm(settings);
  updateSummary(settings);

  if (settings && settings.lastPeriod) {
    refreshCalendarFromSettings(settings);
  } else {
    renderCalendar(currentYear, currentMonth, new Map());
  }
  updateMonthLabel();

  // Navigation
  qs('#prevMonth').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar(currentYear, currentMonth, cachedEvents);
    updateMonthLabel();
  });
  qs('#nextMonth').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar(currentYear, currentMonth, cachedEvents);
    updateMonthLabel();
  });

  // Save form
  qs('#settingsForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const lastPeriod = qs('#lastPeriod').value;
    const cycleLength = Number(qs('#cycleLength').value);
    const periodLength = Number(qs('#periodLength').value);

    if (!lastPeriod || !cycleLength || !periodLength) return;

    const newSettings = { lastPeriod, cycleLength, periodLength };
    saveSettings(newSettings);
    applySettingsToForm(newSettings);
    refreshCalendarFromSettings(newSettings);
  });

  // Reset
  qs('#resetBtn').addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    qs('#lastPeriod').value = '';
    qs('#cycleLength').value = 28;
    qs('#periodLength').value = 5;
    cachedEvents = new Map();
    renderCalendar(currentYear, currentMonth, cachedEvents);
    updateSummary(null);
  });

  // Theme toggle
  qs('#darkToggle').addEventListener('change', (e) => {
    applyTheme(e.target.checked ? 'dark' : 'light');
  });

  // Language selector
  qs('#langSelect').addEventListener('change', (e) => {
    applyLanguage(e.target.value);
  });
});
