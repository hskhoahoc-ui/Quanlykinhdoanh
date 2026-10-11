const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 3000;

// CẤU HÌNH SUPABASE TRỰC TIẾP
const SUPABASE_URL = 'https://irmjdaxejjxutvkxgwig.supabase.co';
const SUPABASE_KEY = 'sb_publishable_VvitTFe26BJnWm4dqdHr7g_eL6Z6Snt';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use(session({
    secret: 'nguyen-ngoc-diep-supabase-secret',
    resave: false,
    saveUninitialized: false
}));

// Tự động khởi tạo hoặc cập nhật tài khoản quản trị admin / 123456
async function initAdmin() {
    try {
        const { data: adminUser } = await supabase
            .from('users')
            .select('*')
            .eq('username', 'admin')
            .single();

        const hashedPassword = await bcrypt.hash('123456', 10);

        if (!adminUser) {
            await supabase.from('users').insert([
                { username: 'admin', password: hashedPassword, role: 'admin' }
            ]);
            console.log('Đã tạo tài khoản admin mặc định mới (mật khẩu: 123456).');
        } else {
            await supabase.from('users')
                .update({ password: hashedPassword, role: 'admin' })
                .eq('username', 'admin');
            console.log('Đã cập nhật mật khẩu tài khoản admin thành: 123456');
        }
    } catch (err) {
        console.log('Đang chờ kết nối cơ sở dữ liệu Supabase...', err.message);
    }
}
initAdmin();

// ================= ROUTER / ĐƯỜNG DẪN =================

// 1. Trang chủ công khai
app.get('/', async (req, res) => {
    try {
        const { data: solutions, error } = await supabase
            .from('solutions')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;
        res.render('index', { solutions: solutions || [] });
    } catch (err) {
        console.error('Lỗi lấy dữ liệu solutions:', err.message);
        res.render('index', { solutions: [] });
    }
});

// 2. Trang Đăng nhập
app.get('/login', (req, res) => {
    res.render('login', { error: null });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
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
    } catch (err) {
        res.render('login', { error: 'Lỗi hệ thống đăng nhập!' });
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
    
    try {
        const { data: solutions } = await supabase.from('solutions').select('*').order('id', { ascending: false });
        const { data: users } = await supabase.from('users').select('id, username, role');

        res.render('admin', { 
            user: req.session.user, 
            solutions: solutions || [], 
            users: users || []
        });
    } catch (err) {
        res.status(500).send("Lỗi tải trang quản trị");
    }
});

// --- Quản lý Giải pháp (Nhận link ảnh thay vì upload file) ---
app.post('/admin/solution/add', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { name, image, demo_link, catalog_link, phone, address } = req.body;

    await supabase.from('solutions').insert([
        { name, image, demo_link, catalog_link, phone, address }
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
            return res.send("Lỗi: Tên đăng nhập đã tồn tại hoặc lỗi hệ thống! <a href='/admin'>Quay lại</a>");
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
        return res.send("Không thể xóa tài khoản của chính bạn! <a href='/admin'>Quay lại</a>");
    }
    await supabase.from('users').delete().eq('id', id);
    res.redirect('/admin');
});

// --- Tính năng Đổi mật khẩu cá nhân ---
app.post('/admin/change-password', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { current_password, new_password } = req.body;
    
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', req.session.user.id)
            .single();

        if (error || !user) {
            return res.send("Không tìm thấy người dùng! <a href='/admin'>Quay lại</a>");
        }

        const match = await bcrypt.compare(current_password, user.password);
        if (!match) {
            return res.send("Mật khẩu hiện tại không chính xác! <a href='/admin'>Quay lại</a>");
        }

        const hashedNewPassword = await bcrypt.hash(new_password, 10);
        await supabase
            .from('users')
            .update({ password: hashedNewPassword })
            .eq('id', req.session.user.id);

        res.send("Đổi mật khẩu thành công! <a href='/admin'>Quay lại trang quản trị</a>");
    } catch (err) {
        res.status(500).send("Lỗi hệ thống khi đổi mật khẩu");
    }
});

// Khởi động server
app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng: ${PORT}`);
});
