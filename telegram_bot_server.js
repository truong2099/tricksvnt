/**
 * TELEGRAM BOT PREMIUM STORE - CANBOSO API INTEGRATION (BẢN CHÍNH THỨC 24/7)
 * Tự động bán tài khoản Premium, Nạp ví tự động qua VietQR/Ngân hàng,
 * Quản lý đơn hàng, Bảo hành tự động, Web Manager Dashboard.
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_FILE = path.join(__dirname, 'bot_config.json');
const DATA_FILE = path.join(__dirname, 'bot_data.json');

// --- HÀM LOAD & SAVE DỮ LIỆU ---
function loadConfig() {
    let cfg = {
        token: '8652399485:AAEkzrAqd3ZyKcl9_DWqAx7MS7UcNMUBnAg',
        adminId: '1170317703',
        adminName: 'NGỌC TRƯỜNG',
        adminUsername: 'ngoctruong_store',
        apiKey: 'tgb_83c40bd3d5c484337e0f71169446834c497226076bba765f',
        apiUrl: 'https://canboso.com',
        markupPercent: 0,
        bank: {
            bankCode: 'MB',
            bankName: 'MBBank (Ngân hàng Quân Đội)',
            accountNumber: '22220009999',
            accountHolder: 'VU NGOC TRUONG',
            depositSyntax: 'NAP',
            minDeposit: 10000
        },
        supportContact: '@vntshared',
        welcomeMessage: 'Chào mừng bạn đến với hệ thống tài khoản Premium tự động 24/7! Vui lòng chọn dịch vụ bên dưới.',
        warrantyPolicy: '• Bảo hành 1 đổi 1 trong suốt thời hạn sử dụng đối với lỗi nhà cung cấp.\n• Khách hàng vui lòng tuân thủ quy định đăng nhập trong mô tả sản phẩm.\n• Hỗ trợ xử lý bảo hành siêu tốc qua mục "Đơn hàng của tôi".',
        autoBalanceFilter: true, // Tự động ẩn sản phẩm nếu giá gốc > số dư ví bot mẹ
        motherBalanceOverride: null, // Ghi đè số dư ví mẹ để test (null = lấy số dư thực tế API)
        socialSupport: {
            telegramAdmin: '@vntshared',
            telegramChannel: 'https://t.me/vntshared',
            telegramGroup: '',
            zalo: '0989055026',
            facebook: 'https://facebook.com',
            messenger: 'https://m.me/vntshared',
            tiktok: '',
            hotline: '0989055026',
            workingHours: '08:00 - 24:00 (Hỗ trợ 24/7)',
            supportNote: 'Khách hàng vui lòng chuẩn bị sẵn Mã đơn hàng hoặc Biên lai nạp tiền để được hỗ trợ nhanh nhất!'
        },
        adminAuth: {
            username: 'vungoctruong',
            password: '@Gmail2k9'
        }
    };

    if (fs.existsSync(CONFIG_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
            cfg = { ...cfg, ...data };
        } catch (e) {
            console.error('Lỗi đọc bot_config.json:', e.message);
        }
    }
    return cfg;
}

function saveConfig(cfg) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
    } catch (e) {
        console.error('Lỗi lưu bot_config.json:', e.message);
    }
}

function loadData() {
    let d = {
        users: {},
        orders: [],
        deposits: [],
        warrantyTickets: [],
        productOverrides: {},
        activityLogs: [],
        announcements: []
    };
    if (fs.existsSync(DATA_FILE)) {
        try {
            const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            d = { ...d, ...parsed };
        } catch (e) {
            console.error('Lỗi đọc bot_data.json:', e.message);
        }
    }
    return d;
}

function saveData(d) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2), 'utf8');
    } catch (e) {
        console.error('Lỗi lưu bot_data.json:', e.message);
    }
}

function addLog(type, message) {
    const d = loadData();
    d.activityLogs = d.activityLogs || [];
    d.activityLogs.unshift({
        time: new Date().toISOString(),
        type,
        message
    });
    if (d.activityLogs.length > 200) d.activityLogs = d.activityLogs.slice(0, 200);
    saveData(d);
    console.log(`[${type.toUpperCase()}] ${message}`);
}

let config = loadConfig();
let db = loadData();

// Cache sản phẩm Canboso (để tránh vượt quota 30 req/phút của API Canboso)
let cachedProducts = [];
let lastProductsFetch = 0;
const CACHE_TTL_MS = 60 * 1000; // 60s
const PRODUCT_SYNC_INTERVAL_MS = 60 * 1000; // Tự động đồng bộ mỗi 1 phút (60 giây)
let productSyncInterval = null;

// Quản lý số dư ví Bot Mẹ (Canboso API) để tự động ẩn/hiện sản phẩm theo số dư vốn
let cachedMotherBalance = 0;
let lastMotherBalanceFetch = 0;
const MOTHER_BALANCE_TTL_MS = 30 * 1000; // 30s cache

function getLastSyncTime() {
    return lastProductsFetch;
}

// Lấy số dư ví Bot Mẹ từ Canboso API (hoặc cấu hình giả lập nếu Admin set)
async function getMotherBotBalance(force = false) {
    const cfg = loadConfig();
    // 1. Nếu Admin nhập số dư giả lập (Override) để test hệ thống (chỉ khi khác null và không phải 'api')
    if (cfg.motherBalanceOverride !== undefined && cfg.motherBalanceOverride !== null && cfg.motherBalanceOverride !== '' && cfg.motherBalanceOverride !== 'api') {
        return Number(cfg.motherBalanceOverride) || 0;
    }

    // 2. Kiểm tra cache
    const now = Date.now();
    if (!force && (now - lastMotherBalanceFetch) < MOTHER_BALANCE_TTL_MS && lastMotherBalanceFetch > 0) {
        return cachedMotherBalance;
    }

    // 3. Gọi API Canboso lấy số dư thực tế
    try {
        const balData = await fetchCanbosoBalance();
        if (balData && typeof balData.balanceVnd === 'number') {
            cachedMotherBalance = balData.balanceVnd;
        } else if (balData && typeof balData.balance === 'number') {
            cachedMotherBalance = balData.balance;
        }
        lastMotherBalanceFetch = now;
        return cachedMotherBalance;
    } catch (e) {
        console.error('Lỗi lấy số dư ví mẹ Canboso:', e.message);
        return cachedMotherBalance;
    }
}

// Hàm khởi chạy tự động đồng bộ sản phẩm từ Canboso API định kỳ mỗi 1 phút
function startProductSyncPolling() {
    if (productSyncInterval) clearInterval(productSyncInterval);

    // Đồng bộ ngay lập tức lần đầu khi bật service
    (async () => {
        try {
            await fetchProducts(true);
            await getMotherBotBalance(true);
        } catch (e) {}
    })();

    // Lặp lại tự động mỗi 1 phút (60.000 ms)
    productSyncInterval = setInterval(async () => {
        try {
            const list = await fetchProducts(true);
            const motherBal = await getMotherBotBalance(true);
            const cfg = loadConfig();
            const autoFilter = cfg.autoBalanceFilter !== false;

            let affordableCount = 0;
            let hiddenCount = 0;
            list.forEach(p => {
                const orig = p.price && p.price.amount ? p.price.amount : 0;
                if (orig <= motherBal) affordableCount++;
                else hiddenCount++;
            });

            const timeStr = new Date().toLocaleTimeString('vi-VN');
            const statusStr = autoFilter 
                ? `[VÍ MẸ: ${formatMoney(motherBal)}] -> Đang mở bán ${affordableCount} SP (giá gốc <= ${formatMoney(motherBal)}), Tự ẩn ${hiddenCount} SP (giá gốc > ${formatMoney(motherBal)})` 
                : `[VÍ MẸ: ${formatMoney(motherBal)}] -> Đang mở bán tất cả ${list.length} SP (Đang tắt bộ lọc ví)`;

            console.log(`[CANBOSO] [AUTO-SYNC 1 PHÚT] Đồng bộ ${list.length} SP thành công (${timeStr}). ${statusStr}`);
        } catch (err) {
            console.error('[CANBOSO] Lỗi tự động đồng bộ sản phẩm:', err.message);
        }
    }, PRODUCT_SYNC_INTERVAL_MS);

    console.log(`⚡ [CANBOSO] Đã kích hoạt cơ chế Tự Động Đồng Bộ Sản Phẩm định kỳ mỗi 1 phút (60s) & Lọc theo Ví Bot Mẹ`);
}

// Quản lý trạng thái tương tác người dùng (Conversation state)
const userStates = {}; // { [chatId]: { step: string, data: object } }

// --- CANBOSO API CLIENT ---
function callCanboso(endpoint, method = 'GET', postData = null, headers = {}) {
    return new Promise((resolve, reject) => {
        cfg = loadConfig();
        const base = cfg.apiUrl || 'https://canboso.com';
        const url = new URL(base + endpoint);

        const reqHeaders = {
            'x-buyer-key': cfg.apiKey,
            'Content-Type': 'application/json',
            ...headers
        };

        const bodyStr = postData ? JSON.stringify(postData) : null;
        if (bodyStr) {
            reqHeaders['Content-Length'] = Buffer.byteLength(bodyStr);
        }

        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + url.search,
            method: method,
            headers: reqHeaders,
            timeout: 20000
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    resolve({ status: res.statusCode, data: parsed });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: body });
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Canboso API request timeout'));
        });

        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

// 1. Lấy danh sách sản phẩm Canboso
async function fetchProducts(force = false) {
    const now = Date.now();
    if (!force && cachedProducts.length > 0 && (now - lastProductsFetch) < CACHE_TTL_MS) {
        return cachedProducts;
    }

    try {
        const cfg = loadConfig();
        const res = await callCanboso(`/api/v2/telegram-buyer/products?key=${cfg.apiKey}`);
        if (res.status === 200 && res.data && Array.isArray(res.data.products)) {
            cachedProducts = res.data.products;
            lastProductsFetch = now;
            addLog('canboso', `Đã đồng bộ ${cachedProducts.length} sản phẩm từ Canboso thành công`);
            return cachedProducts;
        } else {
            console.error('Lỗi khi lấy sản phẩm Canboso:', res);
            return cachedProducts;
        }
    } catch (err) {
        console.error('Lỗi kết nối Canboso fetchProducts:', err.message);
        return cachedProducts;
    }
}

// 2. Lấy số dư ví Canboso
async function fetchCanbosoBalance() {
    try {
        const cfg = loadConfig();
        const res = await callCanboso(`/api/v2/telegram-buyer/balance?key=${cfg.apiKey}`);
        if (res.status === 200 && res.data && res.data.success) {
            return res.data;
        }
        return null;
    } catch (err) {
        console.error('Lỗi fetchCanbosoBalance:', err.message);
        return null;
    }
}

// 3. Mua sản phẩm qua Canboso
async function purchaseCanbosoProduct(productId, quantity = 1, options = {}) {
    const cfg = loadConfig();
    const idempotencyKey = 'buy-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex');
    
    const body = {
        key: cfg.apiKey,
        product_id: productId,
        quantity: quantity
    };

    if (options.customer_email) body.customer_email = options.customer_email;
    if (options.slot_months) body.slot_months = options.slot_months;
    if (options.customer_accounts) body.customer_accounts = options.customer_accounts;

    const res = await callCanboso('/api/v2/telegram-buyer/purchase', 'POST', body, {
        'Idempotency-Key': idempotencyKey
    });

    return res;
}

// 4. Lấy lịch sử đơn từ Canboso
async function fetchCanbosoOrders(orderCode = '') {
    try {
        const cfg = loadConfig();
        let path = `/api/v2/telegram-buyer/orders?key=${cfg.apiKey}`;
        if (orderCode) path += `&orderCode=${encodeURIComponent(orderCode)}`;
        const res = await callCanboso(path);
        if (res.status === 200 && res.data && res.data.orders) {
            return res.data.orders;
        }
        return [];
    } catch (err) {
        console.error('Lỗi fetchCanbosoOrders:', err.message);
        return [];
    }
}

// --- TELEGRAM BOT HELPER API ---
function callTelegram(method, data = {}) {
    return new Promise((resolve, reject) => {
        const cfg = loadConfig();
        if (!cfg.token) return resolve({ ok: false, description: 'No token' });

        const bodyStr = JSON.stringify(data);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${cfg.token}/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyStr)
            },
            timeout: 25000
        };

        const req = https.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ ok: false, error: e.message, raw: body });
                }
            });
        });

        req.on('error', err => resolve({ ok: false, error: err.message }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, error: 'Timeout' });
        });

        req.write(bodyStr);
        req.end();
    });
}

async function sendMessage(chatId, text, extra = {}) {
    return await callTelegram('sendMessage', {
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra
    });
}

async function editMessageText(chatId, messageId, text, extra = {}) {
    return await callTelegram('editMessageText', {
        chat_id: chatId,
        message_id: messageId,
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...extra
    });
}

async function sendPhoto(chatId, photoUrl, caption, extra = {}) {
    return await callTelegram('sendPhoto', {
        chat_id: chatId,
        photo: photoUrl,
        caption: caption,
        parse_mode: 'HTML',
        ...extra
    });
}

async function deleteMessage(chatId, messageId) {
    if (!chatId || !messageId) return { ok: false };
    return await callTelegram('deleteMessage', {
        chat_id: chatId,
        message_id: messageId
    });
}

// Lấy thông tin Bot và link ảnh avatar đại diện hiện tại
async function getBotProfileInfo() {
    const cfg = loadConfig();
    if (!cfg.token) {
        return { ok: false, description: 'Chưa cấu hình Telegram Bot Token' };
    }
    const me = await callTelegram('getMe');
    if (!me.ok) {
        return { ok: false, description: me.description || 'Không thể kết nối Telegram Bot' };
    }

    const botUser = me.result;
    let avatarUrl = null;
    let fileId = null;

    try {
        const photosRes = await callTelegram('getUserProfilePhotos', { user_id: botUser.id, limit: 1 });
        if (photosRes.ok && photosRes.result && photosRes.result.total_count > 0 && photosRes.result.photos.length > 0) {
            const list = photosRes.result.photos[0];
            const largest = list[list.length - 1];
            if (largest && largest.file_id) {
                fileId = largest.file_id;
                const fileRes = await callTelegram('getFile', { file_id: largest.file_id });
                if (fileRes.ok && fileRes.result && fileRes.result.file_path) {
                    avatarUrl = `https://api.telegram.org/file/bot${cfg.token}/${fileRes.result.file_path}`;
                }
            }
        }
    } catch (e) {
        console.error('Lỗi khi lấy avatar bot:', e.message);
    }

    return {
        ok: true,
        bot: botUser,
        hasAvatar: Boolean(avatarUrl),
        avatarUrl: avatarUrl,
        fileId: fileId
    };
}

// Thay đổi avatar đại diện cho Telegram Bot (setMyProfilePhoto)
function setBotAvatar(imageBuffer, mimeType = 'image/jpeg') {
    return new Promise((resolve) => {
        const cfg = loadConfig();
        if (!cfg.token) {
            return resolve({ ok: false, description: 'Chưa cấu hình Telegram Bot Token' });
        }

        const boundary = '----BotAvatarBoundary' + Date.now();
        const photoMeta = JSON.stringify({ type: 'static', photo: 'attach://bot_avatar' });

        const postDataHead = Buffer.from(
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="photo"\r\n\r\n` +
            `${photoMeta}\r\n` +
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="bot_avatar"; filename="avatar.jpg"\r\n` +
            `Content-Type: ${mimeType || 'image/jpeg'}\r\n\r\n`
        );

        const postDataTail = Buffer.from(`\r\n--${boundary}--\r\n`);
        const fullBuffer = Buffer.concat([postDataHead, imageBuffer, postDataTail]);

        const req = https.request({
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${cfg.token}/setMyProfilePhoto`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': fullBuffer.length
            },
            timeout: 30000
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(body);
                    if (parsed.ok) {
                        addLog('system', 'Đã đổi ảnh đại diện (avatar) Telegram Bot thành công!');
                    } else {
                        addLog('system', `Đổi avatar Telegram Bot thất bại: ${parsed.description || 'Lỗi không xác định'}`);
                    }
                    resolve(parsed);
                } catch (e) {
                    resolve({ ok: false, description: 'Lỗi parse response từ Telegram', raw: body });
                }
            });
        });

        req.on('error', err => {
            addLog('system', `Lỗi kết nối khi đổi avatar Telegram Bot: ${err.message}`);
            resolve({ ok: false, description: err.message });
        });
        req.on('timeout', () => {
            req.destroy();
            resolve({ ok: false, description: 'Hết thời gian chờ (Timeout)' });
        });

        req.write(fullBuffer);
        req.end();
    });
}

// Xóa ảnh avatar đại diện hiện tại của Telegram Bot (removeMyProfilePhoto)
async function removeBotAvatar() {
    const res = await callTelegram('removeMyProfilePhoto', {});
    if (res.ok) {
        addLog('system', 'Đã xóa ảnh đại diện (avatar) của Telegram Bot!');
    }
    return res;
}

// --- TÍNH NĂNG THÔNG BÁO TỪ BAN QUẢN TRỊ (ADMIN BROADCAST) ---
async function broadcastAnnouncement({ title, type, content, buttonText, buttonUrl, pinToBot, testOnlyChatId }) {
    const cfg = loadConfig();
    const d = loadData();
    const typeIcons = {
        'news': '📢',
        'promo': '🔥',
        'maintenance': '⚠️',
        'alert': '🛡️',
        'feature': '🚀'
    };
    const typeNames = {
        'news': 'THÔNG BÁO TỪ BAN QUẢN TRỊ',
        'promo': 'KHUYẾN MÃI ĐẶC BIỆT TỪ BQT',
        'maintenance': 'THÔNG BÁO BẢO TRÌ HỆ THỐNG',
        'alert': 'CẢNH BÁO AN TOÀN TỪ ADMIN',
        'feature': 'TÍNH NĂNG MỚI TỪ HỆ THỐNG'
    };

    const icon = typeIcons[type] || '📢';
    const headerName = typeNames[type] || 'THÔNG BÁO TỪ BAN QUẢN TRỊ';
    const timeStr = new Date().toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    const adminName = cfg.adminName || 'Ngọc Trường Store';

    let msgText = `${icon} <b>${headerName}</b>\n`;
    msgText += `━━━━━━━━━━━━━━━━━━\n`;
    if (title) {
        msgText += `📌 <b>${title.toUpperCase()}</b>\n\n`;
    }
    msgText += `${content}\n\n`;
    msgText += `━━━━━━━━━━━━━━━━━━\n`;
    msgText += `⏰ <i>Thời gian: ${timeStr}</i>\n`;
    msgText += `✍️ <b>Ban Quản Trị:</b> <i>${adminName}</i>`;

    const extraOpts = {};
    if (buttonText && buttonUrl) {
        extraOpts.reply_markup = {
            inline_keyboard: [[{ text: buttonText, url: buttonUrl }]]
        };
    }

    // 1. Trường hợp gửi TEST cho Admin
    if (testOnlyChatId) {
        const testRes = await sendMessage(testOnlyChatId, `🧪 <b>[BẢN XEM TRƯỚC THÔNG BÁO BQT]:</b>\n\n` + msgText, extraOpts);
        return {
            success: testRes && testRes.ok,
            isTest: true,
            recipient: testOnlyChatId,
            message: testRes && testRes.ok ? `Đã gửi thử nghiệm thông báo BQT tới Admin (${testOnlyChatId})!` : 'Lỗi gửi tin nhắn Telegram tới Admin'
        };
    }

    // 2. Phát thông báo tự động tới toàn bộ khách hàng (Ẩn hoàn toàn các nút tính năng thừa)
    const userIds = Object.keys(d.users || {});
    let successCount = 0;
    let failCount = 0;

    for (const uid of userIds) {
        try {
            const sendRes = await sendMessage(uid, msgText, extraOpts);
            if (sendRes && sendRes.ok) {
                successCount++;
            } else {
                failCount++;
            }
        } catch (e) {
            failCount++;
        }
    }

    // 3. Lưu lịch sử thông báo BQT vào bot_data.json
    d.announcements = d.announcements || [];
    const newAnn = {
        id: 'ANN-' + Date.now(),
        title: title || 'Thông báo từ Ban Quản Trị',
        type: type || 'news',
        content: content,
        buttonText: buttonText || '',
        buttonUrl: buttonUrl || '',
        createdAt: new Date().toISOString(),
        sentCount: successCount,
        totalUsers: userIds.length,
        pinned: Boolean(pinToBot),
        sender: adminName
    };

    if (pinToBot) {
        d.announcements.forEach(a => a.pinned = false);
        newAnn.pinned = true;
    }

    d.announcements.unshift(newAnn);
    if (d.announcements.length > 50) d.announcements = d.announcements.slice(0, 50);
    saveData(d);

    addLog('broadcast', `Admin phát thông báo [${title || 'BQT'}] thành công tới ${successCount}/${userIds.length} người dùng Telegram`);

    return {
        success: true,
        sentCount: successCount,
        failCount: failCount,
        totalUsers: userIds.length,
        announcement: newAnn,
        message: `Đã phát thông báo thành công đến ${successCount}/${userIds.length} người dùng!`
    };
}

// Hiển thị thông báo mới nhất từ Ban Quản Trị cho người dùng
async function sendLatestAnnouncement(chatId, messageId = null) {
    const d = loadData();
    const cfg = loadConfig();
    const list = d.announcements || [];
    const ann = list.find(a => a.pinned) || list[0];

    const inline_keyboard = [];

    if (!ann) {
        const noText = `📢 <b>THÔNG BÁO TỪ BAN QUẢN TRỊ</b>\n━━━━━━━━━━━━━━━━━━\n<i>Hiện tại chưa có thông báo mới nào từ Ban Quản Trị. Bạn vui lòng quay lại sau!</i>\n\n📞 Mọi thắc mắc vui lòng liên hệ Admin: <b>${cfg.supportContact || '@vntshared'}</b>`;
        inline_keyboard.push([{ text: '🏠 VỀ MENU CHÍNH', callback_data: 'main_menu' }]);
        if (messageId) {
            return editMessageText(chatId, messageId, noText, { reply_markup: { inline_keyboard } });
        }
        return sendMessage(chatId, noText, { reply_markup: { inline_keyboard } });
    }

    const typeIcons = { 'news': '📢', 'promo': '🔥', 'maintenance': '⚠️', 'alert': '🛡️', 'feature': '🚀' };
    const typeNames = { 'news': 'THÔNG BÁO TỪ BAN QUẢN TRỊ', 'promo': 'KHUYẾN MÃI ĐẶC BIỆT TỪ BQT', 'maintenance': 'THÔNG BÁO BẢO TRÌ HỆ THỐNG', 'alert': 'CẢNH BÁO AN TOÀN TỪ ADMIN', 'feature': 'TÍNH NĂNG MỚI TỪ HỆ THỐNG' };

    const icon = typeIcons[ann.type] || '📢';
    const headerName = typeNames[ann.type] || 'THÔNG BÁO TỪ BAN QUẢN TRỊ';
    const timeStr = new Date(ann.createdAt).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });

    let msgText = `${icon} <b>${headerName}</b>\n`;
    msgText += `━━━━━━━━━━━━━━━━━━\n`;
    if (ann.title) {
        msgText += `📌 <b>${ann.title.toUpperCase()}</b>\n\n`;
    }
    msgText += `${ann.content}\n\n`;
    msgText += `━━━━━━━━━━━━━━━━━━\n`;
    msgText += `⏰ <i>Thời gian đăng: ${timeStr}</i>\n`;
    msgText += `✍️ <b>Ban Quản Trị:</b> <i>${ann.sender || cfg.adminName || 'Ngọc Trường Store'}</i>`;

    if (ann.buttonText && ann.buttonUrl) {
        inline_keyboard.push([{ text: ann.buttonText, url: ann.buttonUrl }]);
    }
    inline_keyboard.push([
        { text: '🏠 VỀ MENU CHÍNH', callback_data: 'main_menu' }
    ]);

    if (messageId) {
        const editRes = await editMessageText(chatId, messageId, msgText, { reply_markup: { inline_keyboard } });
        if (!editRes || !editRes.ok) {
            try { await deleteMessage(chatId, messageId); } catch (e) {}
            await sendMessage(chatId, msgText, { reply_markup: { inline_keyboard } });
        }
    } else {
        await sendMessage(chatId, msgText, { reply_markup: { inline_keyboard } });
    }
}



// Map mã ngân hàng sang BIN VietQR
const BANK_BINS = {
    'MB': '970422',
    'MBBANK': '970422',
    'VCB': '970436',
    'VIETCOMBANK': '970436',
    'ICB': '970415',
    'VIETINBANK': '970415',
    'TCB': '970407',
    'TECHCOMBANK': '970407',
    'ACB': '970416',
    'VPB': '970432',
    'VPBANK': '970432',
    'TPB': '970423',
    'TPBANK': '970423',
    'STB': '970403',
    'SACOMBANK': '970403',
    'BIDV': '970418',
    'VIB': '970441',
    'SHB': '970443',
    'MSB': '970426',
    'OCB': '970448'
};

// Tạo Buffer ảnh mã VietQR chuẩn Napas 24/7 trực tiếp
async function getVietQrBuffer(bankCode, accountNumber, accountHolder, amount, addInfo) {
    const bin = BANK_BINS[(bankCode || 'MB').toUpperCase()] || '970422';
    const genBody = JSON.stringify({
        accountNo: accountNumber,
        accountName: accountHolder,
        acqId: bin,
        amount: Number(amount) || 50000,
        addInfo: addInfo,
        format: 'text',
        template: 'compact2'
    });

    return new Promise((resolve) => {
        const req = https.request({
            hostname: 'api.vietqr.io',
            path: '/v2/generate',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(genBody)
            },
            timeout: 8000
        }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try {
                    const json = JSON.parse(d);
                    if (json.data && json.data.qrDataURL) {
                        const base64Data = json.data.qrDataURL.replace(/^data:image\/png;base64,/, '');
                        resolve(Buffer.from(base64Data, 'base64'));
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.write(genBody);
        req.end();
    });
}

// Upload trực tiếp ảnh Buffer lên Telegram qua multipart/form-data
function sendPhotoBuffer(chatId, buffer, caption, extra = {}) {
    return new Promise((resolve) => {
        const cfg = loadConfig();
        if (!cfg.token) return resolve({ ok: false, description: 'No token' });

        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const parts = [];

        function addField(name, val) {
            parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`
            ));
        }

        addField('chat_id', chatId);
        addField('caption', caption);
        addField('parse_mode', extra.parse_mode || 'HTML');

        if (extra.reply_markup) {
            addField('reply_markup', JSON.stringify(extra.reply_markup));
        }

        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="vietqr.png"\r\nContent-Type: image/png\r\n\r\n`
        ));
        parts.push(buffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const totalLength = parts.reduce((acc, p) => acc + p.length, 0);

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${cfg.token}/sendPhoto`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': totalLength
            },
            timeout: 15000
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ ok: false, error: e.message });
                }
            });
        });

        req.on('error', err => resolve({ ok: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });

        for (const p of parts) req.write(p);
        req.end();
    });
}

// Sửa ảnh và caption trực tiếp trong tin nhắn ảnh hiện tại
function editMessagePhotoBuffer(chatId, messageId, buffer, caption, extra = {}) {
    return new Promise((resolve) => {
        const cfg = loadConfig();
        if (!cfg.token) return resolve({ ok: false, description: 'No token' });

        const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
        const parts = [];

        function addField(name, val) {
            parts.push(Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${val}\r\n`
            ));
        }

        addField('chat_id', chatId);
        addField('message_id', messageId);

        const mediaObj = {
            type: 'photo',
            media: 'attach://photo',
            caption: caption,
            parse_mode: extra.parse_mode || 'HTML'
        };
        addField('media', JSON.stringify(mediaObj));

        if (extra.reply_markup) {
            addField('reply_markup', JSON.stringify(extra.reply_markup));
        }

        parts.push(Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="vietqr.png"\r\nContent-Type: image/png\r\n\r\n`
        ));
        parts.push(buffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const totalLength = parts.reduce((acc, p) => acc + p.length, 0);

        const req = https.request({
            hostname: 'api.telegram.org',
            path: `/bot${cfg.token}/editMessageMedia`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': totalLength
            },
            timeout: 15000
        }, res => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    resolve({ ok: false, error: e.message });
                }
            });
        });

        req.on('error', err => resolve({ ok: false, error: err.message }));
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, error: 'Timeout' }); });

        for (const p of parts) req.write(p);
        req.end();
    });
}

async function answerCallbackQuery(callbackQueryId, text = '', showAlert = false) {
    return await callTelegram('answerCallbackQuery', {
        callback_query_id: callbackQueryId,
        text: text,
        show_alert: showAlert
    });
}

// Quản lý tin nhắn mã QR nạp tiền của người dùng
const userActiveQrMessages = {};

function rememberQrMessage(chatId, msgId) {
    if (!chatId || !msgId) return;
    const sId = String(chatId);
    userActiveQrMessages[sId] = msgId;
    try {
        const d = loadData();
        if (d.users && d.users[sId]) {
            d.users[sId].lastDepositQrMsgId = msgId;
            saveData(d);
        }
    } catch (e) {}
}

async function removeUserQrMessage(chatId) {
    if (!chatId) return;
    const sId = String(chatId);
    let msgId = userActiveQrMessages[sId];
    if (!msgId) {
        try {
            const d = loadData();
            if (d.users && d.users[sId] && d.users[sId].lastDepositQrMsgId) {
                msgId = d.users[sId].lastDepositQrMsgId;
            }
        } catch (e) {}
    }
    if (msgId) {
        delete userActiveQrMessages[sId];
        try {
            const d = loadData();
            if (d.users && d.users[sId] && d.users[sId].lastDepositQrMsgId) {
                delete d.users[sId].lastDepositQrMsgId;
                saveData(d);
            }
        } catch (e) {}
        try {
            await deleteMessage(chatId, msgId);
            console.log(`[AUTOBANK] Đã xóa ảnh mã QR nạp tiền (Msg ID: ${msgId}) của user ${chatId}`);
        } catch (e) {
            console.log(`[AUTOBANK] Không thể xóa ảnh mã QR: ${e.message}`);
        }
    }
}

// --- QUẢN LÝ USER VÀ VÍ ---
function getOrCreateUser(from) {
    if (!from || !from.id) return null;
    const d = loadData();
    d.users = d.users || {};
    const uid = String(from.id);
    if (!d.users[uid]) {
        d.users[uid] = {
            id: from.id,
            username: from.username || '',
            first_name: from.first_name || '',
            balance: 0,
            totalDeposited: 0,
            totalSpent: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        saveData(d);
        addLog('user', `Người dùng mới tham gia bot: ${from.first_name} (ID: ${from.id}, @${from.username || 'none'})`);
    } else {
        let changed = false;
        if (from.username && d.users[uid].username !== from.username) {
            d.users[uid].username = from.username;
            changed = true;
        }
        if (from.first_name && d.users[uid].first_name !== from.first_name) {
            d.users[uid].first_name = from.first_name;
            changed = true;
        }
        if (changed) saveData(d);
    }
    return d.users[uid];
}

function getUserBalance(chatId) {
    const d = loadData();
    const uid = String(chatId);
    return (d.users && d.users[uid]) ? (d.users[uid].balance || 0) : 0;
}

function adjustUserBalance(chatId, amount, reason = '', adminNote = '') {
    const d = loadData();
    const uid = String(chatId);
    if (!d.users || !d.users[uid]) return { success: false, message: 'User không tồn tại' };

    const current = d.users[uid].balance || 0;
    const next = current + amount;
    if (next < 0) return { success: false, message: 'Số dư không đủ để trừ' };

    d.users[uid].balance = next;
    d.users[uid].updatedAt = new Date().toISOString();

    if (amount > 0) {
        d.users[uid].totalDeposited = (d.users[uid].totalDeposited || 0) + amount;
    } else {
        d.users[uid].totalSpent = (d.users[uid].totalSpent || 0) + Math.abs(amount);
    }

    saveData(d);
    addLog('wallet', `Biến động số dư User ${uid}: ${amount > 0 ? '+' : ''}${formatMoney(amount)} (Còn: ${formatMoney(next)}) - ${reason} ${adminNote}`);
    return { success: true, newBalance: next };
}

function formatMoney(amount) {
    return Number(amount || 0).toLocaleString('vi-VN') + ' ₫';
}

// --- AUTO BANK AUTOMATION ENGINE ---
// Xử lý tự động biến động số dư từ SePAY / Casso / Webhook Ngân Hàng
async function processAutoBankTransaction(trans) {
    const d = loadData();
    const cfg = loadConfig();

    // 1. Chuẩn hóa dữ liệu đầu vào
    const amount = Number(trans.amount || trans.transferAmount || trans.amount_in || 0);
    const content = String(trans.content || trans.description || trans.transaction_content || '').trim();
    const refId = String(trans.refId || trans.referenceCode || trans.reference_number || trans.id || trans.tid || ('TX-' + Date.now())).trim();
    const gateway = String(trans.gateway || trans.bank || cfg.bank?.bankCode || 'MBBank');

    if (amount <= 0) {
        return { success: false, message: 'Số tiền nạp phải lớn hơn 0' };
    }

    // 2. Chống cộng trùng (Duplicate check)
    d.processedTransactions = d.processedTransactions || {};
    if (d.processedTransactions[refId]) {
        return { success: false, message: 'Giao dịch đã được xử lý trước đó', refId };
    }

    // 3. Phân tích nội dung tìm Telegram Chat ID
    const syntax = (cfg.bank?.depositSyntax || 'NAP').toUpperCase();
    const regex = new RegExp(`${syntax}\\s*(\\d+)`, 'i');
    const match = content.match(regex);

    let targetChatId = null;
    if (match && match[1]) {
        targetChatId = match[1];
    } else {
        // Thử tìm xem có chứa ID của bất kỳ khách hàng nào trong hệ thống không
        for (const uid of Object.keys(d.users || {})) {
            if (content.includes(uid)) {
                targetChatId = uid;
                break;
            }
        }
    }

    if (!targetChatId) {
        addLog('autobank', `Nhận giao dịch +${formatMoney(amount)} nhưng không tìm thấy cú pháp NAP <chatId>. Nội dung: "${content}" - Mã GD: ${refId}`);
        return { success: false, message: 'Không tìm thấy Chat ID khách hàng trong nội dung chuyển khoản', content, refId };
    }

    // Đảm bảo user tồn tại
    if (!d.users[targetChatId]) {
        d.users[targetChatId] = {
            id: Number(targetChatId),
            username: '',
            first_name: 'Khách hàng',
            balance: 0,
            totalDeposited: 0,
            totalSpent: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }

    // 4. Đánh dấu giao dịch đã xử lý
    d.processedTransactions[refId] = {
        refId,
        amount,
        content,
        chatId: targetChatId,
        gateway,
        processedAt: new Date().toISOString()
    };

    // 5. Thêm vào danh sách nạp tiền deposits
    const depRecord = {
        id: 'DEP-' + Date.now(),
        chatId: targetChatId,
        username: d.users[targetChatId]?.username || '',
        amount: amount,
        status: 'approved',
        createdAt: new Date().toISOString(),
        approvedAt: new Date().toISOString(),
        note: `Auto Bank (${gateway} - Mã GD: ${refId})`
    };
    d.deposits = d.deposits || [];
    d.deposits.unshift(depRecord);
    saveData(d);

    // 6. Cộng tiền vào ví khách hàng
    const resAdj = adjustUserBalance(targetChatId, amount, 'Auto Bank nạp tự động', `(Mã GD: ${refId})`);

    addLog('autobank', `✅ AUTO BANK THÀNH CÔNG: +${formatMoney(amount)} cho User ${targetChatId} - Mã GD: ${refId} - Cổng: ${gateway}`);

    // 7. Xóa ảnh mã QR nạp tiền trước đó & Gửi thông báo chúc mừng qua Telegram cho khách
    try {
        await removeUserQrMessage(targetChatId);

        await sendMessage(targetChatId, `🎉 <b>NẠP TIỀN TỰ ĐỘNG THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━\n💰 <b>Số tiền nạp:</b> <code>+${formatMoney(amount)}</code>\n💳 <b>Số dư hiện tại:</b> <code>${formatMoney(resAdj.newBalance)}</code>\n🏦 <b>Ngân hàng:</b> ${gateway}\n🧾 <b>Mã giao dịch:</b> <code>${refId}</code>\n━━━━━━━━━━━━━━━━━━\n<i>Hệ thống Auto Bank đã tự động xác nhận và cộng tiền vào ví. Bạn có thể mua tài khoản ngay bây giờ!</i>`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🛒 MUA TÀI KHOẢN NGAY', callback_data: 'cat_all_1' }],
                    [{ text: '💰 KIỂM TRA SỐ DƯ VÍ', callback_data: 'wallet_info' }]
                ]
            }
        });
    } catch (e) {}

    // 8. Báo cho Admin
    if (cfg.adminId && String(cfg.adminId) !== String(targetChatId)) {
        try {
            sendMessage(cfg.adminId, `⚡ <b>AUTO BANK: GIAO DỊCH NẠP MỚI!</b>\nKhách: <code>${targetChatId}</code> (@${d.users[targetChatId]?.username || 'none'})\nSố tiền: <b>+${formatMoney(amount)}</b>\nMã GD: <code>${refId}</code>\nNội dung: <i>${content}</i>`);
        } catch (e) {}
    }

    return { success: true, message: 'Đã nạp tiền tự động thành công!', newBalance: resAdj.newBalance, chatId: targetChatId, amount, refId };
}

// Polling kiểm tra lịch sử giao dịch Auto Bank tự động (Hỗ trợ Sieuthicode MB Bank API, SePAY, Casso)
let autoBankInterval = null;

async function checkAutoBankPolling() {
    const cfg = loadConfig();
    const ab = cfg.autobank;
    if (!ab || ab.enabled === false) return;

    const provider = (ab.provider || 'sieuthicode').toLowerCase();
    const token = (ab.apiToken || '').trim();

    // 1. CỔNG MB BANK QUA SIEUTHICODE API (Đang kích hoạt)
    if (provider === 'sieuthicode' || provider.includes('mb') || (ab.apiUrl && ab.apiUrl.includes('sieuthicode'))) {
        if (!token) return;
        let urlStr = ab.apiUrl || 'https://api.sieuthicode.vn/historyapimbbank';
        urlStr = urlStr.trim();
        if (!urlStr.includes(token)) {
            urlStr = urlStr.replace(/\/+$/, '') + '/' + token;
        }

        try {
            const url = new URL(urlStr);
            https.get({
                hostname: url.hostname,
                path: url.pathname + url.search,
                headers: { 'Accept': 'application/json' },
                timeout: 12000
            }, res => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', async () => {
                    try {
                        const json = JSON.parse(body);
                        if (json && json.status === 'success' && Array.isArray(json.TranList)) {
                            for (const tx of json.TranList) {
                                const credit = Number(tx.creditAmount || 0);
                                if (credit > 0) {
                                    const content = tx.description || tx.addDescription || '';
                                    const refId = tx.refNo || tx.tranId || ('MB-' + Date.now());
                                    await processAutoBankTransaction({
                                        amount: credit,
                                        content: content,
                                        refId: refId,
                                        gateway: 'MBBank'
                                    });
                                }
                            }
                        }
                    } catch (e) {}
                });
            }).on('error', () => {});
        } catch (err) {}
    }
    // 2. CỔNG SEPAY.VN
    else if (provider === 'sepay') {
        if (!token) return;
        try {
            const accNo = ab.accountNumber || cfg.bank?.accountNumber || '22220009999';
            const urlStr = `https://my.sepay.vn/userapi/transactions/list?account_number=${encodeURIComponent(accNo)}&limit=15`;
            const url = new URL(urlStr);

            https.get({
                hostname: url.hostname,
                path: url.pathname + url.search,
                headers: {
                    'Authorization': `Apikey ${token}`,
                    'Content-Type': 'application/json'
                },
                timeout: 10000
            }, res => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', async () => {
                    try {
                        const data = JSON.parse(body);
                        if (data && Array.isArray(data.transactions)) {
                            for (const tx of data.transactions) {
                                const amtIn = Number(tx.amount_in || 0);
                                if (amtIn > 0) {
                                    await processAutoBankTransaction({
                                        amount: amtIn,
                                        content: tx.transaction_content,
                                        refId: tx.reference_number || tx.id,
                                        gateway: 'SePAY'
                                    });
                                }
                            }
                        }
                    } catch (e) {}
                });
            }).on('error', () => {});
        } catch (e) {}
    }
}

// Hàm kiểm tra kết nối API MB Bank Sieuthicode thực tế (cho nút test trên Web Manager)
async function checkAutoBankConnection() {
    const cfg = loadConfig();
    const ab = cfg.autobank || {};
    const token = (ab.apiToken || '0faba70e2f6747c9d22c1f346b1c4877').trim();
    let urlStr = (ab.apiUrl || 'https://api.sieuthicode.vn/historyapimbbank').trim();
    if (!urlStr.includes(token)) {
        urlStr = urlStr.replace(/\/+$/, '') + '/' + token;
    }

    return new Promise((resolve) => {
        try {
            const url = new URL(urlStr);
            https.get({
                hostname: url.hostname,
                path: url.pathname + url.search,
                headers: { 'Accept': 'application/json' },
                timeout: 12000
            }, res => {
                let body = '';
                res.on('data', c => body += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(body);
                        if (json && json.status === 'success' && Array.isArray(json.TranList)) {
                            const latest = json.TranList.slice(0, 5);
                            resolve({
                                success: true,
                                provider: 'sieuthicode',
                                message: `Kết nối API MB Bank thành công! Nhận được ${json.TranList.length} giao dịch gần nhất.`,
                                totalTransactions: json.TranList.length,
                                latestTransactions: latest
                            });
                        } else {
                            resolve({
                                success: false,
                                provider: 'sieuthicode',
                                message: json.message || 'API trả về phản hồi không hợp lệ',
                                raw: json
                            });
                        }
                    } catch (e) {
                        resolve({ success: false, message: 'Lỗi parse JSON từ API MB Bank: ' + e.message, raw: body });
                    }
                });
            }).on('error', (err) => {
                resolve({ success: false, message: 'Lỗi kết nối API MB Bank: ' + err.message });
            });
        } catch (e) {
            resolve({ success: false, message: 'URL API không hợp lệ: ' + e.message });
        }
    });
}

function startAutoBankPolling() {
    if (autoBankInterval) clearInterval(autoBankInterval);
    // Chạy kiểm tra ngay lần đầu
    checkAutoBankPolling().catch(() => {});
    // Định kỳ 12 giây / lần
    autoBankInterval = setInterval(checkAutoBankPolling, 12000);
    console.log(`⚡ [AUTOBANK] Đã kích hoạt Polling giao dịch ngân hàng tự động (12s/lần)`);
}

// Tính giá bán sau markup & custom price (Luôn đảm bảo >= giá gốc API để không bao giờ bị lỗ)
function getSellingPrice(product) {
    const cfg = loadConfig();
    const d = loadData();
    const pid = product.productId;
    const basePrice = product.price && product.price.amount ? product.price.amount : 0;

    // Xem có ghi đè giá riêng cho sản phẩm này không
    if (d.productOverrides && d.productOverrides[pid] && d.productOverrides[pid].customPrice) {
        // RÀNG BUỘC TUYỆT ĐỐI: Giá bán không bao giờ được thấp hơn giá gốc API
        return Math.max(basePrice, Number(d.productOverrides[pid].customPrice));
    }

    const markup = cfg.markupPercent || 0;
    if (markup <= 0) return basePrice;

    const selling = Math.round(basePrice * (1 + markup / 100) / 1000) * 1000;
    return Math.max(basePrice, selling);
}

// Phân loại nhóm sản phẩm
function categorizeProduct(product) {
    const name = (product.name || '').toLowerCase();
    const emoji = (product.emoji || '').toLowerCase();
    const desc = (product.description || '').toLowerCase();

    if (name.includes('capcut') || emoji.includes('capcut')) return 'capcut';
    if (name.includes('chatgpt') || name.includes('gpt') || name.includes('openai') || name.includes('claude') || name.includes('gemini') || name.includes('midjourney')) return 'ai';
    if (name.includes('netflix') || name.includes('youtube') || name.includes('vieon') || name.includes('k+') || name.includes('fpt') || name.includes('tv') || name.includes('film')) return 'entertainment';
    if (name.includes('canva') || name.includes('adobe') || name.includes('freepik') || name.includes('figma')) return 'design';
    if (name.includes('spotify') || name.includes('duolingo') || name.includes('elsa') || name.includes('coursera') || name.includes('udemy')) return 'study';
    if (name.includes('vpn') || name.includes('1.1.1.1') || name.includes('surfshark') || name.includes('nordvpn') || name.includes('expressvpn') || name.includes('telegram') || name.includes('discord')) return 'vpn';
    if (name.includes('office') || name.includes('windows') || name.includes('drive') || name.includes('google') || name.includes('onedrive')) return 'tools';
    return 'other';
}

const CATEGORY_NAMES = {
    'all': '🌟 Tất Cả Sản Phẩm',
    'capcut': '🎬 Capcut Pro & Edit',
    'ai': '🤖 Trí Tuệ Nhân Tạo (AI)',
    'entertainment': '🍿 Giải Trí & Xem Phim',
    'design': '🎨 Thiết Kế & Đồ Họa',
    'study': '🎵 Âm Nhạc & Học Tập',
    'vpn': '🛡️ VPN & Tài Khoản Mạng',
    'tools': '💻 Microsoft, Google & Tools',
    'other': '📦 Dịch Vụ Khác'
};

// --- GIAO DIỆN TIN NHẮN BOT TELEGRAM ---

// 1. Menu chính
async function sendMainMenu(chatId, messageId = null, fromUser = null) {
    const cfg = loadConfig();
    const d = loadData();
    const uid = String(chatId);
    const user = d.users[uid] || { balance: 0, first_name: fromUser ? fromUser.first_name : 'Khách' };
    const myOrders = d.orders.filter(o => String(o.chatId) === uid);

    const isAdmin = String(chatId) === String(cfg.adminId);

    const text = `👋 <b>XIN CHÀO ${user.first_name ? user.first_name.toUpperCase() : 'BẠN'}!</b>
━━━━━━━━━━━━━━━━━━
💰 <b>Số dư ví:</b> <code>${formatMoney(user.balance)}</code>
📦 <b>Đã mua:</b> <code>${myOrders.length} đơn hàng</code>
🆔 <b>Telegram ID:</b> <code>${chatId}</code>

<i>${cfg.welcomeMessage || 'Hệ thống cung cấp tài khoản Premium bản quyền giá rẻ, bảo hành uy tín 24/7!'}</i>
━━━━━━━━━━━━━━━━━━
👇 <i>Vui lòng chọn chức năng bạn muốn sử dụng:</i>`;

    const inline_keyboard = [
        [
            { text: '🛒 SẢN PHẨM PREMIUM', callback_data: 'cat_all_1' },
            { text: '💳 NẠP TIỀN VÀO VÍ', callback_data: 'wallet_deposit' }
        ],
        [
            { text: '📦 ĐƠN HÀNG CỦA TÔI', callback_data: 'my_orders_1' },
            { text: '💰 VÍ & LỊCH SỬ', callback_data: 'wallet_info' }
        ],
        [
            { text: '🔍 TÌM KIẾM SẢN PHẨM', callback_data: 'search_prompt' },
            { text: '🛡️ CHÍNH SÁCH BẢO HÀNH', callback_data: 'warranty_policy' }
        ],
        [
            { text: '📢 THÔNG BÁO TỪ BQT', callback_data: 'announcements_view' },
            { text: '📞 HỖ TRỢ ADMIN 24/7', callback_data: 'support_info' }
        ]
    ];

    if (isAdmin) {
        inline_keyboard.push([
            { text: '👑 QUẢN TRỊ VIÊN (ADMIN PANEL)', callback_data: 'admin_panel' }
        ]);
    }

    if (messageId) {
        const editRes = await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
        if (!editRes || !editRes.ok) {
            try { await deleteMessage(chatId, messageId); } catch (e) {}
            await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
        }
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 2. Danh mục & Danh sách sản phẩm (Phân trang mượt mà)
async function sendProductList(chatId, messageId, category = 'all', page = 1, searchQuery = '') {
    const products = await fetchProducts();
    const d = loadData();
    const cfg = loadConfig();
    const motherBal = await getMotherBotBalance();
    const autoFilter = cfg.autoBalanceFilter !== false;

    let filtered = products.filter(p => {
        // Kiểm tra xem admin có tắt sản phẩm này thủ công không
        if (d.productOverrides && d.productOverrides[p.productId] && d.productOverrides[p.productId].enabled === false) {
            return false;
        }

        // TỰ ĐỘNG LỌC THEO SỐ DƯ VÍ MẸ (CANBOSO API):
        // Nếu ví mẹ có 20k thì SP có giá gốc <= 20k sẽ hiện lên; SP có giá gốc > 20k sẽ tự động ẩn đi
        if (autoFilter) {
            const orig = (p.price && typeof p.price.amount === 'number') ? p.price.amount : (typeof p.price === 'number' ? p.price : (p.originalPrice || 0));
            if (orig > motherBal) {
                return false;
            }
        }

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
        }

        if (category === 'all') return true;
        return categorizeProduct(p) === category;
    });

    const pageSize = 6;
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    const startIdx = (page - 1) * pageSize;
    const pageItems = filtered.slice(startIdx, startIdx + pageSize);

    let title = CATEGORY_NAMES[category] || 'Sản phẩm';
    if (searchQuery) title = `🔍 Kết quả tìm kiếm: "${searchQuery}"`;

    let text = `🛍️ <b>${title.toUpperCase()}</b>
━━━━━━━━━━━━━━━━━━
<i>Trang ${page}/${totalPages} | Tìm thấy ${filtered.length} sản phẩm</i>
━━━━━━━━━━━━━━━━━━\n`;

    if (pageItems.length === 0) {
        text += `\n<i>Hiện chưa có sản phẩm nào trong mục này hoặc đã tạm hết hàng. Vui lòng quay lại sau!</i>`;
    }

    const inline_keyboard = [];

    // Nút sản phẩm
    for (const p of pageItems) {
        const price = getSellingPrice(p);
        const avail = (p.availability && typeof p.availability.available === 'number') ? p.availability.available : 'N/A';
        const stockIcon = (avail > 0 || avail === 'N/A') ? '🟢' : '🔴';
        const stockText = (avail > 0 || avail === 'N/A') ? `(Còn ${avail})` : '(Hết hàng)';

        inline_keyboard.push([
            {
                text: `${stockIcon} ${p.name.substring(0, 28)} - ${formatMoney(price)} ${stockText}`,
                callback_data: `p_view_${p.productId}_${category}_${page}`
            }
        ]);
    }

    // Nút chuyển trang
    const navRow = [];
    if (page > 1) {
        navRow.push({ text: '⬅️ Trước', callback_data: `cat_${category}_${page - 1}` });
    }
    navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'noop' });
    if (page < totalPages) {
        navRow.push({ text: 'Sau ➡️', callback_data: `cat_${category}_${page + 1}` });
    }
    if (navRow.length > 1) inline_keyboard.push(navRow);

    // Hàng chọn danh mục khác
    inline_keyboard.push([
        { text: '🎬 Capcut', callback_data: 'cat_capcut_1' },
        { text: '🤖 AI/GPT', callback_data: 'cat_ai_1' },
        { text: '🍿 Giải Trí', callback_data: 'cat_entertainment_1' }
    ]);
    inline_keyboard.push([
        { text: '🎨 Canva/Đồ Họa', callback_data: 'cat_design_1' },
        { text: '🛡️ VPN/Mạng', callback_data: 'cat_vpn_1' },
        { text: '🌟 Tất Cả', callback_data: 'cat_all_1' }
    ]);
    inline_keyboard.push([
        { text: '🔍 Tìm Sản Phẩm Khác', callback_data: 'search_prompt' },
        { text: '🔙 Quay Lại Menu', callback_data: 'menu_main' }
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 3. Xem chi tiết 1 sản phẩm
async function sendProductDetail(chatId, messageId, productId, returnCategory = 'all', returnPage = 1) {
    const products = await fetchProducts();
    const product = products.find(p => p.productId === productId);

    if (!product) {
        await answerCallbackQuery(chatId, 'Sản phẩm không tồn tại hoặc đã ngừng kinh doanh!', true);
        return sendProductList(chatId, messageId, returnCategory, returnPage);
    }

    const cfg = loadConfig();
    const motherBal = await getMotherBotBalance();
    const autoFilter = cfg.autoBalanceFilter !== false;
    const orig = product.price && product.price.amount ? product.price.amount : 0;

    // Kiểm tra nếu sản phẩm bị tự động ẩn do thiếu vốn ví mẹ
    if (autoFilter && orig > motherBal) {
        await answerCallbackQuery(chatId, '⚠️ Sản phẩm này hiện tạm hết hạn mức cung ứng. Vui lòng chọn sản phẩm khác hoặc liên hệ Admin!', true);
        return sendProductList(chatId, messageId, returnCategory, returnPage);
    }

    const price = getSellingPrice(product);
    const balance = getUserBalance(chatId);
    const avail = (product.availability && typeof product.availability.available === 'number') ? product.availability.available : 'Sẵn sàng';
    const isOutOfStock = (avail === 0);

    let typeText = 'Tài khoản có sẵn (Giao tức thì)';
    if (product.productType === 'slot') typeText = 'Slot mời qua Email (Chính chủ)';
    if (product.productType === 'upgrade_account') typeText = 'Nâng cấp trực tiếp tài khoản của bạn';

    let text = `📦 <b>THÔNG TIN SẢN PHẨM</b>
━━━━━━━━━━━━━━━━━━
🏷️ <b>Tên:</b> <b>${product.name}</b>
💰 <b>Giá bán:</b> <code>${formatMoney(price)}</code>
📦 <b>Tình trạng:</b> ${isOutOfStock ? '🔴 <b>Tạm hết hàng</b>' : `🟢 <b>Còn hàng</b> (${avail} cái)`}
⚙️ <b>Loại:</b> <i>${typeText}</i>
💳 <b>Ví của bạn:</b> <code>${formatMoney(balance)}</code>
━━━━━━━━━━━━━━━━━━
📝 <b>MÔ TẢ & BẢO HÀNH:</b>
${product.description ? product.description.substring(0, 700) : 'Tài khoản Premium bản quyền chất lượng cao, bảo hành đầy đủ suốt thời hạn.'}
━━━━━━━━━━━━━━━━━━`;

    const inline_keyboard = [];

    if (!isOutOfStock) {
        if (balance >= price) {
            inline_keyboard.push([
                { text: `⚡ MUA NGAY BẰNG VÍ (${formatMoney(price)})`, callback_data: `buy_confirm_${product.productId}` }
            ]);
        } else {
            const needMore = price - balance;
            inline_keyboard.push([
                { text: `💳 NẠP THÊM TIỀN (Thiếu ${formatMoney(needMore)})`, callback_data: `deposit_for_${price}` }
            ]);
        }
    } else {
        inline_keyboard.push([
            { text: '⚠️ SẢN PHẨM TẠM HẾT HÀNG', callback_data: 'noop' }
        ]);
    }

    inline_keyboard.push([
        { text: '🔙 Quay lại danh sách', callback_data: `cat_${returnCategory}_${returnPage}` },
        { text: '🏠 Về Menu', callback_data: 'menu_main' }
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 4. Xử lý mua hàng thực tế
async function handleBuyProduct(chatId, messageId, productId, extraInput = {}) {
    const products = await fetchProducts();
    const product = products.find(p => p.productId === productId);

    if (!product) {
        return sendMessage(chatId, '❌ Sản phẩm không tồn tại hoặc đã bị gỡ!');
    }

    const price = getSellingPrice(product);
    const balance = getUserBalance(chatId);

    if (balance < price) {
        return sendMessage(chatId, `❌ Số dư ví không đủ! Cần <b>${formatMoney(price)}</b>, bạn đang có <b>${formatMoney(balance)}</b>.\nVui lòng chọn "Nạp tiền vào ví" trước.`);
    }

    // Nếu sản phẩm loại Slot cần email khách
    if (product.productType === 'slot' && !extraInput.email) {
        userStates[chatId] = {
            step: 'awaiting_slot_email',
            data: { productId, returnCategory: 'all', returnPage: 1 }
        };
        return sendMessage(chatId, `📧 <b>SẢN PHẨM YÊU CẦU EMAIL:</b>\n\nSản phẩm <b>${product.name}</b> được kích hoạt trực tiếp vào Email cá nhân của bạn.\n\n👉 <i>Vui lòng nhập Email của bạn gửi vào đây:</i>`);
    }

    // Nếu sản phẩm nâng cấp tài khoản
    if (product.productType === 'upgrade_account' && !extraInput.account) {
        userStates[chatId] = {
            step: 'awaiting_upgrade_account',
            data: { productId, returnCategory: 'all', returnPage: 1 }
        };
        return sendMessage(chatId, `👤 <b>SẢN PHẨM YÊU CẦU TÀI KHOẢN NÂNG CẤP:</b>\n\nSản phẩm <b>${product.name}</b> yêu cầu tên tài khoản / ID cần nâng cấp.\n\n👉 <i>Vui lòng nhập thông tin tài khoản của bạn gửi vào đây:</i>`);
    }

    // Kiểm tra số dư ví Bot Mẹ (nguồn Canboso API):
    // Đảm bảo bot mẹ đủ tiền thanh toán cho nhà phân phối Canboso
    const cfg = loadConfig();
    const motherBal = await getMotherBotBalance(true);
    const origCost = product.price && product.price.amount ? product.price.amount : 0;
    if (cfg.autoBalanceFilter !== false && origCost > motherBal) {
        return sendMessage(chatId, `⚠️ <b>TẠM THỜI CHƯA THỂ MUA:</b>\n\nSản phẩm này hiện đang tạm hết hạn mức cung ứng từ nhà phân phối API (Giá gốc: ${formatMoney(origCost)} > Hạn mức ví mẹ: ${formatMoney(motherBal)}).\nVui lòng chọn sản phẩm khác hoặc liên hệ Admin để được hỗ trợ!`);
    }

    // Thông báo đang xử lý
    await sendMessage(chatId, `⏳ Đang xử lý giao dịch đơn hàng qua hệ thống Canboso API, vui lòng đợi vài giây...`);

    try {
        const purchaseOpts = {};
        if (extraInput.email) purchaseOpts.customer_email = extraInput.email;
        if (extraInput.account) purchaseOpts.customer_accounts = [extraInput.account];

        // Gọi Canboso API mua hàng
        const res = await purchaseCanbosoProduct(productId, 1, purchaseOpts);

        if (res.status === 200 && res.data && res.data.success) {
            // Cập nhật lại số dư ví mẹ ngay sau khi trừ tiền mua
            getMotherBotBalance(true).catch(() => {});

            // Trừ tiền trong ví
            adjustUserBalance(chatId, -price, `Mua: ${product.name}`);

            const orderData = res.data.order || {};
            const delivery = res.data.delivery || {};
            const accounts = delivery.accounts || [];

            const d = loadData();
            const localOrder = {
                id: 'ORD-' + Date.now(),
                orderCode: orderData.orderCode || ('CB-' + Date.now()),
                canbosoOrderCode: orderData.orderCode || '',
                chatId: chatId,
                username: (d.users[String(chatId)] && d.users[String(chatId)].username) || '',
                productId: productId,
                productName: product.name,
                productType: product.productType,
                price: price,
                deliveryAccounts: accounts,
                status: 'completed',
                fulfillmentStatus: orderData.fulfillmentStatus || 'delivered',
                createdAt: new Date().toISOString(),
                warrantyNote: product.description || ''
            };

            d.orders = d.orders || [];
            d.orders.unshift(localOrder);
            saveData(d);

            addLog('order', `Khách ${chatId} mua thành công: ${product.name} (Mã đơn: ${localOrder.orderCode}, Giá: ${formatMoney(price)})`);

            // Soạn tin bàn giao tài khoản đẹp mắt & copyable
            let deliveryText = '';
            if (accounts.length > 0) {
                deliveryText = `\n🔑 <b>THÔNG TIN TÀI KHOẢN BÀN GIAO:</b>\n━━━━━━━━━━━━━━━━━━\n`;
                accounts.forEach((acc, i) => {
                    deliveryText += `👤 <b>Tài khoản:</b> <code>${acc.user || 'N/A'}</code>\n`;
                    deliveryText += `🔑 <b>Mật khẩu:</b> <code>${acc.password || 'N/A'}</code>\n`;
                    if (acc.verifyEmail) {
                        deliveryText += `📨 <b>Email khôi phục:</b> <code>${acc.verifyEmail}</code>\n`;
                    }
                    deliveryText += `\n📋 <b>Chuỗi sao chép nhanh (User|Pass):</b>\n<code>${acc.user}|${acc.password}</code>\n━━━━━━━━━━━━━━━━━━\n`;
                });
            } else if (extraInput.email) {
                deliveryText = `\n📧 <b>TRẠNG THÁI SLOT EMAIL:</b>\nĐã gửi lời mời tham gia đến: <code>${extraInput.email}</code>. Vui lòng kiểm tra hộp thư đến (hoặc hòm thư Spam) để chấp nhận lời mời!\n━━━━━━━━━━━━━━━━━━\n`;
            } else {
                deliveryText = `\n✅ <b>ĐÃ TIẾP NHẬN ĐƠN HÀNG:</b> Đơn hàng đã được ghi nhận trên hệ thống và đang được xử lý!\n━━━━━━━━━━━━━━━━━━\n`;
            }

            const successMsg = `🎉 <b>ĐẶT HÀNG THÀNH CÔNG!</b>
━━━━━━━━━━━━━━━━━━
🧾 <b>Mã đơn hàng:</b> <code>${localOrder.orderCode}</code>
🏷️ <b>Sản phẩm:</b> <b>${product.name}</b>
💵 <b>Thanh toán:</b> <code>${formatMoney(price)}</code>
💰 <b>Số dư còn lại:</b> <code>${formatMoney(getUserBalance(chatId))}</code>
${deliveryText}
⚠️ <b>LƯU Ý QUAN TRỌNG:</b>
${product.description ? product.description.substring(0, 400) : 'Vui lòng sử dụng đúng quy định để được hỗ trợ bảo hành đầy đủ.'}

🛡️ <i>Nếu có bất kỳ lỗi nào, bạn có thể bấm vào "Đơn Hàng Của Tôi" -> "Báo lỗi bảo hành" để được hỗ trợ ngay lập tức!</i>`;

            const replyMarkup = {
                inline_keyboard: [
                    [
                        { text: '📦 Xem Lại Đơn Hàng', callback_data: `order_view_${localOrder.id}` },
                        { text: '🛒 Mua Tiếp Sản Phẩm', callback_data: 'cat_all_1' }
                    ],
                    [
                        { text: '🏠 Về Menu Chính', callback_data: 'menu_main' }
                    ]
                ]
            };

            await sendMessage(chatId, successMsg, { reply_markup: replyMarkup });

            // Báo cho Admin biết có đơn mới
            const cfg = loadConfig();
            if (cfg.adminId && String(cfg.adminId) !== String(chatId)) {
                sendMessage(cfg.adminId, `🔔 <b>CÓ ĐƠN HÀNG MỚI!</b>\nKhách: <code>${chatId}</code> (@${d.users[String(chatId)]?.username || 'none'})\nSản phẩm: <b>${product.name}</b>\nGiá: <b>${formatMoney(price)}</b>\nMã đơn: <code>${localOrder.orderCode}</code>`);
            }
        } else {
            console.error('Lỗi khi gọi Canboso purchase:', res);
            const errDetail = (res.data && res.data.message) ? res.data.message : 'Kho API đang bảo trì hoặc số dư nhà cung cấp chưa đủ';
            await sendMessage(chatId, `❌ <b>GIAO DỊCH THẤT BẠI!</b>\n\nLý do: <i>${errDetail}</i>\n\nSố dư của bạn <b>KHÔNG</b> bị trừ. Vui lòng liên hệ Admin để được hỗ trợ!`);
        }
    } catch (e) {
        console.error('Lỗi ngoại lệ purchase:', e);
        await sendMessage(chatId, `❌ Lỗi kết nối hệ thống: ${e.message}. Vui lòng thử lại sau ít phút.`);
    }
}

// 5. Giao diện Chọn số tiền cần nạp trước khi hiện mã VietQR
async function sendDepositAmountPrompt(chatId, messageId = null) {
    const d = loadData();
    const uid = String(chatId);
    const user = d.users[uid] || { balance: 0 };
    const cfg = loadConfig();
    const bank = cfg.bank || {};

    const text = `💳 <b>NẠP TIỀN VÀO TÀI KHOẢN (VIETQR 24/7)</b>
━━━━━━━━━━━━━━━━━━
💰 <b>Số dư ví hiện tại:</b> <code>${formatMoney(user.balance)}</code>
🏦 <b>Ngân hàng:</b> <code>${bank.bankName || bank.bankCode || 'MBBank'}</code> (STK: <code>${bank.accountNumber || '22220009999'}</code>)

👇 <b>Vui lòng chọn hoặc nhập số tiền bạn muốn nạp:</b>
<i>Sau khi chọn số tiền, hệ thống sẽ tự động tạo mã QR chính xác để bạn quét thanh toán và cộng tiền tự động sau 5 - 30 giây!</i>`;

    const inline_keyboard = [
        [
            { text: '💵 10.000 ₫', callback_data: 'dep_amt_10000' },
            { text: '💵 20.000 ₫', callback_data: 'dep_amt_20000' },
            { text: '💵 50.000 ₫', callback_data: 'dep_amt_50000' }
        ],
        [
            { text: '💵 100.000 ₫', callback_data: 'dep_amt_100000' },
            { text: '💵 200.000 ₫', callback_data: 'dep_amt_200000' },
            { text: '💵 500.000 ₫', callback_data: 'dep_amt_500000' }
        ],
        [
            { text: '✏️ Nhập số tiền khác', callback_data: 'dep_custom' }
        ],
        [
            { text: '🔙 Quay Lại Menu Chính', callback_data: 'menu_main' }
        ]
    ];

    if (messageId) {
        const editRes = await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
        if (editRes && editRes.ok) return editRes;
        try { await deleteMessage(chatId, messageId); } catch (e) {}
    }

    return await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
}

// 6. Giao diện Nạp tiền Ngân hàng (Hiển thị ảnh VietQR trực tiếp sau khi chọn số tiền)
async function sendDepositMenu(chatId, messageId = null, prefilledAmount = 50000) {
    const cfg = loadConfig();
    const bank = cfg.bank || {};
    const amount = Number(prefilledAmount) > 0 ? Number(prefilledAmount) : 50000;
    const syntax = `${bank.depositSyntax || 'NAP'} ${chatId}`;

    const text = `💳 <b>NẠP TIỀN TỰ ĐỘNG QUA NGÂN HÀNG (VIETQR)</b>
━━━━━━━━━━━━━━━━━━
🏦 <b>Ngân hàng:</b> <code>${bank.bankName || bank.bankCode || 'MBBank'}</code>
🔢 <b>Số tài khoản:</b> <code>${bank.accountNumber || '22220009999'}</code>
👤 <b>Chủ tài khoản:</b> <code>${bank.accountHolder || 'VU NGOC TRUONG'}</code>
💵 <b>Số tiền nạp:</b> <code>${formatMoney(amount)}</code>
📝 <b>Nội dung chuyển khoản (BẮT BUỘC):</b>
👉 <code>${syntax}</code> <i>(Chạm vào mã để sao chép)</i>
━━━━━━━━━━━━━━━━━━
⚡ <b>HỆ THỐNG AUTO BANK TỰ ĐỘNG 24/7:</b>
1️⃣ Quét mã QR ở trên hoặc chuyển khoản đúng STK + Nội dung.
2️⃣ <b>Tiền sẽ được tự động cộng vào ví sau 5 - 30 giây!</b>
3️⃣ <b>KHÔNG CẦN CHỜ DUYỆT</b> - Hệ thống ngân hàng tự động nhận diện và cập nhật số dư ngay khi bạn chuyển khoản thành công.`;

    const inline_keyboard = [
        [
            { text: '🔍 KIỂM TRA GIAO DỊCH', callback_data: 'check_balance_now' }
        ],
        [
            { text: '🔄 Chọn Lại Số Tiền Khác', callback_data: 'wallet_deposit' },
            { text: '🔙 Quay Lại Menu Chính', callback_data: 'menu_main' }
        ]
    ];

    // Xóa tin nhắn câu hỏi chọn số tiền trước đó (hoặc tin nhắn cũ) nếu có
    if (messageId) {
        try {
            await deleteMessage(chatId, messageId);
        } catch (e) {}
    }

    // Xóa mã QR cũ nếu người dùng đã tạo trước đó mà chưa thanh toán
    await removeUserQrMessage(chatId);

    // Tạo ảnh QR Napas 24/7 trực tiếp cho đúng số tiền vừa chọn
    const qrBuffer = await getVietQrBuffer(bank.bankCode, bank.accountNumber, bank.accountHolder, amount, syntax);

    if (qrBuffer) {
        // Gửi tin nhắn ảnh mã QR mới
        const photoRes = await sendPhotoBuffer(chatId, qrBuffer, text, { reply_markup: { inline_keyboard } });
        if (photoRes && photoRes.ok && photoRes.result) {
            rememberQrMessage(chatId, photoRes.result.message_id);
            return photoRes;
        }
    }

    // Dự phòng trường hợp lỗi mạng không lấy được ảnh
    const msgRes = await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    if (msgRes && msgRes.ok && msgRes.result) {
        rememberQrMessage(chatId, msgRes.result.message_id);
    }
    return msgRes;
}

// 6. Đơn hàng của tôi
async function sendMyOrders(chatId, messageId = null, page = 1) {
    const d = loadData();
    const uid = String(chatId);
    const myOrders = (d.orders || []).filter(o => String(o.chatId) === uid);

    const pageSize = 5;
    const totalPages = Math.max(1, Math.ceil(myOrders.length / pageSize));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    const startIdx = (page - 1) * pageSize;
    const items = myOrders.slice(startIdx, startIdx + pageSize);

    let text = `📦 <b>DANH SÁCH ĐƠN HÀNG ĐÃ MUA</b>
━━━━━━━━━━━━━━━━━━
<i>Tổng cộng: ${myOrders.length} đơn hàng | Trang ${page}/${totalPages}</i>
━━━━━━━━━━━━━━━━━━\n`;

    if (items.length === 0) {
        text += `\n<i>Bạn chưa có đơn hàng nào. Hãy bấm "🛒 SẢN PHẨM PREMIUM" để chọn tài khoản yêu thích nhé!</i>`;
    }

    const inline_keyboard = [];

    for (const ord of items) {
        const timeStr = new Date(ord.createdAt).toLocaleDateString('vi-VN');
        inline_keyboard.push([
            {
                text: `📦 #${ord.orderCode} - ${ord.productName.substring(0, 20)} (${timeStr})`,
                callback_data: `order_view_${ord.id}`
            }
        ]);
    }

    const navRow = [];
    if (page > 1) navRow.push({ text: '⬅️ Trước', callback_data: `my_orders_${page - 1}` });
    navRow.push({ text: `📄 ${page}/${totalPages}`, callback_data: 'noop' });
    if (page < totalPages) navRow.push({ text: 'Sau ➡️', callback_data: `my_orders_${page + 1}` });
    if (navRow.length > 1) inline_keyboard.push(navRow);

    inline_keyboard.push([
        { text: '🛒 Mua Sản Phẩm Mới', callback_data: 'cat_all_1' },
        { text: '🏠 Về Menu Chính', callback_data: 'menu_main' }
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 7. Xem chi tiết đơn hàng & Nút Bảo Hành
async function sendOrderDetail(chatId, messageId, orderId) {
    const d = loadData();
    const ord = (d.orders || []).find(o => o.id === orderId);

    if (!ord) {
        await answerCallbackQuery(chatId, 'Đơn hàng không tìm thấy!', true);
        return sendMyOrders(chatId, messageId, 1);
    }

    const timeStr = new Date(ord.createdAt).toLocaleString('vi-VN');
    const accounts = ord.deliveryAccounts || [];

    let accText = '';
    if (accounts.length > 0) {
        accText = `\n🔑 <b>THÔNG TIN ĐĂNG NHẬP:</b>\n━━━━━━━━━━━━━━━━━━\n`;
        accounts.forEach(acc => {
            accText += `👤 Tài khoản: <code>${acc.user}</code>\n`;
            accText += `🔑 Mật khẩu: <code>${acc.password}</code>\n`;
            if (acc.verifyEmail) accText += `📨 Mail khôi phục: <code>${acc.verifyEmail}</code>\n`;
            accText += `📋 Copy: <code>${acc.user}|${acc.password}</code>\n`;
        });
    }

    const text = `🧾 <b>CHI TIẾT ĐƠN HÀNG #${ord.orderCode}</b>
━━━━━━━━━━━━━━━━━━
🏷️ <b>Sản phẩm:</b> <b>${ord.productName}</b>
💵 <b>Giá mua:</b> <code>${formatMoney(ord.price)}</code>
⏱️ <b>Thời gian:</b> <code>${timeStr}</code>
📌 <b>Trạng thái:</b> <code>${ord.status === 'completed' ? '🟢 Thành công' : ord.status}</code>
━━━━━━━━━━━━━━━━━━${accText}
🛡️ <b>CHÍNH SÁCH BẢO HÀNH:</b>
Hỗ trợ 1 đổi 1 trong thời hạn sử dụng. Nếu tài khoản bị lỗi mật khẩu, hết hạn, mất gói... vui lòng bấm nút gửi bảo hành bên dưới!`;

    const inline_keyboard = [
        [
            { text: '🛡️ GỬI YÊU CẦU BẢO HÀNH (BÁO LỖI)', callback_data: `warr_req_${ord.id}` }
        ],
        [
            { text: '🔙 Quay Lại Danh Sách Đơn', callback_data: 'my_orders_1' },
            { text: '🏠 Về Menu', callback_data: 'menu_main' }
        ]
    ];

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 8. Ví & Lịch sử
async function sendWalletInfo(chatId, messageId) {
    const d = loadData();
    const uid = String(chatId);
    const user = d.users[uid] || { balance: 0, totalDeposited: 0, totalSpent: 0 };
    const myDeposits = (d.deposits || []).filter(dep => String(dep.chatId) === uid).slice(0, 5);

    let depText = '';
    if (myDeposits.length > 0) {
        depText = `\n📋 <b>LỊCH SỬ NẠP TIỀN GẦN ĐÂY:</b>\n`;
        myDeposits.forEach(dep => {
            const time = new Date(dep.createdAt).toLocaleDateString('vi-VN');
            const st = dep.status === 'approved' ? '🟢 Đã duyệt' : (dep.status === 'pending' ? '🟡 Chờ duyệt' : '🔴 Từ chối');
            depText += `• ${time}: <b>+${formatMoney(dep.amount)}</b> (${st})\n`;
        });
    }

    const text = `💰 <b>THÔNG TIN VÍ TIỀN</b>
━━━━━━━━━━━━━━━━━━
💵 <b>Số dư hiện có:</b> <code>${formatMoney(user.balance)}</code>
📥 <b>Tổng tiền đã nạp:</b> <code>${formatMoney(user.totalDeposited)}</code>
📤 <b>Tổng tiền đã mua:</b> <code>${formatMoney(user.totalSpent)}</code>
━━━━━━━━━━━━━━━━━━${depText}
👉 <i>Bạn có thể nạp thêm tiền bất cứ lúc nào qua Ngân hàng / VietQR tự động 24/7!</i>`;

    const inline_keyboard = [
        [
            { text: '💳 NẠP TIỀN NGAY', callback_data: 'wallet_deposit' },
            { text: '🛒 MUA SẢN PHẨM', callback_data: 'cat_all_1' }
        ],
        [
            { text: '🔙 Về Menu Chính', callback_data: 'menu_main' }
        ]
    ];

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 9. Chính sách bảo hành
async function sendWarrantyPolicy(chatId, messageId) {
    const cfg = loadConfig();
    const text = `🛡️ <b>CHÍNH SÁCH BẢO HÀNH & CAM KẾT</b>
━━━━━━━━━━━━━━━━━━
${cfg.warrantyPolicy || '• Bảo hành 1 đổi 1 nhanh chóng nếu lỗi do nhà cung cấp.\n• Khách hàng vui lòng sử dụng đúng số lượng thiết bị quy định.\n• Không tự ý đổi mật khẩu đối với tài khoản cấp sẵn.'}
━━━━━━━━━━━━━━━━━━
📞 <b>Kênh liên hệ hỗ trợ:</b> ${cfg.supportContact || '@vntshared'}
⏱️ <b>Thời gian hỗ trợ:</b> 24/7`;

    const inline_keyboard = [
        [
            { text: '📦 Xem Đơn Hàng Của Tôi', callback_data: 'my_orders_1' },
            { text: '🔙 Về Menu Chính', callback_data: 'menu_main' }
        ]
    ];

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 10. Hỗ trợ Admin & Các Kênh Mạng Xã Hội
async function sendSupportInfo(chatId, messageId) {
    const cfg = loadConfig();
    const soc = cfg.socialSupport || {};
    const tgAdmin = soc.telegramAdmin || cfg.supportContact || '@vntshared';
    const tgClean = tgAdmin.replace('@', '').replace('https://t.me/', '');

    let text = `📞 <b>TRUNG TÂM HỖ TRỢ KHÁCH HÀNG 24/7</b>\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `👤 <b>Admin Quản Trị:</b> ${cfg.adminName || 'Ngọc Trường'}\n`;
    text += `⏰ <b>Khung giờ trực:</b> ${soc.workingHours || '08:00 - 24:00 (Hỗ trợ 24/7)'}\n\n`;
    text += `🌐 <b>CÁC KÊNH LIÊN HỆ & MXH HỖ TRỢ:</b>\n`;
    if (tgClean) text += `💬 <b>Telegram Admin:</b> @${tgClean}\n`;
    if (soc.zalo) text += `📱 <b>Zalo Hỗ Trợ:</b> <code>${soc.zalo}</code>\n`;
    if (soc.hotline) text += `☎️ <b>Hotline khẩn cấp:</b> <code>${soc.hotline}</code>\n`;
    if (soc.facebook) text += `🌐 <b>Facebook / Fanpage:</b> Có sẵn nút bên dưới\n`;
    if (soc.telegramChannel) text += `📢 <b>Kênh Thông Báo:</b> Có sẵn nút bên dưới\n`;
    if (soc.telegramGroup) text += `👥 <b>Nhóm Cộng Đồng:</b> Có sẵn nút bên dưới\n`;
    if (soc.tiktok) text += `🎬 <b>Kênh TikTok:</b> Có sẵn nút bên dưới\n`;
    text += `━━━━━━━━━━━━━━━━━━\n`;
    text += `💡 <i>${soc.supportNote || 'Khách hàng vui lòng chuẩn bị sẵn Mã đơn hàng hoặc Biên lai nạp tiền để được hỗ trợ nhanh nhất!'}</i>`;

    const inline_keyboard = [];

    // Hàng 1: Telegram + Zalo
    const row1 = [];
    if (tgClean) {
        row1.push({ text: '💬 Telegram Admin', url: `https://t.me/${tgClean}` });
    }
    if (soc.zalo) {
        const zaloUrl = soc.zalo.startsWith('http') ? soc.zalo : `https://zalo.me/${soc.zalo.replace(/\s+/g, '')}`;
        row1.push({ text: '📱 Zalo Hỗ Trợ', url: zaloUrl });
    }
    if (row1.length > 0) inline_keyboard.push(row1);

    // Hàng 2: Facebook / Messenger + Kênh Telegram
    const row2 = [];
    if (soc.facebook && soc.facebook.startsWith('http')) {
        row2.push({ text: '🌐 Fanpage Facebook', url: soc.facebook });
    } else if (soc.messenger) {
        const mUrl = soc.messenger.startsWith('http') ? soc.messenger : `https://m.me/${soc.messenger}`;
        row2.push({ text: '⚡ Messenger', url: mUrl });
    }
    if (soc.telegramChannel && soc.telegramChannel.startsWith('http')) {
        row2.push({ text: '📢 Kênh Tin Tức', url: soc.telegramChannel });
    }
    if (row2.length > 0) inline_keyboard.push(row2);

    // Hàng 3: Group + TikTok
    const row3 = [];
    if (soc.telegramGroup && soc.telegramGroup.startsWith('http')) {
        row3.push({ text: '👥 Nhóm Cộng Đồng', url: soc.telegramGroup });
    }
    if (soc.tiktok && soc.tiktok.startsWith('http')) {
        row3.push({ text: '🎬 Kênh TikTok', url: soc.tiktok });
    }
    if (row3.length > 0) inline_keyboard.push(row3);

    // Hàng cuối: Về Menu chính
    inline_keyboard.push([
        { text: '🔙 Về Menu Chính', callback_data: 'menu_main' }
    ]);

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// 11. Admin Panel trong Telegram
async function sendAdminPanel(chatId, messageId) {
    const cfg = loadConfig();
    if (String(chatId) !== String(cfg.adminId)) {
        return answerCallbackQuery(chatId, 'Bạn không có quyền truy cập menu này!', true);
    }

    const d = loadData();
    const canbosoBal = await fetchCanbosoBalance();

    const userCount = Object.keys(d.users || {}).length;
    const orderCount = (d.orders || []).length;
    const pendingDeposits = (d.deposits || []).filter(dep => dep.status === 'pending').length;
    const pendingWarranties = (d.warrantyTickets || []).filter(w => w.status === 'pending').length;

    let canbosoText = 'Chưa kết nối';
    if (canbosoBal) {
        canbosoText = canbosoBal.balanceText || formatMoney(canbosoBal.balance);
    }

    const text = `👑 <b>QUẢN TRỊ VIÊN - BẢNG ĐIỀU KHIỂN BOT</b>
━━━━━━━━━━━━━━━━━━
🏦 <b>Số dư ví Canboso:</b> <code>${canbosoText}</code>
👥 <b>Tổng khách hàng:</b> <code>${userCount} người</code>
📦 <b>Tổng đơn hàng:</b> <code>${orderCount} đơn</code>
💳 <b>Yêu cầu nạp chờ duyệt:</b> <code>${pendingDeposits} yêu cầu</code>
🛡️ <b>Khiếu nại bảo hành:</b> <code>${pendingWarranties} ticket</code>
━━━━━━━━━━━━━━━━━━
⚙️ <i>Lệnh chat nhanh dành cho Admin:</i>
• <code>/congtien &lt;ID&gt; &lt;SốTiền&gt;</code> (Cộng tiền ví khách)
• <code>/trutien &lt;ID&gt; &lt;SốTiền&gt;</code> (Trừ tiền ví khách)
• <code>/broadcast &lt;NộiDung&gt;</code> (Gửi thông báo tới toàn bộ khách)
• <code>/sync</code> (Đồng bộ lại kho sản phẩm Canboso)`;

    const inline_keyboard = [
        [
            { text: `💳 Duyệt Nạp Tiền (${pendingDeposits})`, callback_data: 'admin_deposits' },
            { text: `🛡️ Xử Lý Bảo Hành (${pendingWarranties})`, callback_data: 'admin_warranties' }
        ],
        [
            { text: '🔄 Đồng Bộ Canboso API', callback_data: 'admin_sync' },
            { text: '📢 Gửi Thông Báo (Broadcast)', callback_data: 'admin_broadcast_prompt' }
        ],
        [
            { text: '🌐 Mở Web Manager', url: `http://localhost:8080/telegram-bot-manager.html` }
        ],
        [
            { text: '🔙 Quay Lại Menu Chính', callback_data: 'menu_main' }
        ]
    ];

    if (messageId) {
        await editMessageText(chatId, messageId, text, { reply_markup: { inline_keyboard } });
    } else {
        await sendMessage(chatId, text, { reply_markup: { inline_keyboard } });
    }
}

// --- XỬ LÝ COMMANDS VÀ TIN NHẮN TỪ NGƯỜI DÙNG ---
async function handleMessage(msg) {
    if (!msg || !msg.chat) return;

    const chatId = msg.chat.id;
    const from = msg.from || msg.chat;
    const text = (msg.text || '').trim();

    getOrCreateUser(from);

    // Kiểm tra trạng thái đang chờ nhập dữ liệu (Multi-step flow)
    const state = userStates[chatId];
    if (state && !text.startsWith('/')) {
        // 1. Chờ nhập số tiền nạp tùy chỉnh
        if (state.step === 'awaiting_custom_deposit') {
            const promptMsgId = state.promptMsgId;
            delete userStates[chatId];
            const cleanText = text.toLowerCase().replace(/k/g, '000').replace(/[^0-9]/g, '');
            const amt = parseInt(cleanText);
            if (!amt || amt < 10000) {
                return sendMessage(chatId, '❌ Số tiền nạp tối thiểu là 10.000 ₫. Vui lòng bấm Nạp Tiền để chọn lại!');
            }
            if (promptMsgId) {
                try { await deleteMessage(chatId, promptMsgId); } catch (e) {}
            }
            return sendDepositMenu(chatId, null, amt);
        }

        // 2. Chờ nhập từ khóa tìm kiếm
        if (state.step === 'awaiting_search_query') {
            delete userStates[chatId];
            return sendProductList(chatId, null, 'all', 1, text);
        }

        // 3. Chờ nhập Email mua Slot
        if (state.step === 'awaiting_slot_email') {
            delete userStates[chatId];
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(text)) {
                return sendMessage(chatId, '❌ Email không hợp lệ. Vui lòng bấm vào sản phẩm và thử lại đúng định dạng Email!');
            }
            return handleBuyProduct(chatId, null, state.data.productId, { email: text });
        }

        // 4. Chờ nhập tài khoản cần nâng cấp
        if (state.step === 'awaiting_upgrade_account') {
            delete userStates[chatId];
            return handleBuyProduct(chatId, null, state.data.productId, { account: text });
        }

        // 5. Chờ nhập lý do bảo hành
        if (state.step === 'awaiting_warranty_reason') {
            delete userStates[chatId];
            const orderId = state.data.orderId;
            const d = loadData();
            const ord = (d.orders || []).find(o => o.id === orderId);

            if (!ord) return sendMessage(chatId, '❌ Đơn hàng không tồn tại!');

            const ticketId = 'WAR-' + Date.now();
            const ticket = {
                id: ticketId,
                orderId: ord.id,
                orderCode: ord.orderCode,
                chatId: chatId,
                username: from.username || '',
                productName: ord.productName,
                issueDescription: text,
                status: 'pending',
                createdAt: new Date().toISOString(),
                responseNote: ''
            };

            d.warrantyTickets = d.warrantyTickets || [];
            d.warrantyTickets.unshift(ticket);
            saveData(d);

            addLog('warranty', `Yêu cầu bảo hành mới từ ${chatId}: Đơn #${ord.orderCode} - Lý do: ${text}`);

            await sendMessage(chatId, `✅ <b>ĐÃ GỬI YÊU CẦU BẢO HÀNH THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━\n🧾 <b>Mã đơn:</b> <code>${ord.orderCode}</code>\n📝 <b>Nội dung lỗi:</b> <i>${text}</i>\n\n🛡️ Admin đã nhận được thông báo và sẽ kiểm tra, đổi mới hoặc hoàn tiền cho bạn sớm nhất!`);

            // Báo ngay cho Admin
            const cfg = loadConfig();
            if (cfg.adminId) {
                const adminKb = {
                    inline_keyboard: [
                        [
                            { text: '💰 Hoàn Tiền Vào Ví', callback_data: `admin_warr_refund_${ticketId}` },
                            { text: '✅ Đã Giải Quyết', callback_data: `admin_warr_done_${ticketId}` }
                        ]
                    ]
                };
                sendMessage(cfg.adminId, `🚨 <b>YÊU CẦU BẢO HÀNH MỚI!</b>\n━━━━━━━━━━━━━━━━━━\nKhách: <code>${chatId}</code> (@${from.username || 'none'})\nĐơn: <code>${ord.orderCode}</code> - <b>${ord.productName}</b>\nGiá: <b>${formatMoney(ord.price)}</b>\nLỗi khách báo: <i>"${text}"</i>`, { reply_markup: adminKb });
            }
            return;
        }

        // 6. Admin nhập thông báo broadcast
        if (state.step === 'awaiting_broadcast') {
            delete userStates[chatId];
            await sendMessage(chatId, '⏳ <i>Đang tự động phát thông báo BQT đến toàn bộ khách hàng...</i>');
            const res = await broadcastAnnouncement({
                title: 'Thông Báo Từ Ban Quản Trị',
                type: 'news',
                content: text,
                pinToBot: true
            });
            return sendMessage(chatId, `🎉 <b>ĐÃ PHÁT THÔNG BÁO BQT THÀNH CÔNG!</b>\nĐã gửi đến: <b>${res.sentCount}/${res.totalUsers}</b> người dùng!`);
        }
    }

    // --- LỆNH SLASH COMMANDS ---
    const lowerText = text.toLowerCase();
    const cmd = lowerText.split(' ')[0].split('@')[0];

    // 1. Menu chính
    if (cmd === '/start' || cmd === '/menu' || cmd === '/help') {
        return sendMainMenu(chatId, null, from);
    }

    // 2. Nạp tiền (hỗ trợ /nap, /topup, /naptien, /deposit)
    if (cmd === '/nap' || cmd === '/topup' || cmd === '/naptien' || cmd === '/deposit') {
        return sendDepositAmountPrompt(chatId, null);
    }

    // 3. Sản phẩm & Mua hàng (hỗ trợ /add, /sanpham, /buy, /mua, /shop, /store)
    if (cmd === '/add' || cmd === '/sanpham' || cmd === '/buy' || cmd === '/mua' || cmd === '/shop' || cmd === '/store') {
        return sendProductList(chatId, null, 'all', 1);
    }

    // 4. Danh sách đơn hàng đã mua (hỗ trợ /list, /donhang, /orders, /myorders, /lichsu)
    if (cmd === '/list' || cmd === '/donhang' || cmd === '/orders' || cmd === '/myorders' || cmd === '/lichsu') {
        return sendMyOrders(chatId, null, 1);
    }

    // 5. Ví & Số dư (hỗ trợ /vi, /wallet, /balance, /sodu)
    if (cmd === '/vi' || cmd === '/wallet' || cmd === '/balance' || cmd === '/sodu') {
        return sendWalletInfo(chatId, null);
    }

    // 6. Chính sách bảo hành
    if (cmd === '/baohanh' || cmd === '/warranty') {
        return sendWarrantyPolicy(chatId, null);
    }

    // 7. Kênh hỗ trợ Admin 24/7
    if (cmd === '/hotro' || cmd === '/support' || cmd === '/contact') {
        return sendSupportInfo(chatId, null);
    }

    // 8. Thông báo từ Ban Quản Trị: /thongbao, /announcement, /broadcast
    if (cmd === '/thongbao' || cmd === '/announcement' || cmd === '/broadcast') {
        const cfg = loadConfig();
        const isAdmin = String(chatId) === String(cfg.adminId);
        const argsText = text.split(' ').slice(1).join(' ').trim();

        // Nếu Admin gõ /thongbao <nội dung> hoặc /broadcast <nội dung> -> Tự động phát tới tất cả khách hàng!
        if (isAdmin && argsText) {
            await sendMessage(chatId, '⏳ <i>Đang tự động phát thông báo từ Admin tới toàn bộ khách hàng...</i>');
            const res = await broadcastAnnouncement({
                title: 'Thông Báo Trực Tiếp Từ Admin',
                type: 'news',
                content: argsText,
                pinToBot: true
            });
            return sendMessage(chatId, `🎉 <b>ĐÃ PHÁT THÔNG BÁO BQT THÀNH CÔNG!</b>\nĐã gửi đến: <b>${res.sentCount}/${res.totalUsers}</b> người dùng!`);
        }

        // Người dùng hoặc Admin xem thông báo mới nhất
        return sendLatestAnnouncement(chatId, null);
    }

    // 8. Admin Panel
    if (cmd === '/admin' || cmd === '/panel') {
        return sendAdminPanel(chatId, null);
    }

    // Lệnh tìm kiếm nhanh: /tim <tên> hoặc /search <tên>
    if (cmd === '/tim' || cmd === '/search') {
        const q = text.split(' ').slice(1).join(' ').trim();
        return sendProductList(chatId, null, 'all', 1, q);
    }

    // Lệnh Admin: /congtien <chatId> <soTien>
    if (cmd === '/congtien') {
        const cfg = loadConfig();
        if (String(chatId) !== String(cfg.adminId)) return;
        const parts = text.split(' ');
        if (parts.length < 3) {
            return sendMessage(chatId, 'Cú pháp: <code>/congtien &lt;chatId&gt; &lt;soTien&gt;</code>');
        }
        const targetId = parts[1];
        const amt = parseInt(parts[2]);
        const res = adjustUserBalance(targetId, amt, 'Admin nạp qua bot');
        if (res.success) {
            sendMessage(chatId, `✅ Đã cộng <b>+${formatMoney(amt)}</b> cho user <code>${targetId}</code>. Số dư mới: <b>${formatMoney(res.newBalance)}</b>`);
            sendMessage(targetId, `🎉 <b>VÍ CỦA BẠN ĐÃ ĐƯỢC CỘNG TIỀN!</b>\nSố tiền: <b>+${formatMoney(amt)}</b>\nSố dư hiện tại: <b>${formatMoney(res.newBalance)}</b>`);
        } else {
            sendMessage(chatId, `❌ Lỗi: ${res.message}`);
        }
        return;
    }

    // Lệnh Admin: /trutien <chatId> <soTien>
    if (cmd === '/trutien') {
        const cfg = loadConfig();
        if (String(chatId) !== String(cfg.adminId)) return;
        const parts = text.split(' ');
        if (parts.length < 3) {
            return sendMessage(chatId, 'Cú pháp: <code>/trutien &lt;chatId&gt; &lt;soTien&gt;</code>');
        }
        const targetId = parts[1];
        const amt = parseInt(parts[2]);
        const res = adjustUserBalance(targetId, -amt, 'Admin trừ qua bot');
        if (res.success) {
            sendMessage(chatId, `✅ Đã trừ <b>-${formatMoney(amt)}</b> của user <code>${targetId}</code>. Số dư mới: <b>${formatMoney(res.newBalance)}</b>`);
            sendMessage(targetId, `⚠️ <b>SỐ DƯ ĐÃ THAY ĐỔI:</b>\nTrừ: <b>-${formatMoney(amt)}</b>\nSố dư hiện tại: <b>${formatMoney(res.newBalance)}</b>`);
        } else {
            sendMessage(chatId, `❌ Lỗi: ${res.message}`);
        }
        return;
    }

    // Lệnh Admin: /broadcast <nội dung>
    if (cmd === '/broadcast') {
        const cfg = loadConfig();
        if (String(chatId) !== String(cfg.adminId)) return;
        const bMsg = text.substring(text.indexOf(' ') + 1).trim();
        if (!bMsg || bMsg === '/broadcast') {
            return sendMessage(chatId, 'Cú pháp: <code>/broadcast &lt;Nội dung thông báo&gt;</code>');
        }
        const d = loadData();
        const userIds = Object.keys(d.users || {});
        let count = 0;
        for (const uid of userIds) {
            try {
                await sendMessage(uid, `📢 <b>THÔNG BÁO TỪ HỆ THỐNG:</b>\n━━━━━━━━━━━━━━━━━━\n${bMsg}`);
                count++;
            } catch (e) {}
        }
        return sendMessage(chatId, `✅ Đã gửi thông báo tới ${count} khách hàng!`);
    }

    // Lệnh Admin: /sync
    if (cmd === '/sync') {
        const cfg = loadConfig();
        if (String(chatId) !== String(cfg.adminId)) return;
        await fetchProducts(true);
        return sendMessage(chatId, `✅ Đã đồng bộ mới nhất ${cachedProducts.length} sản phẩm từ Canboso API!`);
    }

    // Mặc định phản hồi hướng dẫn mở menu
    return sendMainMenu(chatId, null, from);
}

// --- XỬ LÝ CALLBACK QUERY (INLINE BUTTONS) ---
async function handleCallbackQuery(cb) {
    if (!cb || !cb.message) return;

    const chatId = cb.message.chat.id;
    const messageId = cb.message.message_id;
    const data = cb.data || '';

    // Tránh bị loading icon trên Telegram
    await answerCallbackQuery(cb.id);

    if (data === 'noop') return;

    // 1. Menu chính
    if (data === 'menu_main') {
        return sendMainMenu(chatId, messageId);
    }

    // 2. Danh mục & phân trang: cat_<category>_<page>
    if (data.startsWith('cat_')) {
        const parts = data.split('_');
        const cat = parts[1] || 'all';
        const page = parseInt(parts[2] || '1');
        return sendProductList(chatId, messageId, cat, page);
    }

    // 3. Xem sản phẩm: p_view_<productId>_<cat>_<page>
    if (data.startsWith('p_view_')) {
        const parts = data.split('_');
        const pid = parts[2];
        const cat = parts[3] || 'all';
        const page = parseInt(parts[4] || '1');
        return sendProductDetail(chatId, messageId, pid, cat, page);
    }

    // 4. Mua sản phẩm xác nhận: buy_confirm_<productId>
    if (data.startsWith('buy_confirm_')) {
        const pid = data.replace('buy_confirm_', '');
        return handleBuyProduct(chatId, messageId, pid);
    }

    // 5. Nạp tiền - Hỏi số tiền nạp trước khi hiện mã VietQR
    if (data === 'wallet_deposit') {
        return sendDepositAmountPrompt(chatId, messageId);
    }

    if (data.startsWith('dep_amt_')) {
        const amt = parseInt(data.replace('dep_amt_', ''));
        return sendDepositMenu(chatId, messageId, amt);
    }

    if (data.startsWith('deposit_for_')) {
        const total = parseInt(data.replace('deposit_for_', ''));
        const bal = getUserBalance(chatId);
        const need = Math.max(10000, total - bal);
        return sendDepositMenu(chatId, messageId, need);
    }

    if (data === 'dep_custom') {
        userStates[chatId] = { step: 'awaiting_custom_deposit', promptMsgId: messageId };
        return sendMessage(chatId, '✏️ <b>NHẬP SỐ TIỀN BẠN MUỐN NẠP:</b>\n<i>Vui lòng nhập số tiền bạn muốn nạp (ví dụ: 150000 hoặc 150k) rồi gửi tin nhắn vào đây:</i>');
    }

    // Kiểm tra giao dịch & nạp tiền từ menu nạp
    if (data === 'check_balance_now' || data === 'check_transaction_now') {
        // Quét sao kê ngân hàng ngay lập tức
        try {
            await checkSepayPolling();
        } catch (e) {}

        const cfg = loadConfig();
        const d = loadData();
        const bal = getUserBalance(chatId);
        const syntax = `${cfg.bank?.depositSyntax || 'NAP'} ${chatId}`;

        // Kiểm tra xem khách có giao dịch vừa được duyệt gần đây không (trong vòng 10 phút)
        const now = Date.now();
        const recentDep = (d.deposits || []).find(dep => 
            String(dep.chatId) === String(chatId) &&
            dep.status === 'approved' &&
            (now - new Date(dep.approvedAt || dep.createdAt).getTime() < 10 * 60 * 1000)
        );

        if (recentDep) {
            await removeUserQrMessage(chatId);
            return sendMessage(chatId, `🎉 <b>GIAO DỊCH ĐÃ ĐƯỢC XÁC NHẬN THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━\n💰 <b>Số tiền nạp:</b> <code>+${formatMoney(recentDep.amount)}</code>\n💳 <b>Số dư ví hiện tại:</b> <code>${formatMoney(bal)}</code>\n🧾 <b>Mã giao dịch:</b> <code>${recentDep.id}</code>\n━━━━━━━━━━━━━━━━━━\n<i>Hệ thống Auto Bank đã tự động xác nhận và cộng tiền vào ví. Bạn có thể mua tài khoản ngay bây giờ!</i>`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '🛒 Mua Tài Khoản Ngay', callback_data: 'cat_all_1' }],
                        [{ text: '🏠 Về Menu Chính', callback_data: 'menu_main' }]
                    ]
                }
            });
        }

        // Khi chưa có giao dịch ghi nhận
        const soc = cfg.socialSupport || {};
        const tgAdmin = soc.telegramAdmin || cfg.supportContact || '@vntshared';
        const tgClean = tgAdmin.replace('@', '').replace('https://t.me/', '');
        const adminUrl = tgClean ? `https://t.me/${tgClean}` : null;

        const inline_keyboard = [];
        if (adminUrl) {
            inline_keyboard.push([
                { text: '💬 Liên Hệ Admin Hỗ Trợ', url: adminUrl }
            ]);
        } else {
            inline_keyboard.push([
                { text: '💬 Liên Hệ Admin Hỗ Trợ', callback_data: 'support_info' }
            ]);
        }

        inline_keyboard.push([
            { text: '🔄 Thử Kiểm Tra Lại', callback_data: 'check_balance_now' },
            { text: '🏠 Về Menu Chính', callback_data: 'menu_main' }
        ]);

        const notFoundText = `⚡️ <b>Đang kiểm tra giao dịch trong 1 - 5 phút ngay sau khi bạn chuyển khoản đúng cú pháp và số tiền!</b>\n━━━━━━━━━━━━━━━━━━\n💰 <b>Số dư ví hiện tại:</b> <code>${formatMoney(bal)}</code>\n📝 <b>Cú pháp chuyển khoản bắt buộc:</b>\n👉 <code>${syntax}</code>\n\n⏳ <i>Hệ thống Auto Bank đang quét sao kê ngân hàng tự động. Nếu bạn vừa hoàn tất chuyển khoản từ app ngân hàng, vui lòng đợi 1 - 5 phút để hệ thống ghi nhận và tự động cộng tiền.</i>\n\n⚠️ <i>Nếu bạn đã chuyển khoản nhưng sau 5 phút ví vẫn chưa được cộng, vui lòng bấm nút bên dưới để liên hệ Admin hỗ trợ xử lý ngay!</i>`;

        return sendMessage(chatId, notFoundText, {
            reply_markup: { inline_keyboard }
        });
    }

    if (data.startsWith('dep_notify_')) {
        const bal = getUserBalance(chatId);
        return sendMessage(chatId, `⚡️ <b>Đang kiểm tra giao dịch trong 1 - 5 phút ngay sau khi bạn chuyển khoản đúng cú pháp và số tiền!</b>\n━━━━━━━━━━━━━━━━━━\n💰 <b>Số dư hiện tại:</b> <code>${formatMoney(bal)}</code>`, {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '💬 Liên Hệ Admin Hỗ Trợ', callback_data: 'support_info' }],
                    [{ text: '🔄 Kiểm Tra Lại', callback_data: 'check_balance_now' }]
                ]
            }
        });
    }

    // 7. Quản lý Admin duyệt nạp tiền
    if (data.startsWith('admin_dep_approve_')) {
        const depId = data.replace('admin_dep_approve_', '');
        const d = loadData();
        const dep = (d.deposits || []).find(x => x.id === depId);

        if (!dep || dep.status !== 'pending') {
            return answerCallbackQuery(cb.id, 'Yêu cầu nạp này đã được xử lý trước đó!', true);
        }

        dep.status = 'approved';
        dep.approvedAt = new Date().toISOString();
        saveData(d);

        // Cộng tiền cho khách
        const res = adjustUserBalance(dep.chatId, dep.amount, 'Duyệt nạp tiền ngân hàng');

        await answerCallbackQuery(cb.id, `Đã duyệt thành công +${formatMoney(dep.amount)}!`, true);
        await editMessageText(chatId, messageId, `✅ <b>ĐÃ DUYỆT NẠP TIỀN THÀNH CÔNG!</b>\nKhách: <code>${dep.chatId}</code>\nSố tiền: <b>+${formatMoney(dep.amount)}</b>`);

        // Xóa ảnh mã QR nạp tiền của khách nếu có
        await removeUserQrMessage(dep.chatId);

        // Gửi thông báo chúc mừng cho khách
        sendMessage(dep.chatId, `🎉 <b>NẠP TIỀN THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━\nSố tiền cộng ví: <b>+${formatMoney(dep.amount)}</b>\nSố dư hiện tại: <b>${formatMoney(res.newBalance)}</b>\n\nBạn có thể bắt đầu mua sắm tài khoản Premium ngay bây giờ!`, {
            reply_markup: {
                inline_keyboard: [[{ text: '🛒 XEM SẢN PHẨM NGAY', callback_data: 'cat_all_1' }]]
            }
        });
        return;
    }

    if (data.startsWith('admin_dep_reject_')) {
        const depId = data.replace('admin_dep_reject_', '');
        const d = loadData();
        const dep = (d.deposits || []).find(x => x.id === depId);

        if (!dep || dep.status !== 'pending') {
            return answerCallbackQuery(cb.id, 'Yêu cầu này đã được xử lý!', true);
        }

        dep.status = 'rejected';
        saveData(d);

        await answerCallbackQuery(cb.id, 'Đã từ chối yêu cầu nạp tiền!', true);
        await editMessageText(chatId, messageId, `❌ <b>ĐÃ TỪ CHỐI YÊU CẦU NẠP TIỀN</b>\nKhách: <code>${dep.chatId}</code>\nSố tiền: <code>${formatMoney(dep.amount)}</code>`);

        sendMessage(dep.chatId, `❌ <b>YÊU CẦU NẠP TIỀN CHƯA THÀNH CÔNG!</b>\nSố tiền: <code>${formatMoney(dep.amount)}</code>\n\nHệ thống chưa nhận được số tiền chuyển khoản tương ứng. Nếu bạn đã chuyển khoản, vui lòng liên hệ Admin để được hỗ trợ!`);
        return;
    }

    // 8. Đơn hàng của tôi
    if (data.startsWith('my_orders_')) {
        const page = parseInt(data.replace('my_orders_', '') || '1');
        return sendMyOrders(chatId, messageId, page);
    }

    if (data.startsWith('order_view_')) {
        const ordId = data.replace('order_view_', '');
        return sendOrderDetail(chatId, messageId, ordId);
    }

    // 9. Gửi yêu cầu bảo hành
    if (data.startsWith('warr_req_')) {
        const ordId = data.replace('warr_req_', '');
        userStates[chatId] = {
            step: 'awaiting_warranty_reason',
            data: { orderId: ordId }
        };
        return sendMessage(chatId, `🛡️ <b>GỬI YÊU CẦU BẢO HÀNH</b>\n━━━━━━━━━━━━━━━━━━\n👉 <i>Vui lòng mô tả chi tiết lỗi bạn gặp phải (ví dụ: sai mật khẩu, tài khoản bị mất gói, không đăng nhập được...) rồi gửi tin nhắn vào đây:</i>`);
    }

    // 10. Admin xử lý bảo hành
    if (data.startsWith('admin_warr_refund_')) {
        const ticketId = data.replace('admin_warr_refund_', '');
        const d = loadData();
        const ticket = (d.warrantyTickets || []).find(t => t.id === ticketId);
        if (!ticket || ticket.status !== 'pending') {
            return answerCallbackQuery(cb.id, 'Ticket này đã được xử lý!', true);
        }
        const ord = (d.orders || []).find(o => o.id === ticket.orderId);
        const refundAmt = ord ? ord.price : 0;

        ticket.status = 'resolved';
        ticket.responseNote = `Đã hoàn tiền ${formatMoney(refundAmt)} vào ví`;
        saveData(d);

        adjustUserBalance(ticket.chatId, refundAmt, `Hoàn tiền bảo hành đơn #${ticket.orderCode}`);

        await answerCallbackQuery(cb.id, `Đã hoàn tiền ${formatMoney(refundAmt)} cho khách!`, true);
        await editMessageText(chatId, messageId, `✅ <b>ĐÃ HOÀN TIỀN BẢO HÀNH</b>\nĐơn: <code>${ticket.orderCode}</code>\nKhách: <code>${ticket.chatId}</code>\nSố tiền hoàn: <b>${formatMoney(refundAmt)}</b>`);

        sendMessage(ticket.chatId, `🎉 <b>KHIẾU NẠI BẢO HÀNH ĐÃ ĐƯỢC XỬ LÝ!</b>\n━━━━━━━━━━━━━━━━━━\nĐơn hàng: <code>${ticket.orderCode}</code>\nAdmin đã duyệt hoàn <b>${formatMoney(refundAmt)}</b> vào ví tiền bot của bạn. Bạn có thể sử dụng số dư này để mua lại hoặc chọn sản phẩm khác!`);
        return;
    }

    if (data.startsWith('admin_warr_done_')) {
        const ticketId = data.replace('admin_warr_done_', '');
        const d = loadData();
        const ticket = (d.warrantyTickets || []).find(t => t.id === ticketId);
        if (!ticket || ticket.status !== 'pending') {
            return answerCallbackQuery(cb.id, 'Ticket này đã xử lý!', true);
        }
        ticket.status = 'resolved';
        ticket.responseNote = 'Đã giải quyết';
        saveData(d);

        await answerCallbackQuery(cb.id, 'Đã đánh dấu giải quyết!', true);
        await editMessageText(chatId, messageId, `✅ <b>ĐÃ ĐÁNH DẤU GIẢI QUYẾT BẢO HÀNH</b>\nĐơn: <code>${ticket.orderCode}</code>`);
        sendMessage(ticket.chatId, `✅ Yêu cầu bảo hành đơn hàng <code>${ticket.orderCode}</code> của bạn đã được Admin xử lý. Nếu cần thêm hỗ trợ vui lòng nhắn trực tiếp cho Admin!`);
        return;
    }

    // 11. Các mục thông tin phụ
    if (data === 'wallet_info') return sendWalletInfo(chatId, messageId);
    if (data === 'warranty_policy') return sendWarrantyPolicy(chatId, messageId);
    if (data === 'support_info') return sendSupportInfo(chatId, messageId);
    if (data === 'announcements_view') return sendLatestAnnouncement(chatId, messageId);
    if (data === 'admin_panel') return sendAdminPanel(chatId, messageId);

    if (data === 'search_prompt') {
        userStates[chatId] = { step: 'awaiting_search_query' };
        return sendMessage(chatId, '🔍 <i>Vui lòng nhập tên sản phẩm bạn muốn tìm kiếm (ví dụ: Capcut, GPT, Netflix, Canva...) rồi gửi vào đây:</i>');
    }

    if (data === 'admin_sync') {
        await fetchProducts(true);
        await answerCallbackQuery(cb.id, `Đã đồng bộ ${cachedProducts.length} sản phẩm Canboso!`, true);
        return sendAdminPanel(chatId, messageId);
    }

    if (data === 'admin_broadcast_prompt') {
        userStates[chatId] = { step: 'awaiting_broadcast' };
        return sendMessage(chatId, '📢 <i>Vui lòng nhập nội dung thông báo muốn gửi tới toàn bộ khách hàng:</i>');
    }
}

// Đăng ký danh sách menu commands với Telegram API
async function registerBotCommands() {
    try {
        const commands = [
            { command: 'start', description: 'Menu chính & bảng điều khiển' },
            { command: 'sanpham', description: 'Danh sách sản phẩm Premium' },
            { command: 'nap', description: 'Nạp tiền vào ví tự động (VietQR)' },
            { command: 'topup', description: 'Nạp tiền nhanh qua VietQR MBBank' },
            { command: 'add', description: 'Mua tài khoản Premium mới' },
            { command: 'list', description: 'Danh sách đơn hàng đã mua' },
            { command: 'donhang', description: 'Xem chi tiết đơn hàng đã mua' },
            { command: 'vi', description: 'Xem số dư & Lịch sử ví' },
            { command: 'thongbao', description: 'Thông báo mới nhất từ Ban Quản Trị' },
            { command: 'baohanh', description: 'Chính sách & Gửi yêu cầu bảo hành' },
            { command: 'hotro', description: 'Hỗ trợ Admin 24/7' }
        ];
        const res = await callTelegram('setMyCommands', { commands });
        if (res && res.ok) {
            console.log('✅ Đã đồng bộ lệnh menu bot với Telegram (setMyCommands) thành công!');
        }
    } catch (e) {
        console.error('Lỗi setMyCommands:', e.message);
    }
}

// --- POLLING SERVICE LẮNG NGHE TIN NHẮN TỪ TELEGRAM ---
let isPolling = false;
let lastUpdateId = 0;

function startPolling() {
    if (isPolling) return;
    isPolling = true;
    console.log('🤖 Telegram Bot Service bắt đầu Polling...');
    addLog('system', 'Telegram Bot Service đã khởi động Polling 24/7');
    registerBotCommands();
    startAutoBankPolling();
    startProductSyncPolling();
    pollNext();
}

function pollNext() {
    const cfg = loadConfig();
    if (!cfg.token) {
        isPolling = false;
        setTimeout(startPolling, 4000);
        return;
    }

    const pathUrl = `/bot${cfg.token}/getUpdates?offset=${lastUpdateId + 1}&timeout=20`;
    const req = https.get(`https://api.telegram.org${pathUrl}`, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
            try {
                const json = JSON.parse(body);
                if (json.ok && Array.isArray(json.result)) {
                    for (const u of json.result) {
                        lastUpdateId = u.update_id;
                        if (u.message) {
                            handleMessage(u.message);
                        } else if (u.callback_query) {
                            handleCallbackQuery(u.callback_query);
                        }
                    }
                }
            } catch (e) {}
            setTimeout(pollNext, 300);
        });
    });

    req.on('error', (err) => {
        setTimeout(pollNext, 3000);
    });
}

if (require.main === module) {
    startPolling();
}

module.exports = {
    startPolling,
    startProductSyncPolling,
    getLastSyncTime,
    loadConfig,
    saveConfig,
    loadData,
    saveData,
    addLog,
    fetchProducts,
    fetchCanbosoBalance,
    fetchCanbosoOrders,
    purchaseCanbosoProduct,
    adjustUserBalance,
    processAutoBankTransaction,
    checkAutoBankConnection,
    getSellingPrice,
    getMotherBotBalance,
    sendMessage,
    deleteMessage,
    sendDepositAmountPrompt,
    sendDepositMenu,
    removeUserQrMessage,
    formatMoney,
    getBotProfileInfo,
    setBotAvatar,
    removeBotAvatar,
    broadcastAnnouncement,
    sendLatestAnnouncement
};
