const loader = document.getElementById('loader');
const progress = document.getElementById('progress');
const container = document.getElementById('container');
const studentIdInput = document.getElementById('student-id');
const studentPinInput = document.getElementById('student-pin');
const loginBtn = document.getElementById('login-btn');
const errorMessage = document.getElementById('error-message');

document.addEventListener('DOMContentLoaded', init);

function init() {
    simulateLoading();
    loginBtn.addEventListener('click', handleLogin);
    [studentIdInput, studentPinInput].forEach(input => input.addEventListener('keydown', event => {
        if (event.key === 'Enter') handleLogin();
    }));
}

function simulateLoading() {
    let width = 0;
    const interval = window.setInterval(() => {
        width = Math.min(width + 25, 100);
        progress.style.width = `${width}%`;
        if (width >= 100) {
            window.clearInterval(interval);
            window.setTimeout(() => {
                loader.style.opacity = '0';
                window.setTimeout(() => {
                    loader.style.display = 'none';
                    container.classList.add('visible');
                }, 300);
            }, 200);
        }
    }, 80);
}

async function handleLogin() {
    const studentId = studentIdInput.value.trim();
    const pin = studentPinInput.value.trim();
    hideError();

    if (!studentId || !pin) {
        showError('Введите ID и персональный PIN-код.');
        return;
    }

    loginBtn.disabled = true;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Проверка...';
    try {
        const result = await TavrichkaApi.login(studentId, pin);
        sessionStorage.setItem('currentStudentToken', result.token);
        sessionStorage.setItem('currentStudentName', result.name || '');
        sessionStorage.setItem('availableMonths', JSON.stringify(result.months || []));
        window.location.href = 'grades.html';
    } catch (error) {
        showError(error.message || 'Не удалось войти. Попробуйте позже.');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-lock-open"></i> Войти в журнал';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}
function hideError() {
    errorMessage.textContent = '';
    errorMessage.classList.add('hidden');
}
