/**
 * Таврический колледж — Google Apps Script API.
 * Вход только по ID ученика. Данные Google Таблицы не публикуются.
 */
const SESSION_TTL_SECONDS = 21600; // 6 часов
const LOGIN_LIMIT = 10;
const LOGIN_WINDOW_SECONDS = 600; // 10 минут

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = String(params.callback || '');
  let result;

  try {
    const action = String(params.action || '');
    if (action === 'login') {
      result = login_(String(params.id || ''));
    } else if (action === 'grades') {
      result = getGrades_(String(params.token || ''), String(params.month || ''));
    } else {
      result = { ok: false, error: 'Неизвестный запрос.' };
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    result = { ok: false, error: 'Внутренняя ошибка сервиса. Попробуйте позже.' };
  }

  const json = JSON.stringify(result);
  if (callback && /^__gasCallback_[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Вход по одному ID.
 * Важно: ID не является паролем. Любой, кто знает или угадает ID,
 * потенциально сможет посмотреть оценки этого ученика.
 */
function login_(studentId) {
  studentId = studentId.trim();
  if (!studentId || studentId.length > 80) {
    return { ok: false, error: 'Введите корректный ID ученика.' };
  }

  const cache = CacheService.getScriptCache();
  const attemptKey = 'login_' + sha256_(studentId).slice(0, 32);
  const attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= LOGIN_LIMIT) {
    return { ok: false, error: 'Слишком много попыток. Подождите 10 минут.' };
  }

  let studentName = '';
  let found = false;
  getJournalSheets_().some(function(sheet) {
    const data = sheet.getDataRange().getDisplayValues();
    if (data.length < 2) return false;
    const headers = data[0];
    const idIndex = headers.findIndex(function(h) { return normalize_(h) === 'idученика'; });
    const fioIndex = headers.findIndex(function(h) { return normalize_(h).indexOf('фио') === 0; });
    if (idIndex < 0) return false;

    for (let r = 1; r < data.length; r++) {
      if (String(data[r][idIndex] || '').trim() === studentId) {
        found = true;
        studentName = fioIndex >= 0 ? String(data[r][fioIndex] || '').trim() : '';
        return true;
      }
    }
    return false;
  });

  if (!found) {
    cache.put(attemptKey, String(attempts + 1), LOGIN_WINDOW_SECONDS);
    return { ok: false, error: 'Ученик с таким ID не найден.' };
  }

  cache.remove(attemptKey);
  const token = Utilities.getUuid();
  cache.put('session_' + token, studentId, SESSION_TTL_SECONDS);
  return {
    ok: true,
    token: token,
    name: studentName,
    months: getJournalSheets_().map(function(sheet) { return sheet.getName(); })
  };
}

function getGrades_(token, monthName) {
  token = token.trim();
  monthName = monthName.trim();
  if (!token || !monthName) return { ok: false, error: 'Не удалось определить сессию или месяц.' };

  const studentId = CacheService.getScriptCache().get('session_' + token);
  if (!studentId) return { ok: false, error: 'Сессия истекла. Войдите в журнал повторно.', auth: false };

  const sheet = getSpreadsheet_().getSheetByName(monthName);
  if (!sheet || sheet.isSheetHidden()) return { ok: false, error: 'Выбранный раздел журнала не найден.' };

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { ok: true, month: monthName, grades: [] };

  const headers = values[0];
  const idIndex = headers.findIndex(function(h) { return normalize_(h) === 'idученика'; });
  const fioIndex = headers.findIndex(function(h) { return normalize_(h).indexOf('фио') === 0; });
  if (idIndex < 0) return { ok: false, error: 'В листе «' + monthName + '» отсутствует колонка «ID ученика».' };

  let studentRow = null;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIndex] || '').trim() === studentId) {
      studentRow = values[r];
      break;
    }
  }
  if (!studentRow) return { ok: true, month: monthName, studentName: '', grades: [] };

  const grades = [];
  headers.forEach(function(header, index) {
    const subject = String(header || '').trim();
    if (!subject || index === idIndex || index === fioIndex) return;
    const raw = String(studentRow[index] || '').trim();
    if (!raw) return;

    const marks = raw.split(/[;,]/).map(function(x) { return x.trim(); }).filter(Boolean);
    if (!marks.length) return;

    const numeric = marks.map(function(mark) {
      const normalized = mark.replace(',', '.');
      if (!/^[1-5](?:\.\d+)?$/.test(normalized)) return null;
      const number = Number(normalized);
      return number >= 1 && number <= 5 ? number : null;
    }).filter(function(value) { return value !== null; });

    grades.push({
      subject: subject,
      marks: marks,
      average: numeric.length ? numeric.reduce(function(a, b) { return a + b; }, 0) / numeric.length : null,
      numericCount: numeric.length
    });
  });

  return {
    ok: true,
    month: monthName,
    studentName: fioIndex >= 0 ? String(studentRow[fioIndex] || '') : '',
    grades: grades
  };
}

function getJournalSheets_() {
  return getSpreadsheet_().getSheets().filter(function(sheet) {
    return !sheet.isSheetHidden();
  });
}

function getSpreadsheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Привяжите Apps Script к Google Таблице с журналом.');
  return ss;
}

function normalize_(value) {
  return String(value || '').toLowerCase().replace(/[\s\u00a0]+/g, '').replace(/ё/g, 'е');
}

function sha256_(value) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes.map(function(b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
