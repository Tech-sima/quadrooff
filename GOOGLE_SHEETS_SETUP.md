# Настройка интеграции с Google Sheets

## Шаг 1: Создание сервисного аккаунта в Google Cloud Console

1. Перейдите на [Google Cloud Console](https://console.cloud.google.com/)
2. Создайте новый проект или выберите существующий
3. Включите Google Sheets API:
   - Перейдите в "APIs & Services" > "Library"
   - Найдите "Google Sheets API"
   - Нажмите "Enable"
4. Создайте сервисный аккаунт:
   - Перейдите в "APIs & Services" > "Credentials"
   - Нажмите "Create Credentials" > "Service Account"
   - Введите имя (например, "telegram-bot-sheets")
   - Нажмите "Create and Continue"
   - Выберите роль "Editor" или "Owner"
   - Нажмите "Done"
5. Создайте ключ:
   - Откройте созданный сервисный аккаунт
   - Перейдите на вкладку "Keys"
   - Нажмите "Add Key" > "Create new key"
   - Выберите формат JSON
   - Скачайте файл (например, `credentials.json`)

## Шаг 2: Предоставление доступа к Google Таблице

1. Откройте вашу Google Таблицу: https://docs.google.com/spreadsheets/d/1jY4y-MkYfDXuMHhR7f-IZ_MG10F1aOR-X1J9Efob7Pk/edit
2. Нажмите кнопку "Настроить доступ" (Share)
3. Скопируйте email адрес сервисного аккаунта из скачанного JSON файла (поле `client_email`)
4. Вставьте этот email в поле для предоставления доступа
5. Установите права доступа "Редактор" (Editor)
6. Нажмите "Отправить"

## Шаг 3: Настройка переменных окружения

Добавьте в файл `.env`:

```env
# Google Sheets Configuration
GOOGLE_SPREADSHEET_ID=1jY4y-MkYfDXuMHhR7f-IZ_MG10F1aOR-X1J9Efob7Pk

# Вариант 1: Путь к файлу с credentials (рекомендуется)
GOOGLE_CREDENTIALS_PATH=./credentials.json

# ИЛИ Вариант 2: Credentials в виде JSON строки
# GOOGLE_CREDENTIALS={"type":"service_account",...}
```

### Вариант 1: Использование файла credentials.json

1. Поместите скачанный JSON файл в корневую директорию проекта
2. Назовите его `credentials.json`
3. Добавьте `GOOGLE_CREDENTIALS_PATH=./credentials.json` в `.env`
4. **ВАЖНО**: Добавьте `credentials.json` в `.gitignore`, чтобы не закоммитить его в репозиторий!

### Вариант 2: Использование переменной окружения

1. Откройте скачанный JSON файл
2. Скопируйте всё его содержимое
3. Добавьте в `.env`: `GOOGLE_CREDENTIALS='{ваш JSON}'`
4. Удалите файл `credentials.json` или добавьте его в `.gitignore`

## Шаг 4: Структура таблицы

Таблица автоматически создаст заголовки при первом запуске:

| ID | Telegram ID | Username | Имя | Фамилия | Телефон | Возраст | Род деятельности | Интересующая тема | Откуда узнали | Язык | Подписка на канал | Согласие с правилами | Статус | Дата создания |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

## Проверка работы

После запуска бота:

1. При создании новой заявки она автоматически появится в Google Таблице
2. При изменении статуса заявки (одобрено/отклонено) статус обновится в таблице
3. В логах вы увидите:
   - `✅ Google Sheets API инициализирован`
   - `✅ Заголовки добавлены в Google Sheets` (при первом запуске)
   - `✅ Заявка #X успешно добавлена в Google Sheets (строка Y)`
   - `✅ Статус заявки #X обновлен в Google Sheets`

## Устранение проблем

### Ошибка: "The caller does not have permission"
- Убедитесь, что сервисный аккаунт имеет доступ к таблице
- Проверьте email сервисного аккаунта в JSON файле

### Ошибка: "Requested entity was not found"
- Проверьте правильность `GOOGLE_SPREADSHEET_ID` в `.env`
- Убедитесь, что таблица существует и доступна

### Ошибка: "File not found" при использовании GOOGLE_CREDENTIALS_PATH
- Проверьте, что путь к файлу указан правильно
- Используйте абсолютный путь или относительный от корня проекта

### Кросс-постинг не работает, но бот работает
- Проверьте логи на наличие ошибок Google Sheets API
- Убедитесь, что credentials настроены правильно
- Проверьте, что API включен в Google Cloud Console

## Безопасность

⚠️ **ВАЖНО**: Никогда не коммитьте файл `credentials.json` или переменную `GOOGLE_CREDENTIALS` в публичный репозиторий!

Добавьте в `.gitignore`:
```
credentials.json
*.json
!package*.json
```

