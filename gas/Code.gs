/**
 * Таврический колледж — серверная часть электронного журнала.
 * Скрипт должен быть привязан к Google Таблице с листами журнала.
 * Доступ к таблице осуществляется от имени владельца скрипта.
 */
const ACCESS_SHEET_NAME = '_Доступ';
const SESSION_TTL_SECONDS = 21600; // 6 часов
const LOGIN_LIMIT = 5;
const LOGIN_WINDOW_SECONDS = 600; // 10 минут

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = String(params.callback || '');
  let result;

  try {
    const action = String(params.action || '');
    if (action === 'login') {
      result = login_(String(params.id || ''), String(params.pin || ''));
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

function login_(studentId, pin) {
  studentId = studentId.trim();
  pin = pin.trim();
  if (!studentId || !pin) return { ok: false, error: 'Введите ID и PIN-код.' };
  if (studentId.length > 80 || pin.length > 40) return { ok: false, error: 'Неверный ID или PIN-код.' };

  const cache = CacheService.getScriptCache();
  const attemptKey = 'login_' + sha256_(studentId).slice(0, 32);
  const attempts = Number(cache.get(attemptKey) || 0);
  if (attempts >= LOGIN_LIMIT) {
    return { ok: false, error: 'Слишком много попыток. Подождите 10 минут.' };
  }

  const accessSheet = getSpreadsheet_().getSheetByName(ACCESS_SHEET_NAME);
  if (!accessSheet) {
    return { ok: false, error: 'Доступ ещё не настроен. Обратитесь к администратору журнала.' };
  }

  const rows = accessSheet.getDataRange().getDisplayValues();
  let record = null;
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === studentId) {
      record = rows[i];
      break;
    }
  }

  const valid = record && safeEqual_(String(record[3]), sha256_(String(record[2]) + ':' + pin));
  if (!valid) {
    cache.put(attemptKey, String(attempts + 1), LOGIN_WINDOW_SECONDS);
    return { ok: false, error: 'Неверный ID или PIN-код.' };
  }

  cache.remove(attemptKey);
  const token = Utilities.getUuid();
  cache.put('session_' + token, studentId, SESSION_TTL_SECONDS);
  return {
    ok: true,
    token: token,
    name: String(record[1]),
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
  if (!sheet || monthName === ACCESS_SHEET_NAME) return { ok: false, error: 'Выбранный раздел журнала не найден.' };

  const values = sheet.getDataRange().getDisplayValues();
  if (!values.length) return { ok: true, month: monthName, grades: [] };

  const headers = values[0];
  const idIndex = headers.findIndex(function(h) { return normalize_(h) === 'idученика'; });
  const fioIndex = headers.findIndex(function(h) { return normalize_(h).indexOf('фио') === 0; });
  if (idIndex < 0) return { ok: false, error: 'В листе «' + monthName + '» отсутствует колонка «ID ученика».' };

  let studentRow = null;
  for (let r = 1; r < values.length; r++) {
    if (String(values[r][idIndex]).trim() === studentId) {
      studentRow = values[r];
      break;
    }
  }
  if (!studentRow) return { ok: false, error: 'Для этого ученика нет строки в выбранном разделе.' };

  const grades = [];
  headers.forEach(function(header, index) {
    const subject = String(header || '').trim();
    if (!subject || index === idIndex || index === fioIndex) return;
    const raw = String(studentRow[index] || '').trim();
    if (!raw) return;

    const marks = raw.indexOf(',') >= 0
      ? raw.split(',').map(function(x) { return x.trim(); }).filter(Boolean)
      : [raw];
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

/**
 * Запустить ОДИН РАЗ вручную из редактора Apps Script.
 * Создаёт скрытый лист _Доступ и уникальные PIN-коды для всех учеников.
 * PIN-коды появятся в журнале выполнения — сохраните и передайте их лично.
 * Не запускайте повторно без удаления/переименования старого листа _Доступ.
 */
function setupAccessCodes() {
  const ss = getSpreadsheet_();
  if (ss.getSheetByName(ACCESS_SHEET_NAME)) {
    throw new Error('Лист _Доступ уже существует. Чтобы не менять PIN-коды учеников, настройка остановлена.');
  }

  const students = {};
  getJournalSheets_().forEach(function(sheet) {
    const data = sheet.getDataRange().getDisplayValues();
    if (data.length < 2) return;
    const headers = data[0];
    const idIndex = headers.findIndex(function(h) { return normalize_(h) === 'idученика'; });
    const fioIndex = headers.findIndex(function(h) { return normalize_(h).indexOf('фио') === 0; });
    if (idIndex < 0) return;
    for (let i = 1; i < data.length; i++) {
      const id = String(data[i][idIndex] || '').trim();
      if (!id) continue;
      const name = fioIndex >= 0 ? String(data[i][fioIndex] || '').trim() : '';
      if (!students[id]) students[id] = name;
    }
  });

  const sheet = ss.insertSheet(ACCESS_SHEET_NAME);
  sheet.getRange(1, 1, 1, 4).setValues([['ID ученика', 'ФИО ученика', 'Соль', 'Хэш PIN']]);
  const output = [];
  const credentials = [];
  Object.keys(students).sort().forEach(function(id) {
    const pin = Utilities.getUuid().replace(/-/g, '').slice(0, 8).toUpperCase();
    const salt = Utilities.getUuid();
    output.push([id, students[id], salt, sha256_(salt + ':' + pin)]);
    credentials.push(id + ' | ' + students[id] + ' | PIN: ' + pin);
  });
  if (output.length) sheet.getRange(2, 1, output.length, 4).setValues(output);
  sheet.hideSheet();
  sheet.protect().setDescription('Системные данные доступа. Не удалять и не редактировать.');

  console.log('СОХРАНИТЕ СПИСОК PIN-КОДОВ И ПЕРЕДАЙТЕ ИХ УЧЕНИКАМ ЛИЧНО:');
  credentials.forEach(function(line) { console.log(line); });
  console.log('Создано кодов: ' + credentials.length);
  return 'Готово. Создано PIN-кодов: ' + credentials.length + '. Откройте журнал выполнения и сохраните список.';
}

function getJournalSheets_() {
  return getSpreadsheet_().getSheets().filter(function(sheet) {
    return sheet.getName() !== ACCESS_SHEET_NAME && !sheet.isSheetHidden();
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

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}
