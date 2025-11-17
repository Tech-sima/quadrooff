const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
    constructor() {
        this.db = new sqlite3.Database(process.env.DATABASE_PATH || './database.sqlite');
        this.init();
    }

    init() {
        this.db.serialize(() => {
            // Таблица для заявок
            this.db.run(`
                CREATE TABLE IF NOT EXISTS applications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id INTEGER NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    free_time TEXT,
                    first_month_goals TEXT,
                    sales_experience TEXT,
                    language TEXT,
                    subscribed_to_channel BOOLEAN DEFAULT 0,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    processed_at DATETIME,
                    admin_notes TEXT
                )
            `);

            // Гарантируем наличие недостающих колонок при обновлении схемы
            this.db.all("PRAGMA table_info(applications)", (err, rows) => {
                if (err || !rows) return;
                const columnNames = rows.map(r => r.name);
                const ensureColumn = (name, type) => {
                    if (!columnNames.includes(name)) {
                        this.db.run(`ALTER TABLE applications ADD COLUMN ${name} ${type}`, (alterErr) => {
                            if (alterErr && !alterErr.message.includes('duplicate column')) {
                                console.error(`Ошибка при добавлении колонки ${name}:`, alterErr);
                            }
                        });
                    }
                };
                ensureColumn('sales_experience', 'TEXT');
                ensureColumn('language', 'TEXT');
                ensureColumn('age', 'TEXT');
                ensureColumn('occupation', 'TEXT');
                ensureColumn('interest_topic', 'TEXT');
                ensureColumn('source', 'TEXT');
                ensureColumn('phone_number', 'TEXT');
                ensureColumn('rules_agreed', 'BOOLEAN');
            });

            // Таблица для админов
            this.db.run(`
                CREATE TABLE IF NOT EXISTS admins (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    telegram_id INTEGER UNIQUE NOT NULL,
                    username TEXT,
                    first_name TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `);
        });
    }

    // Добавить заявку
    addApplication(applicationData) {
        return new Promise((resolve, reject) => {
            const {
                telegram_id,
                username,
                first_name,
                last_name,
                phone_number,
                age,
                occupation,
                interest_topic,
                source,
                language,
                subscribed_to_channel,
                rules_agreed
            } = applicationData;

            this.db.run(
                `INSERT INTO applications 
                (telegram_id, username, first_name, last_name, phone_number, age, occupation, 
                 interest_topic, source, language, subscribed_to_channel, rules_agreed)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [telegram_id, username || null, first_name || null, last_name || null, 
                 phone_number || null, age || null, occupation || null, interest_topic || null, 
                 source || null, language || null, subscribed_to_channel ? 1 : 0, 
                 rules_agreed ? 1 : 0],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    }

    // Получить все заявки
    getAllApplications() {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM applications ORDER BY created_at DESC",
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    // Получить заявку по ID
    getApplicationById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT * FROM applications WHERE id = ?",
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    // Обновить статус заявки
    updateApplicationStatus(id, status, adminNotes = null) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "UPDATE applications SET status = ?, processed_at = CURRENT_TIMESTAMP, admin_notes = ? WHERE id = ?",
                [status, adminNotes, id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // Добавить админа
    addAdmin(telegram_id, username, first_name) {
        return new Promise((resolve, reject) => {
            this.db.run(
                "INSERT OR IGNORE INTO admins (telegram_id, username, first_name) VALUES (?, ?, ?)",
                [telegram_id, username, first_name],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    // Проверить, является ли пользователь админом
    isAdmin(telegram_id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                "SELECT * FROM admins WHERE telegram_id = ?",
                [telegram_id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    // Получить всех админов
    getAllAdmins() {
        return new Promise((resolve, reject) => {
            this.db.all(
                "SELECT * FROM admins",
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = Database;
