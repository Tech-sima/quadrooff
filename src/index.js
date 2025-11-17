require('dotenv').config();
const TelegramBotHandler = require('./bot');
const AdminPanel = require('./adminPanel');
const Database = require('./database');

class Application {
    constructor() {
        this.db = new Database();
        this.bot = new TelegramBotHandler();
        this.adminPanel = new AdminPanel();
    }

    async start() {
        try {
            // Проверяем наличие необходимых переменных окружения
            if (!process.env.TELEGRAM_BOT_TOKEN) {
                throw new Error('TELEGRAM_BOT_TOKEN не установлен в переменных окружения');
            }

            if (!process.env.ADMIN_TELEGRAM_ID) {
                console.warn('⚠️  ADMIN_TELEGRAM_ID не установлен. Админские функции будут недоступны.');
            }

            if (!process.env.APPROVED_CHAT_LINK) {
                console.warn('⚠️  APPROVED_CHAT_LINK не установлен. Ссылка на чат не будет отправляться при одобрении.');
            }

            // Запускаем админ панель
            const port = process.env.PORT || 3000;
            this.adminPanel.start(port);

            console.log('🚀 Приложение запущено успешно!');
            console.log(`📱 Telegram бот активен`);
            console.log(`🌐 Админ панель: http://localhost:${port}`);
            console.log(`📊 База данных: ${process.env.DATABASE_PATH || './database.sqlite'}`);

        } catch (error) {
            console.error('❌ Ошибка при запуске приложения:', error);
            process.exit(1);
        }
    }
}

// Обработка завершения процесса
process.on('SIGINT', () => {
    console.log('\n🛑 Получен сигнал завершения. Завершение работы...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Получен сигнал завершения. Завершение работы...');
    process.exit(0);
});

// Запуск приложения
const app = new Application();
app.start();
