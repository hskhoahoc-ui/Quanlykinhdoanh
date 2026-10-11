const express = require('express');
const session = require('express-session');
const { createClient } = require('@supabase/supabase-js');
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

// Khởi tạo tài khoản admin mặc định
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
        } else {
            await supabase.from('users')
                .update({ password: hashedPassword, role: 'admin' })
                .eq('username', 'admin');
        }
    } catch (err) {
        console.log('Đang chờ kết nối Supabase...', err.message);
    }
}
initAdmin();

// ================= ROUTER / ĐƯỜNG DẪN =================

// 1. Trang chủ công khai
app.get('/', async (req, res) => {
    try {
        const { data: solutions } = await supabase.from('solutions').select('*').order('id', { ascending: false });
        const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();

        res.render('index', { 
            solutions: solutions || [], 
            settings: settings || { phone: '', address: '' } 
        });
    } catch (err) {
        res.render('index', { solutions: [], settings: { phone: '', address: '' } });
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

// 4. Trang Quản trị
app.get('/admin', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    
    try {
        const { data: solutions } = await supabase.from('solutions').select('*').order('id', { ascending: false });
        const { data: users } = await supabase.from('users').select('id, username, role');
        const { data: settings } = await supabase.from('settings').select('*').eq('id', 1).single();

        res.render('admin', { 
            user: req.session.user, 
            solutions: solutions || [], 
            users: users || [],
            settings: settings || { phone: '', address: '' }
        });
    } catch (err) {
        res.status(500).send("Lỗi tải trang quản trị");
    }
});

// --- Cập nhật thông tin Tiêu đề (SĐT & Địa chỉ) ---
app.post('/admin/settings/update', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { phone, address } = req.body;
    await supabase.from('settings').update({ phone, address }).eq('id', 1);
    res.redirect('/admin');
});

// --- Thêm giải pháp mới (Dùng Link ảnh) ---
app.post('/admin/solution/add', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { name, image, demo_link, catalog_link } = req.body;

    await supabase.from('solutions').insert([
        { name, image, demo_link, catalog_link }
    ]);
    res.redirect('/admin');
});

// --- Cập nhật (Sửa) giải pháp ---
app.post('/admin/solution/update/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const id = req.params.id;
    const { name, image, demo_link, catalog_link } = req.body;

    await supabase.from('solutions')
        .update({ name, image, demo_link, catalog_link })
        .eq('id', id);
    res.redirect('/admin');
});

// --- Xóa giải pháp ---
app.post('/admin/solution/delete/:id', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const id = req.params.id;
    await supabase.from('solutions').delete().eq('id', id);
    res.redirect('/admin');
});

// --- Quản lý Nhân viên (Chỉ Admin) ---
app.post('/admin/user/add', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send("Bạn không có quyền!");
    }
    const { username, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await supabase.from('users').insert([{ username, password: hashedPassword, role: 'staff' }]);
        res.redirect('/admin');
    } catch (e) {
        res.send("Lỗi thêm nhân viên!");
    }
});

app.post('/admin/user/delete/:id', async (req, res) => {
    if (!req.session.user || req.session.user.role !== 'admin') {
        return res.status(403).send("Bạn không có quyền!");
    }
    const id = req.params.id;
    if (id == req.session.user.id) return res.send("Không thể xóa chính mình!");
    await supabase.from('users').delete().eq('id', id);
    res.redirect('/admin');
});

// --- Đổi mật khẩu cá nhân ---
app.post('/admin/change-password', async (req, res) => {
    if (!req.session.user) return res.redirect('/login');
    const { current_password, new_password } = req.body;
    
    try {
        const { data: user } = await supabase.from('users').select('*').eq('id', req.session.user.id).single();
        const match = await bcrypt.compare(current_password, user.password);
        if (!match) return res.send("Mật khẩu hiện tại không đúng! <a href='/admin'>Quay lại</a>");

        const hashedNewPassword = await bcrypt.hash(new_password, 10);
        await supabase.from('users').update({ password: hashedNewPassword }).eq('id', req.session.user.id);
        res.send("Đổi mật khẩu thành công! <a href='/admin'>Quay lại</a>");
    } catch (err) {
        res.status(500).send("Lỗi đổi mật khẩu");
    }
});

app.listen(PORT, () => {
    console.log(`Server đang chạy tại cổng: ${PORT}`);
});
