const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const multer = require('multer');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CẤU HÌNH SUPABASE TRỰC TIẾP (AN TOÀN TUYỆT ĐỐI, KHÔNG SỢ LỖI BIẾN MÔI TRƯỜNG)
const SUPABASE_URL = 'https://irmjdaxejjxutvkxgwig.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_VvitTFe26BJnWm4dqdHr7g_eL6Z6Snt'; 
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cấu hình lưu trữ ảnh upload tạm thời
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

// Khởi tạo tài khoản Admin mặc định và Settings nếu chưa tồn tại trong Supabase
async function initDatabase() {
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

    const { data: settingsData } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();

    if (!settingsData) {
        await supabase.from('settings').insert([
            { id: 1, phone: '0852130163', address: '153E/8 Trần Hưng Đạo P.Bình Đức An Giang' }
        ]);
    }
}
initDatabase();

// ================= ROUTER =================

// 1. Trang chủ công khai
app.get('/', async (req, res) => {
    const { data: solutions, error } = await supabase
        .from('solutions')
        .select('*')
        .order('id', { ascending: false });

    const { data: settings } = await supabase
        .from('settings')
        .select('*')
        .eq('id', 1)
        .single();

    if (error) {
        console.error('Lỗi lấy dữ liệu solutions:', error.message);
    }
    
    res.render('index', { 
        solutions: solutions || [], 
        settings: settings || {} 
    });
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
    const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();

    res.render('admin', { 
        user: req.session.user, 
        solutions: solutions || [], 
        users: users || [],
        settings: settings || {}
    });
});

// --- Cài đặt tiêu đề (SĐT & Địa chỉ) ---
app.post('/admin/settings/update', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { phone, address } = req.body;
    await supabase.from('settings').update({ phone, address }).eq('id', 1);
    res.redirect('/admin');
});

// --- Đổi mật khẩu cá nhân ---
app.post('/admin/change-password', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { current_password, new_password } = req.body;
    
    const { data: user } = await supabase.from('users').select('*').eq('id', req.session.user.id).single();
    const match = await bcrypt.compare(current_password, user.password);
    
    if (!match) {
        return res.send("Mật khẩu hiện tại không chính xác!");
    }
    
    const hashedPassword = await bcrypt.hash(new_password, 10);
    await supabase.from('users').update({ password: hashedPassword }).eq('id', user.id);
    res.redirect('/admin');
});

// --- Quản lý Giải pháp (Thêm mới có giá ⭐ & Sửa thông tin cơ bản) ---
app.post('/admin/solution/add', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { name, image, demo_link, catalog_link, price } = req.body;

    await supabase.from('solutions').insert([
        { name, image, demo_link, catalog_link, price }
    ]);
    res.redirect('/admin');
});

app.post('/admin/solution/update/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const id = req.params.id;
    const { name, image, demo_link, catalog_link } = req.body;

    await supabase.from('solutions').update({
        name, image, demo_link, catalog_link
    }).eq('id', id);

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
