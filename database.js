const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');

const db = new sqlite3.Database('./kodariun.db', (err) => {
    if (err) {
        console.error("Verilənlər bazasına qoşulma xətası:", err.message);
    } else {
        console.log("SQLite verilənlər bazasına uğurla qoşuldu.");
        createTables();
    }
});

function createTables() {
    db.serialize(() => {
        // 1. İstifadəçilər (users) cədvəli
        db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')) )`);
        
        // 2. Kurslar (courses) cədvəli
        db.run(`CREATE TABLE IF NOT EXISTS courses (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT)`);

        // 3. Şagirdlərin əlavə məlumatları üçün cədvəl
        db.run(`
            CREATE TABLE IF NOT EXISTS student_details (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                parent_name TEXT,
                parent_contact TEXT,
                course_id INTEGER,
                teacher_id INTEGER, 
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
                FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);
        
        // 4. Dərslər (lessons) cədvəli
        db.run(`CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, module TEXT, file_path TEXT)`);
        
        // 5. Qiymətlər (grades) cədvəli
        db.run(`CREATE TABLE IF NOT EXISTS grades (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, assignment_name TEXT NOT NULL, grade INTEGER NOT NULL, graded_by_teacher_id INTEGER NOT NULL, date TEXT NOT NULL, FOREIGN KEY (student_id) REFERENCES users(id), FOREIGN KEY (graded_by_teacher_id) REFERENCES users(id))`);

        // Standart admini kontrol et ve oluştur
        const adminEmail = 'admin@kodariun.com';
        db.get("SELECT * FROM users WHERE email = ?", [adminEmail], (err, row) => {
            if (!row) {
                bcrypt.hash('admin123', 10, (err, hash) => {
                    if (err) return;
                    db.run("INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)", ['Admin', adminEmail, hash, 'admin']);
                });
            }
        });
        console.log("Bütün cədvəllər uğurla yaradıldı və ya yoxlanıldı.");
    });
}

module.exports = db;
