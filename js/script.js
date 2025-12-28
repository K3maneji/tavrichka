// КОНФИГУРАЦИЯ - ДОЛЖНА СОВПАДАТЬ С index.html
        const SPREADSHEET_ID = '16WrIdxMKBmaWUWnDpjXkwl1MtbVKAdjNts5tUFPOfa0';
        const API_KEY = 'AIzaSyCaq2S3Btv4Q1H1LzjIbd9LlKTwMyhq97Q';

        const studentId = sessionStorage.getItem('currentStudentId');
        const monthSelect = document.getElementById('month-select');
        const gradesContainer = document.getElementById('grades-container');
        const studentDetails = document.getElementById('student-details');

        // Список месяцев
        const months = [
            'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь', 
            'Январь', 'Февраль', 'Март', 'Апрель', 
            'Май', 'Июнь', 'Июль', 'Семестровые оценки'
        ];

        document.addEventListener('DOMContentLoaded', async function() {
            if (!studentId) {
                window.location.href = 'index.html';
                return;
            }

            // Устанавливаем текущий месяц по умолчанию
            const currentMonth = new Date().getMonth();
            const defaultMonth = months[Math.min(currentMonth, 10)]; // Максимум Июль
            monthSelect.value = defaultMonth;

            // Загружаем оценки для выбранного месяца
            await loadGradesForMonth(defaultMonth);

            // Добавляем обработчик изменения месяца
            monthSelect.addEventListener('change', async function() {
                await loadGradesForMonth(this.value);
            });
        });

        async function loadGradesForMonth(month) {
            gradesContainer.innerHTML = `
                <div class="loading">
                    <i class="fas fa-spinner"></i>
                    <p>Загрузка оценок за ${month}...</p>
                </div>
            `;

            try {
                const data = await loadDataFromGoogleSheets(month);
                const student = data.find(s => s['ID ученика'] === studentId);
                
                if (student) {
                    // Обновляем информацию о студенте
                    studentDetails.textContent = 
                        `Студент: ${student['ФИО ученика']}, ID: ${studentId}`;
                    
                    renderGrades(student, month);
                } else {
                    showError(`Оценки за ${month} не найдены`);
                }
            } catch (error) {
                showError('Ошибка загрузки оценок. Попробуйте позже.');
                console.error('Ошибка:', error);
            }
        }

        async function loadDataFromGoogleSheets(month) {
            // Для тестирования - раскомментируйте:
            /*
            return [
                {
                    'ФИО ученика': 'Иванов Александр Сергеевич',
                    'ID ученика': '1001',
                    'Математика': '5,4,5',
                    'Программирование': '5,5,4',
                    'Физика': '4,5',
                    'История': '5',
                    'Английский язык': '4,5'
                }
            ];
            */

            try {
                const response = await fetch(
                    `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${month}?key=${API_KEY}`
                );
                
                if (!response.ok) throw new Error('Ошибка загрузки');
                
                const data = await response.json();
                if (!data.values) throw new Error('Нет данных');
                
                const headers = data.values[0];
                const rows = data.values.slice(1);
                
                return rows.map(row => {
                    const obj = {};
                    headers.forEach((header, index) => {
                        obj[header] = row[index] || '';
                    });
                    return obj;
                });
                
            } catch (error) {
                console.error('Ошибка загрузки за месяц', month, ':', error);
                throw error;
            }
        }

        function renderGrades(student, month) {
            const subjects = Object.keys(student).filter(key => 
                key !== 'ФИО ученика' && key !== 'ID ученика'
            );
            
            let hasGrades = false;
            let gradesHTML = '';
            
            subjects.forEach(subject => {
                const gradesStr = student[subject] || '';
                if (gradesStr) {
                    const grades = gradesStr.split(',').filter(grade => grade.trim() !== '');
                    if (grades.length > 0) {
                        hasGrades = true;
                        const average = calculateAverage(grades);
                        
                        gradesHTML += `
                            <div class="subject-card">
                                <div class="subject-name"><i class="fas fa-book"></i> ${subject}</div>
                                <div class="grades-list">
                                    ${grades.map((grade, index) => 
                                        `<div class="grade" style="--delay: ${index}">${grade.trim()}</div>`
                                    ).join('')}
                                </div>
                                <div class="average"><i class="fas fa-calculator"></i> Средний балл: ${average.toFixed(2)}</div>
                            </div>
                        `;
                    }
                }
            });
            
            if (hasGrades) {
                gradesContainer.innerHTML = gradesHTML;
            } else {
                gradesContainer.innerHTML = `
                    <div class="no-grades">
                        <i class="fas fa-inbox"></i>
                        <p>Нет оценок за ${month}</p>
                    </div>
                `;
            }
        }

        function calculateAverage(grades) {
            const numericGrades = grades.map(grade => parseFloat(grade) || 0);
            const sum = numericGrades.reduce((total, grade) => total + grade, 0);
            return sum / numericGrades.length;
        }

        function showError(message) {
            gradesContainer.innerHTML = `
                <div class="error">
                    <i class="fas fa-exclamation-triangle"></i>
                    <p>${message}</p>
                </div>
            `;

        }

