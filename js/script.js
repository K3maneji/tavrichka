const studentToken = sessionStorage.getItem('currentStudentToken');
const studentName = sessionStorage.getItem('currentStudentName') || 'Ученик';
const monthSelect = document.getElementById('month-select');
const gradesContainer = document.getElementById('grades-container');
const studentDetails = document.getElementById('student-details');

const MONTH_ORDER = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

document.addEventListener('DOMContentLoaded', init);

async function init() {
    if (!studentToken) {
        window.location.replace('index.html');
        return;
    }
    studentDetails.textContent = `Студент: ${studentName}`;
    const months = safeParse(sessionStorage.getItem('availableMonths'));
    if (!months.length) {
        showError('Не удалось получить список разделов журнала. Войдите повторно.');
        return;
    }

    monthSelect.replaceChildren();
    months.forEach(month => {
        const option = document.createElement('option');
        option.value = month;
        option.textContent = month;
        monthSelect.appendChild(option);
    });

    const defaultMonth = chooseDefaultMonth(months);
    monthSelect.value = defaultMonth;
    monthSelect.addEventListener('change', () => loadGradesForMonth(monthSelect.value));
    await loadGradesForMonth(defaultMonth);
}

function chooseDefaultMonth(months) {
    const currentMonthName = MONTH_ORDER[new Date().getMonth()];
    const match = months.find(name => name === currentMonthName) ||
        months.find(name => name.startsWith(currentMonthName + ' '));
    return match || months[months.length - 1];
}

async function loadGradesForMonth(month) {
    renderMessage(`Загрузка оценок за ${month}...`, 'loading');
    try {
        const result = await TavrichkaApi.grades(studentToken, month);
        if (result.studentName) studentDetails.textContent = `Студент: ${result.studentName}`;
        renderGrades(result.grades || [], month);
    } catch (error) {
        if (error.message && error.message.toLowerCase().includes('сессия истекла')) {
            sessionStorage.clear();
            window.location.replace('index.html');
            return;
        }
        showError(error.message || 'Ошибка загрузки оценок. Попробуйте позже.');
    }
}

function renderGrades(subjects, month) {
    gradesContainer.replaceChildren();
    if (!subjects.length) {
        renderMessage(`Нет оценок за ${month}`, 'no-grades');
        return;
    }

    subjects.forEach((subject, subjectIndex) => {
        const card = document.createElement('div');
        card.className = 'subject-card';

        const title = document.createElement('div');
        title.className = 'subject-name';
        const icon = document.createElement('i');
        icon.className = 'fas fa-book';
        title.append(icon, document.createTextNode(` ${subject.subject}`));

        const marks = document.createElement('div');
        marks.className = 'grades-list';
        subject.marks.forEach((mark, index) => {
            const item = document.createElement('div');
            item.className = 'grade';
            item.style.setProperty('--delay', String(index));
            item.textContent = mark;
            if (!/^[1-5](?:[.,]\d+)?$/.test(mark)) item.title = 'Отметка посещаемости или специальное обозначение';
            marks.appendChild(item);
        });

        const average = document.createElement('div');
        average.className = 'average';
        const averageIcon = document.createElement('i');
        averageIcon.className = 'fas fa-calculator';
        const averageText = subject.average === null || subject.average === undefined
            ? 'Средний балл: —'
            : `Средний балл: ${Number(subject.average).toFixed(2)}`;
        average.append(averageIcon, document.createTextNode(` ${averageText}`));

        card.append(title, marks, average);
        gradesContainer.appendChild(card);
    });
}

function renderMessage(message, className) {
    gradesContainer.replaceChildren();
    const wrapper = document.createElement('div');
    wrapper.className = className;
    const icon = document.createElement('i');
    icon.className = className === 'loading' ? 'fas fa-spinner fa-spin' : 'fas fa-inbox';
    const text = document.createElement('p');
    text.textContent = message;
    wrapper.append(icon, text);
    gradesContainer.appendChild(wrapper);
}

function showError(message) {
    renderMessage(message, 'error');
}

function safeParse(value) {
    try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : []; }
    catch (_) { return []; }
}

document.getElementById('logout-btn')?.addEventListener('click', event => {
    event.preventDefault();
    sessionStorage.clear();
    window.location.href = 'index.html';
});
