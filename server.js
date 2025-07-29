const express = require('express');
const db = require('./database.js');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const uploadsDir = './uploads';
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage: storage });

// --- API Endpoints ---

// LOGIN
app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    db.get("SELECT * FROM users WHERE email = ?", [email], (err, user) => {
        if (err) return res.status(500).json({ message: "Server xətası: " + err.message });
        if (!user) return res.status(404).json({ message: "İstifadəçi tapılmadı." });
        
        bcrypt.compare(password, user.password, (bcryptErr, isMatch) => {
            if (bcryptErr) return res.status(500).json({ message: "Şifrə yoxlanarkən xəta baş verdi." });
            if (!isMatch) return res.status(401).json({ message: "E-poçt və ya şifrə yanlışdır." });
            
            res.json({ message: "Giriş uğurludur!", user });
        });
    });
});

// GET USERS BY ROLE
app.get('/api/users/role/:role', (req, res) => {
    db.all("SELECT id, name, email FROM users WHERE role = ?", [req.params.role], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// ADD USER
app.post('/api/users/add', (req, res) => {
    const { name, email, password, role, parent_name, parent_contact, teacher_id, course_id } = req.body;
    if (!name || !email || !password || !role) return res.status(400).json({ message: "Ad, e-poçt, şifrə və rol mütləqdir." });
    if (role === 'student' && (!teacher_id || !course_id)) return res.status(400).json({ message: "Şagird üçün müəllim və kurs seçilməlidir." });

    bcrypt.hash(password, 10, (err, hash) => {
        if (err) return res.status(500).json({ message: "Şifrə yaradılarkən xəta baş verdi." });
        
        const sql = `INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`;
        db.run(sql, [name, email, hash, role], function(err) {
            if (err) {
                if (err.message.includes('UNIQUE constraint failed')) return res.status(409).json({ message: "Bu e-poçt artıq qeydiyyatdan keçib." });
                return res.status(500).json({ message: "İstifadəçi yaradıla bilmədi: " + err.message });
            }
            
            const newUserId = this.lastID;
            if (role === 'student') {
                const detailSql = `INSERT INTO student_details (user_id, parent_name, parent_contact, teacher_id, course_id) VALUES (?, ?, ?, ?, ?)`;
                db.run(detailSql, [newUserId, parent_name, parent_contact, teacher_id, course_id], (detailErr) => {
                    if (detailErr) {
                        db.run(`DELETE FROM users WHERE id = ?`, [newUserId]); // Rollback
                        return res.status(500).json({ message: "Şagird detalları yaradıla bilmədi." });
                    }
                    res.status(201).json({ message: `${role} uğurla yaradıldı!` });
                });
            } else {
                res.status(201).json({ message: `${role} uğurla yaradıldı!` });
            }
        });
    });
});

// DELETE USER
app.delete('/api/users/:id', (req, res) => {
    db.run(`DELETE FROM users WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ message: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "İstifadəçi tapılmadı." });
        res.json({ message: "İstifadəçi uğurla silindi." });
    });
});

// GET ALL STUDENTS WITH DETAILS
app.get('/api/students/with-details', (req, res) => {
    const sql = `
        SELECT s.id, s.name, s.email, sd.parent_name, t.name as teacher_name, c.name as course_name
        FROM users s 
        LEFT JOIN student_details sd ON s.id = sd.user_id 
        LEFT JOIN users t ON sd.teacher_id = t.id 
        LEFT JOIN courses c ON sd.course_id = c.id
        WHERE s.role = 'student'
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// GET TEACHER'S STUDENTS
app.get('/api/teachers/:id/students', (req, res) => {
    const sql = `SELECT u.id, u.name, sd.parent_name, sd.parent_contact FROM users u JOIN student_details sd ON u.id = sd.user_id WHERE sd.teacher_id = ? AND u.role = 'student'`;
    db.all(sql, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

// GET STUDENT DETAILS
app.get('/api/students/:id/details', (req, res) => {
    const sql = `SELECT u.id, u.name, u.email, sd.parent_name, sd.parent_contact FROM users u LEFT JOIN student_details sd ON u.id = sd.user_id WHERE u.id = ?`;
    db.get(sql, [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(row);
    });
});

// COURSES API
app.get('/api/courses', (req, res) => {
    const sql = `SELECT c.id, c.name, c.description, COUNT(sd.user_id) as student_count FROM courses c LEFT JOIN student_details sd ON c.id = sd.course_id GROUP BY c.id, c.name, c.description ORDER BY c.name;`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

app.get('/api/courses/:id/details', (req, res) => {
    const courseId = req.params.id;
    const responseData = { teachers: [], students: [] };

    const teachersSql = `SELECT DISTINCT u.id, u.name FROM users u JOIN student_details sd ON u.id = sd.teacher_id WHERE sd.course_id = ? AND u.role = 'teacher'`;
    db.all(teachersSql, [courseId], (err, teachers) => {
        if (err) return res.status(500).json({ message: err.message });
        responseData.teachers = teachers;

        const studentsSql = `SELECT u.id, u.name FROM users u JOIN student_details sd ON u.id = sd.user_id WHERE sd.course_id = ? AND u.role = 'student'`;
        db.all(studentsSql, [courseId], (err, students) => {
            if (err) return res.status(500).json({ message: err.message });
            responseData.students = students;
            res.json(responseData);
        });
    });
});

app.post('/api/courses/add', (req, res) => {
    const { name, description } = req.body;
    db.run(`INSERT INTO courses (name, description) VALUES (?, ?)`, [name, description], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) return res.status(409).json({ message: "Bu adda kurs artıq mövcuddur." });
            return res.status(500).json({ message: err.message });
        }
        res.status(201).json({ message: "Kurs uğurla yaradıldı!", courseId: this.lastID });
    });
});

app.delete('/api/courses/:id', (req, res) => {
    db.run(`DELETE FROM courses WHERE id = ?`, req.params.id, function(err) {
        if (err) return res.status(500).json({ message: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "Kurs tapılmadı." });
        res.json({ message: "Kurs uğurla silindi." });
    });
});

// LESSONS API
app.get('/api/lessons', (req, res) => {
    db.all("SELECT * FROM lessons ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

app.post('/api/lessons/upload', upload.single('lessonPdf'), (req, res) => {
    const { title, module } = req.body;
    db.run(`INSERT INTO lessons (title, module, file_path) VALUES (?, ?, ?)`, [title, module, req.file.path], (err) => {
        if (err) return res.status(500).json({ message: err.message });
        res.status(201).json({ message: "Dərs uğurla yükləndi!" });
    });
});

app.delete('/api/lessons/:id', (req, res) => {
    const id = req.params.id;
    db.get("SELECT file_path FROM lessons WHERE id = ?", [id], (err, row) => {
        if (row && row.file_path) {
            fs.unlink(path.join(__dirname, row.file_path), (unlinkErr) => {
                if (unlinkErr) console.error("Fayl silinərkən xəta:", unlinkErr);
            });
        }
    });
    db.run(`DELETE FROM lessons WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ message: err.message });
        if (this.changes === 0) return res.status(404).json({ message: "Dərs tapılmadı." });
        res.json({ message: "Dərs uğurla silindi." });
    });
});

// GRADES API
app.post('/api/grades/add', (req, res) => {
    const { student_id, assignment_name, grade, graded_by_teacher_id } = req.body;
    const date = new Date().toISOString().split('T')[0];
    db.run(`INSERT INTO grades (student_id, assignment_name, grade, graded_by_teacher_id, date) VALUES (?, ?, ?, ?, ?)`, [student_id, assignment_name, grade, graded_by_teacher_id, date], (err) => {
        if (err) return res.status(500).json({ message: err.message });
        res.status(201).json({ message: "Qiymət uğurla əlavə edildi!" });
    });
});
app.get('/api/grades/student/:id', (req, res) => {
    db.all(`SELECT * FROM grades WHERE student_id = ? ORDER BY date DESC`, [req.params.id], (err, rows) => {
        if (err) return res.status(500).json({ message: err.message });
        res.json(rows);
    });
});

app.listen(PORT, () => console.log(`Server http://localhost:${PORT} ünvanında işə düşdü.`));
