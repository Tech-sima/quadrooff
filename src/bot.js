const TelegramBot = require('node-telegram-bot-api');
const Database = require('./database');
const GoogleSheets = require('./googleSheets');
const { v4: uuidv4 } = require('uuid');

class TelegramBotHandler {
    constructor() {
        try {
            this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
            this.db = new Database();
            this.googleSheets = new GoogleSheets();
            this.userStates = new Map(); // Для отслеживания состояния пользователей
            this.getLanguage = (userInfo) => {
                const code = (userInfo && userInfo.language_code) ? userInfo.language_code.toLowerCase() : '';
                return code && code.startsWith('en') ? 'en' : 'ru';
            };
            
            // Обработка ошибок бота
            this.bot.on('error', (error) => {
                console.error('❌ Ошибка Telegram бота:', error.message);
            });
            
            this.bot.on('polling_error', (error) => {
                console.error('❌ Ошибка polling Telegram бота:', error.message);
            });
            
            this.setupHandlers();
            this.initializeAdmin();
            
            // Убеждаемся, что заголовки есть в таблице при запуске
            setTimeout(() => {
                this.googleSheets.ensureHeaders();
            }, 2000);
        } catch (error) {
            console.error('❌ Ошибка при инициализации Telegram бота:', error);
            throw error;
        }
    }

    async initializeAdmin() {
        // Добавляем админов в базу данных при запуске
        const adminIds = [
            process.env.ADMIN_TELEGRAM_ID,
            '5116399713',
            '5213074875',
            '1076521388'
        ].filter(id => id); // Убираем пустые значения

        for (const adminId of adminIds) {
            try {
                await this.db.addAdmin(adminId, 'admin', 'Admin');
                console.log(`✅ Админ ${adminId} добавлен в базу данных`);
            } catch (error) {
                console.log(`ℹ️  Админ ${adminId} уже существует в базе данных`);
            }
        }
    }

    setupHandlers() {
        // Команда /start
        this.bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const firstName = msg.from.first_name;
            
            // Если пользователь заполняет заявку, отменяем ее
            if (this.userStates.has(userId)) {
                this.userStates.delete(userId);
                this.bot.sendMessage(chatId, 'Предыдущая заявка отменена. Начинаем новую заявку.');
            }
            
            // Проверяем, является ли пользователь админом
            const isAdmin = await this.db.isAdmin(userId);
            
            if (isAdmin) {
                // Админ панель
                this.bot.sendMessage(chatId, 
                    `Привет, ${firstName}!\n\n` +
                    `Ты в админ-панели`,
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '📋 Осмотреть заявки', callback_data: 'admin_view_applications' }
                                ],
                                [
                                    { text: '📊 Статистика', callback_data: 'admin_stats' }
                                ],
                                [
                                    { text: '🚪 Выйти с админ панели', callback_data: 'admin_exit' }
                                ]
                            ]
                        }
                    }
                );
            } else {
                // Обычный пользователь: выбор языка
                this.bot.sendMessage(chatId,
                    'Выберите язык / Choose your language',
                    {
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    { text: '🇷🇺 Русский', callback_data: 'set_lang_ru' },
                                    { text: '🇬🇧 English', callback_data: 'set_lang_en' }
                                ]
                            ]
                        }
                    }
                );
            }
        });

        // Обработка callback кнопок
        this.bot.on('callback_query', async (callbackQuery) => {
            const message = callbackQuery.message;
            const data = callbackQuery.data;
            const chatId = message.chat.id;
            const userId = callbackQuery.from.id;

            try {
            if (data === 'start_application') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                this.startApplication(chatId, userId, callbackQuery.from);
            } else if (data === 'set_lang_ru') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                await this.startApplication(chatId, userId, callbackQuery.from, 'ru');
            } else if (data === 'set_lang_en') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                await this.startApplication(chatId, userId, callbackQuery.from, 'en');
                } else if (data === 'confirm_username') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleUsernameConfirm(chatId, userId);
                } else if (data === 'confirm_name') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleNameConfirmed(chatId, userId);
                } else if (data === 'enter_name') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleEnterName(chatId, userId);
                } else if (data.startsWith('age_')) {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleAgeSelection(chatId, userId, data);
                } else if (data.startsWith('occupation_')) {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleOccupationSelection(chatId, userId, data);
                } else if (data.startsWith('topic_')) {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleTopicSelection(chatId, userId, data);
                } else if (data.startsWith('source_') && data !== 'source_other') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleSourceSelection(chatId, userId, data);
                } else if (data === 'source_other') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    this.handleSourceOther(chatId, userId);
                } else if (data === 'subscribed') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    await this.handleSubscriptionConfirmation(chatId, userId);
                } else if (data === 'rules_agreed') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    await this.handleRulesAgreement(chatId, userId);
                } else if (data === 'rules_declined') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                    await this.handleRulesDeclined(chatId, userId);
                } else if (data === 'admin_view_applications') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                await this.handleAdminViewApplications(chatId, userId);
            } else if (data === 'admin_stats') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                await this.handleAdminStats(chatId, userId);
            } else if (data === 'admin_exit') {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                this.handleAdminExit(chatId, userId, callbackQuery.from);
            } else if (data.startsWith('approve_')) {
                this.handleAdminAction(callbackQuery, 'approved');
            } else if (data.startsWith('reject_')) {
                this.handleAdminAction(callbackQuery, 'rejected');
            } else if (data.startsWith('admin_back')) {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                await this.showAdminPanel(chatId, userId);
            } else if (data.startsWith('view_app_')) {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                await this.handleViewApplication(chatId, userId, data);
                } else {
                    this.bot.answerCallbackQuery(callbackQuery.id);
                }
            } catch (error) {
                console.error('Ошибка при обработке callback:', error);
                this.bot.answerCallbackQuery(callbackQuery.id, { text: 'Произошла ошибка', show_alert: true });
            }
        });

        // Обработка текстовых сообщений и контактов
        this.bot.on('message', (msg) => {
            const chatId = msg.chat.id;
            const userId = msg.from.id;
            const text = msg.text;
            const contact = msg.contact;

            // Пропускаем команды (они обрабатываются отдельно)
            if (text && text.startsWith('/')) {
                return;
            }

            // Проверяем, есть ли у пользователя активная форма
            if (this.userStates.has(userId)) {
                // Если получен контакт (номер телефона)
                if (contact) {
                    this.handleContactInput(chatId, userId, contact, msg.from);
                } else {
                    this.handleFormInput(chatId, userId, text, msg.from);
                }
            }
        });
    }

    async startApplication(chatId, userId, userInfo, preferredLanguage = null) {
        // Проверяем, не заполняет ли пользователь уже форму
        if (this.userStates.has(userId)) {
            this.bot.sendMessage(chatId, 'Вы уже заполняете заявку. Пожалуйста, завершите текущую заявку или нажмите /start для начала новой.');
            return;
        }

        // Инициализируем состояние пользователя
        const lang = preferredLanguage || this.getLanguage(userInfo);
        this.userStates.set(userId, {
            step: 'username',
            data: {
                telegram_id: userId,
                username: userInfo.username ? `@${userInfo.username}` : null,
                first_name: userInfo.first_name,
                last_name: userInfo.last_name,
                language: lang
            }
        });

        // Шаг 1: Укажите свой @username
        const intro = lang === 'en'
            ? '📋 Let\'s fill out the application.\n\n'
            : '📋 Давайте заполним заявку.\n\n';
        
        if (userInfo.username) {
            const usernameText = lang === 'en' 
                ? `Шаг 1/7: Your username: @${userInfo.username}\n\nIs this correct?`
                : `Шаг 1/7: Укажите свой @user\n\nВаш username: @${userInfo.username}\n\nЭто правильно?`;
            this.bot.sendMessage(chatId, intro + usernameText, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: lang === 'en' ? '✅ Yes, correct' : '✅ Да, верно', callback_data: 'confirm_username' }
                    ]]
                }
            });
        } else {
            const usernameText = lang === 'en'
                ? 'Шаг 1/7: Please enter your @username'
                : 'Шаг 1/7: Укажите свой @user';
            this.bot.sendMessage(chatId, intro + usernameText);
        }
    }

    handleContactInput(chatId, userId, contact, userInfo) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const { step, data } = userState;
        
        if (step === 'phone') {
            // Сохраняем номер телефона
            data.phone_number = contact.phone_number;
            userState.data = data;
            userState.step = 'name';
            this.userStates.set(userId, userState);
            
            const lang = data.language === 'en' ? 'en' : 'ru';
            const confirmMessage = lang === 'en'
                ? '✅ Phone number received'
                : '✅ Номер телефона получен';
            
            // Убираем клавиатуру
            this.bot.sendMessage(chatId, confirmMessage, {
                reply_markup: {
                    remove_keyboard: true
                }
            });
            
            // Переходим к шагу имени
            setTimeout(() => {
                this.handleNameConfirm(chatId, userId);
            }, 500);
        }
    }

    async handleFormInput(chatId, userId, text, userInfo) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const { step, data } = userState;
        const lang = data.language === 'en' ? 'en' : 'ru';

        switch (step) {
            case 'username':
                // Пользователь вводит username, если его нет в профиле
                if (text) {
                    if (text.startsWith('@')) {
                        data.username = text;
                    } else {
                        data.username = `@${text.replace('@', '')}`;
                    }
                    userState.data = data;
                    this.userStates.set(userId, userState);
                    this.handleUsernameConfirm(chatId, userId);
                }
                break;

            case 'name':
                // Пользователь вводит имя
                if (text) {
                    data.first_name = text;
                    userState.data = data;
                    this.userStates.set(userId, userState);
                    // Имя введено, переходим к возрасту
                    this.handleNameConfirmed(chatId, userId);
                }
                break;

            case 'source_other':
                // Пользователь вводит свой вариант источника
                if (text) {
                    data.source = text;
                    userState.data = data;
                    userState.step = 'subscribe_channel';
                    this.userStates.set(userId, userState);
                    this.requestSubscription(chatId, userId);
                }
                break;
        }
    }

    handleUsernameConfirm(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        userState.step = 'phone';
        this.userStates.set(userId, userState);
        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        
        // Шаг 2: Номер телефона
        const phoneText = lang === 'en'
            ? `Шаг 2/7: Please share your phone number`
            : `Шаг 2/7: Поделитесь номером телефона`;
        
        this.bot.sendMessage(chatId, phoneText, {
            reply_markup: {
                keyboard: [[
                    { 
                        text: lang === 'en' ? '📱 Share Phone Number' : '📱 Поделиться номером телефона',
                        request_contact: true
                    }
                ]],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
    }

    handleEnterName(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        userState.step = 'name';
        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        
        const message = lang === 'en'
            ? 'Please enter your name:'
            : 'Введите ваше имя:';
        
        this.bot.sendMessage(chatId, message);
        this.userStates.set(userId, userState);
    }

    handleNameConfirm(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        const nameValue = userState.data.first_name || '';
        const nameText = lang === 'en'
            ? `Шаг 3/7: What is your name?`
            : `Шаг 3/7: Имя`;
        
        // Если имя есть в профиле, показываем для подтверждения
        if (nameValue) {
            userState.step = 'name';
            this.userStates.set(userId, userState);
            const nameMessage = lang === 'en'
                ? `${nameText}\n\nYour name: ${nameValue}\n\nIs this correct?`
                : `${nameText}\n\nВаше имя: ${nameValue}\n\nЭто правильно?`;
            this.bot.sendMessage(chatId, nameMessage, {
                reply_markup: {
                    inline_keyboard: [[
                        { text: lang === 'en' ? '✅ Yes, correct' : '✅ Да, верно', callback_data: 'confirm_name' },
                        { text: lang === 'en' ? '✏️ Enter another' : '✏️ Ввести другое', callback_data: 'enter_name' }
                    ]]
                }
            });
        } else {
            // Имени нет, запрашиваем ввод
            userState.step = 'name';
            this.userStates.set(userId, userState);
            this.bot.sendMessage(chatId, nameText);
        }
    }

    handleNameConfirmed(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        // Имя подтверждено, переходим к возрасту
        userState.step = 'age';
        this.userStates.set(userId, userState);
        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        
        // Шаг 4: Возраст
        const ageText = lang === 'en'
            ? `Шаг 4/7: What is your age?`
            : `Шаг 4/7: Возраст`;
        
        this.bot.sendMessage(chatId, ageText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '16-18', callback_data: 'age_16-18' }],
                    [{ text: '18-25', callback_data: 'age_18-25' }],
                    [{ text: '25-35', callback_data: 'age_25-35' }],
                    [{ text: '35+', callback_data: 'age_35+' }]
                ]
            }
        });
    }

    handleAgeSelection(chatId, userId, data) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const age = data.replace('age_', '');
        userState.data.age = age;
        userState.step = 'occupation';
        const lang = userState.data.language === 'en' ? 'en' : 'ru';

        // Шаг 5: Род деятельности
        const occupationText = lang === 'en'
            ? `Шаг 5/7: What is your occupation?`
            : `Шаг 5/7: Род деятельности`;
        
        this.bot.sendMessage(chatId, occupationText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Бизнесмен/предприниматель Web2', callback_data: 'occupation_web2' }],
                    [{ text: 'Бизнесмен/предприниматель Web3', callback_data: 'occupation_web3' }],
                    [{ text: 'Инвестор', callback_data: 'occupation_investor' }],
                    [{ text: 'Разработчик', callback_data: 'occupation_developer' }],
                    [{ text: 'Крипто-энтузиаст', callback_data: 'occupation_crypto' }],
                    [{ text: 'Студент', callback_data: 'occupation_student' }],
                    [{ text: 'Иное', callback_data: 'occupation_other' }]
                ]
            }
        });

        this.userStates.set(userId, userState);
    }

    handleOccupationSelection(chatId, userId, data) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const occupationMap = {
            'occupation_web2': 'Бизнесмен/предприниматель Web2',
            'occupation_web3': 'Бизнесмен/предприниматель Web3',
            'occupation_investor': 'Инвестор',
            'occupation_developer': 'Разработчик',
            'occupation_crypto': 'Крипто-энтузиаст',
            'occupation_student': 'Студент',
            'occupation_other': 'Иное'
        };

        const occupation = occupationMap[data] || 'Иное';
        userState.data.occupation = occupation;
        userState.step = 'interest_topic';
        const lang = userState.data.language === 'en' ? 'en' : 'ru';

        // Шаг 6: Интересующая тема
        const topicText = lang === 'en'
            ? `Шаг 6/7: What topic interests you most?`
            : `Шаг 6/7: Какая тема для вас наиболее интересна`;
        
        this.bot.sendMessage(chatId, topicText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Web3 инструменты для бизнеса', callback_data: 'topic_web3_business' }],
                    [{ text: 'Крипта', callback_data: 'topic_crypto' }],
                    [{ text: 'AI', callback_data: 'topic_ai' }],
                    [{ text: 'Все', callback_data: 'topic_all' }]
                ]
            }
        });

        this.userStates.set(userId, userState);
    }

    handleTopicSelection(chatId, userId, data) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const topicMap = {
            'topic_web3_business': 'Web3 инструменты для бизнеса',
            'topic_crypto': 'Крипта',
            'topic_ai': 'AI',
            'topic_all': 'Все'
        };

        const topic = topicMap[data] || 'Все';
        userState.data.interest_topic = topic;
        userState.step = 'source';
        const lang = userState.data.language === 'en' ? 'en' : 'ru';

        // Шаг 7: Откуда узнали о мероприятии
        const sourceText = lang === 'en'
            ? `Шаг 7/7: Where did you learn about the event?`
            : `Шаг 7/7: Откуда узнали о мероприятии`;
        
        this.bot.sendMessage(chatId, sourceText, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Социальные сети', callback_data: 'source_social' }],
                    [{ text: 'Рекомендация друга', callback_data: 'source_friend' }],
                    [{ text: 'Реклама', callback_data: 'source_ads' }],
                    [{ text: 'Поиск в интернете', callback_data: 'source_search' }],
                    [{ text: 'Другое', callback_data: 'source_other' }]
                ]
            }
        });

        this.userStates.set(userId, userState);
    }

    handleSourceSelection(chatId, userId, data) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const sourceMap = {
            'source_social': 'Социальные сети',
            'source_friend': 'Рекомендация друга',
            'source_ads': 'Реклама',
            'source_search': 'Поиск в интернете'
        };

        const source = sourceMap[data] || 'Другое';
        userState.data.source = source;
        userState.step = 'subscribe_channel';
        this.userStates.set(userId, userState);
        
        // Переходим к проверке подписки
        this.requestSubscription(chatId, userId);
    }

    handleSourceOther(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        userState.step = 'source_other';
        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        
        const message = lang === 'en'
            ? 'Please specify where you learned about the event:'
            : 'Укажите, откуда вы узнали о мероприятии:';
        
        this.bot.sendMessage(chatId, message);
        this.userStates.set(userId, userState);
    }

    async showAdminPanel(chatId, userId) {
        const isAdmin = await this.db.isAdmin(userId);
        if (!isAdmin) {
            this.bot.sendMessage(chatId, 'У вас нет прав для доступа к админ панели.');
            return;
        }

        this.bot.sendMessage(chatId, 
            `Привет!\n\n` +
            `Ты в админ-панели`,
            {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📋 Осмотреть заявки', callback_data: 'admin_view_applications' }
                        ],
                        [
                            { text: '📊 Статистика', callback_data: 'admin_stats' }
                        ],
                        [
                            { text: '🚪 Выйти с админ панели', callback_data: 'admin_exit' }
                        ]
                    ]
                }
            }
        );
    }

    async handleAdminViewApplications(chatId, userId) {
        const isAdmin = await this.db.isAdmin(userId);
        if (!isAdmin) {
            this.bot.sendMessage(chatId, 'У вас нет прав для доступа к админ панели.');
            return;
        }

        try {
            const applications = await this.db.getAllApplications();
            
            if (applications.length === 0) {
                this.bot.sendMessage(chatId, 
                    '📋 Заявок пока нет.\n\nНовые заявки появятся здесь.',
                    {
                        reply_markup: {
                            inline_keyboard: [[
                                { text: '🔙 Назад', callback_data: 'admin_back' }
                            ]]
                        }
                    }
                );
                return;
            }

            // Показываем первые 5 заявок
            const recentApplications = applications.slice(0, 5);
            let message = '📋 **Последние заявки:**\n\n';

            recentApplications.forEach((app, index) => {
                const status = app.status === 'pending' ? '⏳ Ожидает' : 
                              app.status === 'approved' ? '✅ Одобрена' : '❌ Отклонена';
                message += `${index + 1}. #${app.id} - ${app.first_name} - ${status}\n`;
            });

            if (applications.length > 5) {
                message += `\n... и еще ${applications.length - 5} заявок`;
            }

            // Создаем кнопки для каждой заявки
            const keyboard = [];
            recentApplications.forEach((app, index) => {
                keyboard.push([
                    { text: `👁️ Заявка #${app.id}`, callback_data: `view_app_${app.id}` }
                ]);
            });

            keyboard.push(
                [
                    { text: '📊 Статистика', callback_data: 'admin_stats' }
                ],
                [
                    { text: '🔙 Назад', callback_data: 'admin_back' }
                ]
            );

            this.bot.sendMessage(chatId, message, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Ошибка при получении заявок:', error);
            this.bot.sendMessage(chatId, 'Произошла ошибка при получении заявок.');
        }
    }

    async handleAdminStats(chatId, userId) {
        const isAdmin = await this.db.isAdmin(userId);
        if (!isAdmin) {
            this.bot.sendMessage(chatId, 'У вас нет прав для доступа к админ панели.');
            return;
        }

        try {
            const applications = await this.db.getAllApplications();
            const stats = {
                total: applications.length,
                pending: applications.filter(app => app.status === 'pending').length,
                approved: applications.filter(app => app.status === 'approved').length,
                rejected: applications.filter(app => app.status === 'rejected').length
            };

            const message = 
                `📊 Статистика заявок:\n\n` +
                `📋 Всего заявок: ${stats.total}\n` +
                `⏳ Ожидают: ${stats.pending}\n` +
                `✅ Одобрены: ${stats.approved}\n` +
                `❌ Отклонены: ${stats.rejected}\n\n` +
                `📅 Обновлено: ${new Date().toLocaleString('ru-RU')}`;

            this.bot.sendMessage(chatId, message, {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: '📋 Заявки', callback_data: 'admin_view_applications' }
                        ],
                        [
                            { text: '🔙 Назад', callback_data: 'admin_back' }
                        ]
                    ]
                }
            });

        } catch (error) {
            console.error('Ошибка при получении статистики:', error);
            this.bot.sendMessage(chatId, 'Произошла ошибка при получении статистики.');
        }
    }

    handleAdminExit(chatId, userId, userInfo) {
        this.bot.sendMessage(chatId, 
            `Привет!\n\n` +
            `Ты уже на первом шагу для вступления в W3B сообщество\n\n` +
            `Заполни заявку и мы ответим в течение суток`,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: '📝 Подать заявку', callback_data: 'start_application' }
                    ]]
                }
            }
        );
    }

    async handleViewApplication(chatId, userId, data) {
        const isAdmin = await this.db.isAdmin(userId);
        if (!isAdmin) {
            this.bot.sendMessage(chatId, 'У вас нет прав для доступа к админ панели.');
            return;
        }

        const applicationId = data.split('_')[2];
        
        try {
            const application = await this.db.getApplicationById(applicationId);
            if (!application) {
                this.bot.sendMessage(chatId, 'Заявка не найдена.');
                return;
            }

            const status = application.status === 'pending' ? '⏳ Ожидает' : 
                          application.status === 'approved' ? '✅ Одобрена' : '❌ Отклонена';

            const message = 
                `📋 Заявка #${application.id}\n\n` +
                `👤 Клиент: ${application.first_name || '—'} ${application.last_name || ''}\n` +
                `📱 Username: ${application.username || '—'}\n` +
                `📞 Телефон: ${application.phone_number || '—'}\n` +
                `🎂 Возраст: ${application.age || '—'}\n` +
                `💼 Род деятельности: ${application.occupation || '—'}\n` +
                `🎯 Интересующая тема: ${application.interest_topic || '—'}\n` +
                `📢 Откуда узнали: ${application.source || '—'}\n` +
                `✅ Согласие с правилами: ${application.rules_agreed ? 'Да' : 'Нет'}\n` +
                `📊 Статус: ${status}\n` +
                `📅 Дата: ${new Date(application.created_at).toLocaleString('ru-RU')}`;

            const keyboard = [];
            
            if (application.status === 'pending') {
                keyboard.push([
                    { text: '✅ Одобрить', callback_data: `approve_${applicationId}` },
                    { text: '❌ Отклонить', callback_data: `reject_${applicationId}` }
                ]);
            }
            
            keyboard.push([
                { text: '🔙 Назад к заявкам', callback_data: 'admin_view_applications' }
            ]);

            this.bot.sendMessage(chatId, message, {
                reply_markup: {
                    inline_keyboard: keyboard
                }
            });

        } catch (error) {
            console.error('Ошибка при получении заявки:', error);
            this.bot.sendMessage(chatId, 'Произошла ошибка при получении заявки.');
        }
    }

    requestSubscription(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        const channelUsername = process.env.CHANNEL_USERNAME || 'QuadroAgency';
        
        const title = lang === 'en'
            ? '📢 Подпишитесь на наш канал:'
            : '📢 Подпишитесь на наш канал:';
        const btnSub = lang === 'en'
            ? `📢 Subscribe to @${channelUsername}`
            : `📢 Подписаться на @${channelUsername}`;
        const btnDone = lang === 'en' ? '✅ I have subscribed' : '✅ Я подписался';
        
        this.bot.sendMessage(chatId, title, {
            reply_markup: {
                inline_keyboard: [
                    [ { text: btnSub, url: `https://t.me/${channelUsername}` } ],
                    [ { text: btnDone, callback_data: 'subscribed' } ]
                ]
            }
        });
    }

    async handleSubscriptionConfirmation(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState || userState.step !== 'subscribe_channel') {
            this.bot.sendMessage(chatId, 'Пожалуйста, сначала заполните заявку полностью.');
            return;
        }

        const channelUsername = process.env.CHANNEL_USERNAME || 'QuadroAgency';
        try {
            const member = await this.bot.getChatMember(`@${channelUsername}`, userId);
            const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);

            if (!isSubscribed) {
                const lang = userState.data.language === 'en' ? 'en' : 'ru';
                const notSub = lang === 'en'
                    ? 'It looks like you have not subscribed to the channel yet. Please subscribe and press the button below.'
                    : 'Похоже, вы еще не подписаны на канал. Пожалуйста, подпишитесь и нажмите кнопку ниже.';
                this.bot.sendMessage(chatId, notSub, {
                    reply_markup: {
                        inline_keyboard: [
                            [ { text: (lang === 'en' ? `📢 Subscribe to @${channelUsername}` : `📢 Подписаться на @${channelUsername}`), url: `https://t.me/${channelUsername}` } ],
                            [ { text: (lang === 'en' ? '✅ I have subscribed' : '✅ Я подписался'), callback_data: 'subscribed' } ]
                        ]
                    }
                });
                return;
            }

            // Пользователь подписан, переходим к ознакомлению с правилами
            userState.data.subscribed_to_channel = true;
            userState.step = 'rules';
            this.userStates.set(userId, userState);
            this.requestRulesAgreement(chatId, userId);
        } catch (err) {
            console.error('Ошибка при проверке подписки:', err);
            // Если бот не админ канала или не может проверить, продолжаем, но помечаем как неподтверждено
            userState.data.subscribed_to_channel = false;
            userState.step = 'rules';
            this.userStates.set(userId, userState);
            this.requestRulesAgreement(chatId, userId);
        }
    }

    requestRulesAgreement(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        
        const message = lang === 'en'
            ? 'Правила сообщества: Ознакомиться (https://w3b-belarus-rbiobym.gamma.site/)\n\nЗаполняя эту форму Вы даете согласие на обработку персональных данных и соглашаетесь с правилами сообщества @W3Belarus.'
            : 'Правила сообщества: Ознакомиться (https://w3b-belarus-rbiobym.gamma.site/)\n\nОтправляя эту форму Вы даете согласие на обработку персональных данных и соглашаетесь с правилами сообщества @W3Belarus.';
        
        this.bot.sendMessage(chatId, message, {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: lang === 'en' ? '✅ Ознакомился' : '✅ Ознакомился', callback_data: 'rules_agreed' }
                    ]
                ]
            }
        });
    }

    async handleRulesAgreement(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState || userState.step !== 'rules') {
            this.bot.sendMessage(chatId, 'Пожалуйста, сначала заполните форму полностью.');
            return;
        }

        // Пользователь согласился с правилами, отправляем заявку
        userState.data.rules_agreed = true;
        await this.submitApplication(chatId, userId, userState.data);
    }

    async handleRulesDeclined(chatId, userId) {
        const userState = this.userStates.get(userId);
        if (!userState) return;

        const lang = userState.data.language === 'en' ? 'en' : 'ru';
        
        const message = lang === 'en'
            ? 'К сожалению, без согласия с правилами сообщества мы не можем принять вашу заявку. Если передумаете, начните заполнение формы заново командой /start'
            : 'К сожалению, без согласия с правилами сообщества мы не можем принять вашу заявку. Если передумаете, начните заполнение формы заново командой /start';
        
        this.bot.sendMessage(chatId, message);
        
        // Очищаем состояние пользователя
        this.userStates.delete(userId);
    }

    async submitApplication(chatId, userId, applicationData) {
        try {
            // Сохраняем заявку в базу данных
            const applicationId = await this.db.addApplication(applicationData);
            
            // Добавляем заявку в Google Sheets (не блокируем основное выполнение)
            this.googleSheets.addApplication(applicationData, applicationId).catch(err => {
                console.error('Ошибка при записи в Google Sheets (не критично):', err.message);
            });
            
            // Отправляем подтверждение пользователю
            this.bot.sendMessage(chatId, 
                '✅ Заявка успешно отправлена!\n\n' +
                'Спасибо за интерес к нашему W3B сообществу. Мы рассмотрим вашу заявку ' +
                'и свяжемся с вами в ближайшее время.\n\n' +
                'Номер заявки: #' + applicationId
            );

            // Уведомляем админов
            await this.notifyAdmins(applicationId, applicationData);

            // Очищаем состояние пользователя
            this.userStates.delete(userId);

        } catch (error) {
            console.error('Ошибка при сохранении заявки:', error);
            this.bot.sendMessage(chatId, 
                '❌ Произошла ошибка при отправке заявки. Попробуйте еще раз или обратитесь в поддержку.'
            );
        }
    }

    async notifyAdmins(applicationId, applicationData) {
        try {
            const admins = await this.db.getAllAdmins();
            if (!admins || admins.length === 0) {
                console.log('⚠️  Админы не найдены в базе данных');
                return;
            }

            const message = 
                `🔔 Новая заявка #${applicationId}\n\n` +
                `👤 Клиент: ${applicationData.first_name || '—'} ${applicationData.last_name || ''}\n` +
                `📱 Username: ${applicationData.username || '—'}\n` +
                `📞 Телефон: ${applicationData.phone_number || '—'}\n` +
                `🎂 Возраст: ${applicationData.age || '—'}\n` +
                `💼 Род деятельности: ${applicationData.occupation || '—'}\n` +
                `🎯 Интересующая тема: ${applicationData.interest_topic || '—'}\n` +
                `📢 Откуда узнали: ${applicationData.source || '—'}\n` +
                `🌍 Язык: ${applicationData.language || '—'}\n` +
                `✅ Согласие с правилами: ${applicationData.rules_agreed ? 'Да' : 'Нет'}\n\n` +
                `📅 Дата: ${new Date().toLocaleString('ru-RU')}`;

            const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [
                        { text: '✅ Одобрить', callback_data: `approve_${applicationId}` },
                        { text: '❌ Отклонить', callback_data: `reject_${applicationId}` }
                    ]
                ]
            }
            };

            // Отправляем уведомление всем админам
            for (const admin of admins) {
                try {
                    await this.bot.sendMessage(admin.telegram_id, message, keyboard);
                } catch (error) {
                    console.error(`Ошибка при отправке уведомления админу ${admin.telegram_id}:`, error.message);
                }
            }
        } catch (error) {
            console.error('Ошибка при уведомлении админов:', error);
        }
    }

    async handleAdminAction(callbackQuery, action) {
        const callbackData = callbackQuery.data;
        const applicationId = callbackData.split('_')[1];
        
        try {
            // Получаем заявку
            const application = await this.db.getApplicationById(applicationId);
            if (!application) {
                console.error('Заявка не найдена:', applicationId);
                return;
            }

            // Обновляем статус
            await this.db.updateApplicationStatus(applicationId, action);

            // Обновляем статус в Google Sheets
            this.googleSheets.updateApplicationStatus(applicationId, action).catch(err => {
                console.error('Ошибка при обновлении статуса в Google Sheets (не критично):', err.message);
            });

            // Отправляем уведомление пользователю
            if (action === 'approved') {
                const isEnglish = (application.language || '').toLowerCase().startsWith('en');
                const message = isEnglish
                    ? (
                        'Поздравляем, Ваша заявка одобрена ✅\n\n' +
                        'Спасибо, что Вы с нами и до встречи на мероприятии 😒\n\n' +
                        'Если остались вопросы - пишите, с радостью ответим 🤝'
                    )
                    : (
                        'Поздравляем, Ваша заявка одобрена ✅\n\n' +
                        'Спасибо, что Вы с нами и до встречи на мероприятии 😒\n\n' +
                        'Если остались вопросы - пишите, с радостью ответим 🤝'
                    );
                this.bot.sendMessage(application.telegram_id, message);
            } else {
                this.bot.sendMessage(application.telegram_id, 
                    '😔 К сожалению, ваша заявка была отклонена\n\n' +
                    'Спасибо за интерес к нашему W3B сообществу. ' +
                    'Возможно, в будущем у нас будет возможность для участия.\n\n' +
                    'Если у вас есть вопросы, вы всегда можете обратиться в поддержку.'
                );
            }

            // Подтверждаем админу
            this.bot.answerCallbackQuery(callbackQuery.id, {
                text: action === 'approved' ? 'Заявка одобрена!' : 'Заявка отклонена!'
            });

            // Обновляем сообщение админа: убираем кнопки и добавляем отметку
            const adminChatId = callbackQuery.message.chat.id;
            const adminMessageId = callbackQuery.message.message_id;
            const originalText = callbackQuery.message.text || '';
            const statusLine = action === 'approved' ? '✅ Вы одобрили эту заявку' : '❌ Вы отклонили эту заявку';
            const updatedText = `${originalText}\n\n${statusLine}`;

            try {
                await this.bot.editMessageText(updatedText, {
                    chat_id: adminChatId,
                    message_id: adminMessageId
                });
            } catch (e) {
                console.error('Не удалось обновить сообщение админа:', e);
                // как fallback — просто уберем клавиатуру
                try {
                    await this.bot.editMessageReplyMarkup({ inline_keyboard: [] }, {
                        chat_id: adminChatId,
                        message_id: adminMessageId
                    });
                } catch (e2) {
                    console.error('Не удалось убрать клавиатуру у сообщения админа:', e2);
                }
            }

        } catch (error) {
            console.error('Ошибка при обработке действия админа:', error);
        }
    }

    // Команда для админов - просмотр заявок
    async handleAdminCommand(chatId, command) {
        const isAdmin = await this.db.isAdmin(chatId);
        if (!isAdmin) {
            this.bot.sendMessage(chatId, 'У вас нет прав для выполнения этой команды.');
            return;
        }

        if (command === '/applications') {
            try {
                const applications = await this.db.getAllApplications();
                if (applications.length === 0) {
                    this.bot.sendMessage(chatId, 'Заявок пока нет.');
                    return;
                }

                let message = '📋 Все заявки:\n\n';
                applications.forEach(app => {
                    const status = app.status === 'pending' ? '⏳ Ожидает' : 
                                  app.status === 'approved' ? '✅ Одобрена' : '❌ Отклонена';
                    message += `#${app.id} - ${app.first_name || '—'} - ${status}\n`;
                });

                this.bot.sendMessage(chatId, message);
            } catch (error) {
                console.error('Ошибка при получении заявок:', error);
                this.bot.sendMessage(chatId, 'Произошла ошибка при получении заявок.');
            }
        }
    }
}

module.exports = TelegramBotHandler;
