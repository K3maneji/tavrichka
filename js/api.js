// Вставьте сюда URL развернутого веб-приложения Apps Script (заканчивается на /exec).
window.TAVRICHKA_API_URL = 'ВСТАВЬТЕ_URL_ВЕБ_ПРИЛОЖЕНИЯ_APPS_SCRIPT';

window.TavrichkaApi = (() => {
    let callbackCounter = 0;

    function request(params) {
        return new Promise((resolve, reject) => {
            const endpoint = window.TAVRICHKA_API_URL;
            if (!endpoint || endpoint.includes('ВСТАВЬТЕ_URL')) {
                reject(new Error('Не настроен адрес Google Apps Script. Откройте js/api.js и вставьте URL веб-приложения.'));
                return;
            }

            const callbackName = `__gasCallback_${Date.now()}_${++callbackCounter}`;
            const script = document.createElement('script');
            const query = new URLSearchParams({ ...params, callback: callbackName });
            let finished = false;
            const timeout = window.setTimeout(() => finish(new Error('Сервис не ответил за 15 секунд. Проверьте публикацию Apps Script.')), 15000);

            function cleanup() {
                window.clearTimeout(timeout);
                script.remove();
                try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
            }
            function finish(error, data) {
                if (finished) return;
                finished = true;
                cleanup();
                if (error) reject(error);
                else if (!data || data.ok !== true) reject(new Error((data && data.error) || 'Не удалось выполнить запрос.'));
                else resolve(data);
            }

            window[callbackName] = data => finish(null, data);
            script.onerror = () => finish(new Error('Не удалось подключиться к Google Apps Script. Проверьте URL и доступ к веб-приложению.'));
            script.src = `${endpoint}?${query.toString()}`;
            document.head.appendChild(script);
        });
    }

    return {
        login: (id, pin) => request({ action: 'login', id, pin }),
        grades: (token, month) => request({ action: 'grades', token, month })
    };
})();
