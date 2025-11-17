const { google } = require('googleapis');
const path = require('path');

class GoogleSheets {
    constructor() {
        this.spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID || '1f52rCIrR-D-Y_9tnqML5mSUYSOSvHpCB-plPT2BY_yY';
        this.auth = null;
        this.sheets = null;
        this.initialized = false;
        // Инициализация асинхронно, но без блокировки конструктора
        this.initPromise = this.init();
    }

    async init() {
        try {
            // Если есть путь к credentials файлу
            if (process.env.GOOGLE_CREDENTIALS_PATH) {
                const credentialsPath = path.resolve(process.env.GOOGLE_CREDENTIALS_PATH);
                
                // Проверяем существование файла
                const fs = require('fs');
                if (!fs.existsSync(credentialsPath)) {
                    console.error(`❌ Файл credentials не найден: ${credentialsPath}`);
                    this.initialized = false;
                    return;
                }
                
                this.auth = new google.auth.GoogleAuth({
                    keyFile: credentialsPath,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
                
                // Проверяем доступ к таблице сразу после инициализации
                const authClient = await this.auth.getClient();
                this.sheets = google.sheets({ version: 'v4', auth: authClient });
                
                // Пробуем прочитать таблицу для проверки доступа
                try {
                    await this.sheets.spreadsheets.get({
                        spreadsheetId: this.spreadsheetId,
                    });
                    console.log('✅ Доступ к Google Таблице подтвержден');
                } catch (testError) {
                    console.error('❌ Ошибка доступа к таблице:', testError.message);
                    if (testError.response && testError.response.data) {
                        console.error('Детали:', JSON.stringify(testError.response.data, null, 2));
                    }
                    this.initialized = false;
                    return;
                }
            } 
            // Если credentials переданы через переменную окружения (JSON строка)
            else if (process.env.GOOGLE_CREDENTIALS) {
                const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
                this.auth = new google.auth.GoogleAuth({
                    credentials: credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            }
            // Если есть ключ API (менее безопасно, но проще)
            else if (process.env.GOOGLE_API_KEY) {
                this.auth = new google.auth.GoogleAuth({
                    apiKey: process.env.GOOGLE_API_KEY,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            }
            else {
                console.warn('⚠️  Google Sheets credentials не настроены. Кросс-постинг в Google Sheets отключен.');
                this.initialized = false;
                return;
            }

            // Если sheets еще не создан (для других методов аутентификации)
            if (!this.sheets && this.auth) {
                const authClient = await this.auth.getClient();
                this.sheets = google.sheets({ version: 'v4', auth: authClient });
                
                // Проверяем доступ к таблице
                try {
                    await this.sheets.spreadsheets.get({
                        spreadsheetId: this.spreadsheetId,
                    });
                    console.log('✅ Доступ к Google Таблице подтвержден');
                } catch (testError) {
                    console.error('❌ Ошибка доступа к таблице:', testError.message);
                    if (testError.response && testError.response.data) {
                        console.error('Детали:', JSON.stringify(testError.response.data, null, 2));
                        console.error('\n📋 Возможные причины:');
                        console.error('1. Сервисный аккаунт не добавлен в таблицу');
                        console.error('2. Email сервисного аккаунта должен быть добавлен напрямую (не через общий доступ)');
                        console.error(`3. Убедитесь, что ${process.env.GOOGLE_CREDENTIALS ? 'credentials из переменной' : 'credentials.json'} содержат правильный email`);
                    }
                    this.initialized = false;
                    return;
                }
            }
            
            this.initialized = true;
            console.log('✅ Google Sheets API инициализирован');
        } catch (error) {
            console.error('❌ Ошибка при инициализации Google Sheets:', error.message);
            if (error.response && error.response.data) {
                console.error('Детали ошибки:', JSON.stringify(error.response.data, null, 2));
            }
            this.initialized = false;
        }
    }

    async addApplication(applicationData, applicationId) {
        // Ждём завершения инициализации, если она ещё не завершена
        if (this.initPromise) {
            await this.initPromise;
        }
        
        if (!this.initialized || !this.sheets) {
            console.warn('⚠️  Google Sheets не инициализирован. Пропускаем запись в таблицу.');
            return;
        }

        try {
            // Получаем текущие данные для определения следующей строки
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'A:A', // Проверяем колонку A для определения последней строки
            });

            const rows = response.data.values || [];
            const nextRow = rows.length + 1;

            // Подготавливаем данные строки
            const rowData = [
                applicationId || '',
                applicationData.telegram_id || '',
                applicationData.username || '',
                applicationData.first_name || '',
                applicationData.last_name || '',
                applicationData.phone_number || '',
                applicationData.age || '',
                applicationData.occupation || '',
                applicationData.interest_topic || '',
                applicationData.source || '',
                applicationData.language || 'ru',
                applicationData.subscribed_to_channel ? 'Да' : 'Нет',
                applicationData.rules_agreed ? 'Да' : 'Нет',
                applicationData.status || 'pending',
                new Date().toLocaleString('ru-RU'),
            ];

            // Записываем данные в таблицу
            await this.sheets.spreadsheets.values.append({
                spreadsheetId: this.spreadsheetId,
                range: `A${nextRow}:O${nextRow}`,
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [rowData],
                },
            });

            console.log(`✅ Заявка #${applicationId} успешно добавлена в Google Sheets (строка ${nextRow})`);
        } catch (error) {
            console.error('❌ Ошибка при записи в Google Sheets:', error.message);
            if (error.response && error.response.data) {
                console.error('Детали ошибки:', JSON.stringify(error.response.data, null, 2));
            }
            // Не прерываем выполнение, если ошибка с Google Sheets
        }
    }

    async updateApplicationStatus(applicationId, status) {
        // Ждём завершения инициализации, если она ещё не завершена
        if (this.initPromise) {
            await this.initPromise;
        }
        
        if (!this.initialized || !this.sheets) {
            return;
        }

        try {
            // Получаем все данные
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'A:O',
            });

            const rows = response.data.values || [];
            
            // Ищем строку с нужным ID заявки (в колонке A)
            for (let i = 0; i < rows.length; i++) {
                if (rows[i][0] == applicationId) {
                    const rowIndex = i + 1; // Google Sheets использует 1-based индексацию
                    
                    // Обновляем статус (колонка N, индекс 13)
                    await this.sheets.spreadsheets.values.update({
                        spreadsheetId: this.spreadsheetId,
                        range: `N${rowIndex}`,
                        valueInputOption: 'USER_ENTERED',
                        resource: {
                            values: [[status]],
                        },
                    });

                    console.log(`✅ Статус заявки #${applicationId} обновлен в Google Sheets`);
                    break;
                }
            }
        } catch (error) {
            console.error('❌ Ошибка при обновлении статуса в Google Sheets:', error.message);
            if (error.response && error.response.data) {
                console.error('Детали ошибки:', JSON.stringify(error.response.data, null, 2));
            }
        }
    }

    async ensureHeaders() {
        // Ждём завершения инициализации, если она ещё не завершена
        if (this.initPromise) {
            await this.initPromise;
        }
        
        if (!this.initialized || !this.sheets) {
            return;
        }

        try {
            // Проверяем, есть ли заголовки
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.spreadsheetId,
                range: 'A1:O1',
            });

            const rows = response.data.values || [];
            
            // Если заголовков нет, добавляем их
            if (rows.length === 0 || !rows[0] || rows[0].length === 0) {
                const headers = [
                    'ID',
                    'Telegram ID',
                    'Username',
                    'Имя',
                    'Фамилия',
                    'Телефон',
                    'Возраст',
                    'Род деятельности',
                    'Интересующая тема',
                    'Откуда узнали',
                    'Язык',
                    'Подписка на канал',
                    'Согласие с правилами',
                    'Статус',
                    'Дата создания'
                ];

                await this.sheets.spreadsheets.values.update({
                    spreadsheetId: this.spreadsheetId,
                    range: 'A1:O1',
                    valueInputOption: 'USER_ENTERED',
                    resource: {
                        values: [headers],
                    },
                });

                // Делаем заголовки жирными
                await this.sheets.spreadsheets.batchUpdate({
                    spreadsheetId: this.spreadsheetId,
                    resource: {
                        requests: [{
                            repeatCell: {
                                range: {
                                    sheetId: 0,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 0,
                                    endColumnIndex: 15,
                                },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: {
                                            bold: true,
                                        },
                                    },
                                },
                                fields: 'userEnteredFormat.textFormat.bold',
                            },
                        }],
                    },
                });

                console.log('✅ Заголовки добавлены в Google Sheets');
            }
        } catch (error) {
            console.error('❌ Ошибка при проверке заголовков Google Sheets:', error.message);
            if (error.response && error.response.data) {
                console.error('Детали ошибки:', JSON.stringify(error.response.data, null, 2));
            }
        }
    }
}

module.exports = GoogleSheets;

