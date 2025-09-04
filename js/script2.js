        const SPREADSHEET_ID = '16WrIdxMKBmaWUWnDpjXkwl1MtbVKAdjNts5tUFPOfa0';
        const API_KEY = 'AIzaSyCaq2S3Btv4Q1H1LzjIbd9LlKTwMyhq97Q';

        const loader = document.getElementById('loader');
        const progress = document.getElementById('progress');
        const container = document.getElementById('container');
        const studentIdInput = document.getElementById('student-id');
        const loginBtn = document.getElementById('login-btn');
        const errorMessage = document.getElementById('error-message');

        // Список месяцев для оценок
        const months = [
            'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
            'Январь', 'Февраль', 'Март', 'Апрель', 
            'Май', 'Июнь', 'Июль'
        ];

        document.addEventListener('DOMContentLoaded', init);
        
        function init() {
            simulateLoading();
            loginBtn.addEventListener('click', handleLogin);
        }
        
        function simulateLoading() {
            let width = 0;
            const interval = setInterval(() => {
                if (width >= 100) {
                    clearInterval(interval);
                    setTimeout(() => {
                        loader.style.opacity = '0';
                        setTimeout(() => {
                            loader.style.display = 'none';
                            container.classList.add('visible');
                        }, 300);
                    }, 300);
                } else {
                    width += 25;
                    progress.style.width = `${width}%`;
                }
            }, 100);
        }
        
        async function handleLogin() {
            const studentId = studentIdInput.value.trim();
            
            if (!studentId) {
                showError('Пожалуйста, введите ваш ID');
                return;
            }

            loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
            loginBtn.disabled = true;

            try {
                // Проверяем существование студента
                const studentExists = await checkStudentExists(studentId);
                
                if (studentExists) {
                    sessionStorage.setItem('currentStudentId', studentId);
                    window.location.href = 'grades.html';
                } else {
                    showError('Ученик с таким ID не найден');
                }
            } catch (error) {
                showError('Ошибка при загрузке данных. Проверьте подключение.');
                console.error('Ошибка:', error);
            } finally {
                loginBtn.innerHTML = '<i class="fas fa-lock-open"></i> Войти в журнал';
                loginBtn.disabled = false;
            }
        }

        async function checkStudentExists(studentId) {


            try {
                // Проверяем любой из месяцев (например, Сентябрь)
                const response = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/Сентябрь?key=${API_KEY}`
                );
                
                if (!response.ok) return false;
                
                const data = await response.json();
                if (!data.values || data.values.length === 0) return false;
                
                // Проверяем, есть ли студент с таким ID
                const headers = data.values[0];
                const idIndex = headers.indexOf('ID ученика');
                
                if (idIndex === -1) return false;
                
                return data.values.some((row, index) => {
                    if (index === 0) return false; // Пропускаем заголовок
                    return row[idIndex] === studentId;
                });
                
            } catch (error) {
                console.error('Ошибка проверки студента:', error);
                return false;
            }
        }
        
        function showError(message) {
            errorMessage.textContent = message;
            errorMessage.classList.remove('hidden');
            setTimeout(() => errorMessage.classList.add('hidden'), 4000);
        }