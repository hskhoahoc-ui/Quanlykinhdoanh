const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CẤU HÌNH SUPABASE (Thay thông tin Project của bạn vào đây)
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // Ví dụ: https://xyz.supabase.co
const SUPABASE_KEY = 'YOUR_SUPABASE_SERVICE_ROLE_KEY'; // Khóa bảo mật (Service Role Key hoặc Anon Key)
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cấu hình lưu trữ ảnh upload tạm thời (Lưu ý: trên production thực tế có thể đẩy thẳng lên Supabase Storage)
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'public/uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'nguyen-ngoc-diep-supabase-secret',
    resave: false,
    saveUninitialized: false
}));

// Khởi tạo tài khoản Admin mặc định nếu chưa tồn tại trong Supabase
async function initAdmin() {
    const { data: adminUser } = await supabase
        .from('users')
        .select('*')
        .eq('username', 'admin')
        .single();

    if (!adminUser) {
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await supabase.from('users').insert([
            { username: 'admin', password: hashedPassword, role: 'admin' }
        ]);
        console.log('Đã tạo tài khoản admin mặc định thành công trên Supabase.');
    }
}
initAdmin();

// ================= ROUTER =================

// 1. Trang chủ công khai
app.get('/', async (req, res) => {
    const { data: solutions, error } = await supabase
        .from('solutions')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('Lỗi lấy dữ liệu solutions:', error.message);
        return res.status(500).send("Lỗi kết nối cơ sở dữ liệu Supabase");
    }
    res.render('index', { solutions: solutions || [] });
});

// 2. Trang Đăng nhập
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

    if (error || !user) {
        return res.render('login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng!' });
    }

    const match = await bcrypt.compare(password, user.password);
    if (match) {
        req.session.user = user;
        res.redirect('/admin');
    } else {
        res.render('login', { error: 'Tên đăng nhập hoặc mật khẩu không đúng!' });
    }
});

// 3. Đăng xuất
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// 4. Trang Quản trị (Admin & Nhân viên)
app.get('/admin', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    const { data: solutions } = await supabase.from('solutions').select('*').order('id', { ascending: false });
    const { data: users } = await supabase.from('users').select('id, username, role');

    res.render('admin', { 
        user: req.session.user, 
        solutions: solutions || [], 
        users: users || []
    });
});

// --- Quản lý Giải pháp (Cả Admin và Nhân viên) ---
app.post('/admin/solution/add', upload.single('image'), async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { name, demo_link, catalog_link } = req.body;
    const image = req.file ? `/uploads/${req.file.filename}` : '';

    await supabase.from('solutions').insert([
        { name, image, demo_link, catalog_link }
    ]);
    res.redirect('/admin');
});

app.post('/admin/solution/delete/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const id = req.params.id;
    await supabase.from('solutions').delete().eq('id', id);
    res.redirect('/admin');
});

// --- Quản lý Nhân viên (CHỈ ADMIN MỚI CÓ QUYỀN) ---
app.post('/admin/user/add', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send("Bạn không có quyền thực hiện thao tác này!");
    }
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const { error } = await supabase.from('users').insert([
            { username, password: hashedPassword, role: 'staff' }
        ]);
        if (error) {
            return res.send("Lỗi: Tên đăng nhập đã tồn tại hoặc lỗi hệ thống!");
        }
        res.redirect('/admin');
    } catch (e) {
        res.status(500).send("Lỗi hệ thống");
    }
});

app.post('/admin/user/delete/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send("Bạn không có quyền thực hiện thao tác này!");
    }
    const id = req.params.id;
    if (id == req.session.user.id) {
        return res.send("Không thể xóa tài khoản của chính bạn!");
    }
    await supabase.from('users').delete().eq('id', id);
    res.redirect('/admin');
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server kết nối Supabase đang chạy tại: http://localhost:${PORT}`);
});