const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const botRunner = require('./telegram_bot_server');

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;

// Quản lý phiên đăng nhập Admin (Token -> { username, expiresAt })
const activeSessions = new Map();
// Khởi tạo sẵn một token cố định để dự phòng nếu cần
const DEFAULT_ADMIN_TOKEN = 'agt_admin_master_' + Date.now();
activeSessions.set(DEFAULT_ADMIN_TOKEN, { username: 'vungoctruong', expiresAt: Date.now() + 365 * 24 * 3600 * 1000 });

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
    });
}

const server = http.createServer(async (req, res) => {
    // Xử lý CORS OPTIONS
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, 'http://localhost:' + PORT);
    const pathname = parsedUrl.pathname;

    // --- API XÁC THỰC ĐĂNG NHẬP ADMIN ---
    if (pathname === '/api/auth/login' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { username, password, rememberMe } = body;
            const cfg = botRunner.loadConfig();
            const validUser = (cfg.adminAuth && cfg.adminAuth.username) || 'vungoctruong';
            const validPass = (cfg.adminAuth && cfg.adminAuth.password) || '@Gmail2k9';

            const inputUser = (username || '').trim().toLowerCase();
            const inputPass = (password || '').trim();

            if (inputUser === validUser.toLowerCase() && inputPass === validPass) {
                const token = 'agt_' + crypto.randomBytes(24).toString('hex');
                // Nếu duy trì đăng nhập: 30 ngày (2.592.000s), ngược lại: 24 giờ
                const ttlMs = rememberMe ? (30 * 24 * 3600 * 1000) : (24 * 3600 * 1000);
                const expiresAt = Date.now() + ttlMs;

                activeSessions.set(token, {
                    username: validUser,
                    expiresAt: expiresAt,
                    rememberMe: Boolean(rememberMe)
                });

                res.writeHead(200, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Set-Cookie': `admin_session=${token}; Path=/; HttpOnly; Max-Age=${Math.floor(ttlMs / 1000)}; SameSite=Lax`,
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(JSON.stringify({
                    success: true,
                    token: token,
                    username: validUser,
                    expiresAt: expiresAt,
                    rememberMe: Boolean(rememberMe),
                    message: 'Đăng nhập trang quản trị thành công!'
                }));
            } else {
                sendJson(res, 401, {
                    success: false,
                    message: 'Sai tên đăng nhập hoặc mật khẩu quản trị viên!'
                });
            }
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    if (pathname === '/api/auth/check' && req.method === 'GET') {
        const authHeader = req.headers['authorization'] || '';
        let token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token && req.headers.cookie) {
            const match = req.headers.cookie.match(/admin_session=([^;]+)/);
            if (match) token = match[1];
        }

        if (token && activeSessions.has(token)) {
            const session = activeSessions.get(token);
            if (Date.now() < session.expiresAt) {
                return sendJson(res, 200, {
                    success: true,
                    authenticated: true,
                    username: session.username,
                    expiresAt: session.expiresAt
                });
            } else {
                activeSessions.delete(token);
            }
        }
        sendJson(res, 200, { success: false, authenticated: false });
        return;
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
        const authHeader = req.headers['authorization'] || '';
        let token = authHeader.replace(/^Bearer\s+/i, '').trim();
        if (!token && req.headers.cookie) {
            const match = req.headers.cookie.match(/admin_session=([^;]+)/);
            if (match) token = match[1];
        }
        if (token) activeSessions.delete(token);

        res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Set-Cookie': 'admin_session=; Path=/; Max-Age=0; HttpOnly',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ success: true, message: 'Đã đăng xuất khỏi hệ thống!' }));
        return;
    }

    // --- API THỐNG KÊ TỔNG QUAN (DASHBOARD STATS) ---
    if (pathname === '/api/stats' && req.method === 'GET') {
        try {
            const cfg = botRunner.loadConfig();
            const d = botRunner.loadData();
            const canbosoBal = await botRunner.fetchCanbosoBalance();

            const userKeys = Object.keys(d.users || {});
            let totalDepositSuccess = 0;
            let totalRevenue = 0;

            (d.orders || []).forEach(o => {
                totalRevenue += (o.price || 0);
            });

            (d.deposits || []).forEach(dep => {
                if (dep.status === 'approved') totalDepositSuccess += (dep.amount || 0);
            });

            const pendingDeposits = (d.deposits || []).filter(dep => dep.status === 'pending');
            const pendingWarranties = (d.warrantyTickets || []).filter(w => w.status === 'pending');

            const stats = {
                botStatus: 'online',
                botAdmin: cfg.adminName,
                adminId: cfg.adminId,
                canbosoBalance: canbosoBal ? (canbosoBal.balanceText || botRunner.formatMoney(canbosoBal.balance)) : '0 ₫',
                canbosoBalanceRaw: canbosoBal ? canbosoBal.balance : 0,
                totalUsers: userKeys.length,
                totalOrders: (d.orders || []).length,
                totalRevenue: totalRevenue,
                totalDeposited: totalDepositSuccess,
                pendingDepositsCount: pendingDeposits.length,
                pendingWarrantiesCount: pendingWarranties.length,
                bankInfo: cfg.bank || {},
                markupPercent: cfg.markupPercent || 0
            };

            sendJson(res, 200, { success: true, stats });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // --- API SẢN PHẨM CANBOSO ---
    if (pathname === '/api/products' && req.method === 'GET') {
        try {
            const force = parsedUrl.searchParams.get('force') === 'true';
            const rawProducts = await botRunner.fetchProducts(force);
            const d = botRunner.loadData();
            const cfg = botRunner.loadConfig();
            const motherBal = await botRunner.getMotherBotBalance(force);
            const autoFilter = cfg.autoBalanceFilter !== false;

            const products = rawProducts.map(p => {
                const override = (d.productOverrides && d.productOverrides[p.productId]) || {};
                const sellingPrice = botRunner.getSellingPrice(p);
                const orig = p.price ? p.price.amount : 0;
                const isAffordable = motherBal >= orig;
                const isAutoHidden = autoFilter && !isAffordable;

                return {
                    ...p,
                    sellingPrice: sellingPrice,
                    sellingPriceText: botRunner.formatMoney(sellingPrice),
                    originalPrice: orig,
                    motherBalance: motherBal,
                    isAffordable: isAffordable,
                    isAutoHidden: isAutoHidden,
                    // Nếu admin tắt thủ công HOẶC tự động ẩn do thiếu vốn ví mẹ thì isEnabled = false
                    isEnabled: override.enabled !== false && !isAutoHidden,
                    manualEnabled: override.enabled !== false,
                    customPrice: override.customPrice || null
                };
            });

            const lastSync = botRunner.getLastSyncTime ? botRunner.getLastSyncTime() : Date.now();
            sendJson(res, 200, {
                success: true,
                count: products.length,
                motherBalance: motherBal,
                motherBalanceText: botRunner.formatMoney(motherBal),
                autoBalanceFilter: autoFilter,
                motherBalanceOverride: cfg.motherBalanceOverride ?? null,
                affordableCount: products.filter(x => x.isAffordable).length,
                hiddenCount: products.filter(x => x.isAutoHidden).length,
                lastSyncTime: lastSync,
                autoSyncInterval: 60,
                products
            });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // Cập nhật giá / trạng thái sản phẩm (Hỗ trợ chỉnh giá riêng & AI Smart Pricing)
    if (pathname === '/api/products/settings' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const d = botRunner.loadData();
            d.productOverrides = d.productOverrides || {};

            const rawProducts = await botRunner.fetchProducts(false);
            const getOrigPrice = (pid) => {
                const prod = rawProducts.find(p => p.productId === pid);
                return prod && prod.price ? prod.price.amount : 0;
            };

            // 1. Chỉnh giá hoặc bật/tắt cho từng sản phẩm đơn lẻ
            if (body.productId) {
                const orig = getOrigPrice(body.productId);
                let custom = null;
                if (body.customPrice !== undefined && body.customPrice !== null && body.customPrice !== '') {
                    const parsedNum = Number(body.customPrice);
                    if (!isNaN(parsedNum) && parsedNum > 0) {
                        // RÀNG BUỘC: Không được thấp hơn giá gốc API
                        if (parsedNum < orig) {
                            return sendJson(res, 400, {
                                success: false,
                                message: `Giá bán (${botRunner.formatMoney(parsedNum)}) không được thấp hơn giá gốc từ API (${botRunner.formatMoney(orig)})!`
                            });
                        }
                        custom = parsedNum;
                    }
                }

                d.productOverrides[body.productId] = {
                    ...d.productOverrides[body.productId],
                    enabled: body.enabled !== undefined ? body.enabled : true,
                    customPrice: custom
                };
            }

            // 2. Chỉnh giá hàng loạt bằng AI (Batch Smart Pricing)
            if (body.batchPrices && Array.isArray(body.batchPrices)) {
                for (const item of body.batchPrices) {
                    if (item.productId && item.customPrice) {
                        const orig = getOrigPrice(item.productId);
                        // Đảm bảo không thấp hơn giá gốc
                        const safePrice = Math.max(orig, Number(item.customPrice));
                        d.productOverrides[item.productId] = {
                            ...d.productOverrides[item.productId],
                            customPrice: safePrice
                        };
                    }
                }
            }

            // 3. Khôi phục tất cả giá về mặc định (xóa custom price)
            if (body.resetAllCustomPrices === true) {
                for (const pid of Object.keys(d.productOverrides)) {
                    d.productOverrides[pid].customPrice = null;
                }
            }

            // 4. Cài đặt markup chung
            if (body.markupPercent !== undefined) {
                const cfg = botRunner.loadConfig();
                cfg.markupPercent = Number(body.markupPercent);
                botRunner.saveConfig(cfg);
            }

            botRunner.saveData(d);
            sendJson(res, 200, { success: true, message: 'Đã cập nhật giá bán thành công!' });
        } catch (err) {
            sendJson(res, 400, { success: false, message: err.message });
        }
        return;
    }

    // --- API QUẢN LÝ VÍ BOT MẸ & BỘ LỌC TỰ ĐỘNG THEO VỐN ---
    if (pathname === '/api/mother-wallet' && req.method === 'GET') {
        try {
            const cfg = botRunner.loadConfig();
            const motherBal = await botRunner.getMotherBotBalance(false);
            sendJson(res, 200, {
                success: true,
                motherBalance: motherBal,
                motherBalanceText: botRunner.formatMoney(motherBal),
                autoBalanceFilter: cfg.autoBalanceFilter !== false,
                motherBalanceOverride: cfg.motherBalanceOverride ?? null
            });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    if (pathname === '/api/mother-wallet/config' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const cfg = botRunner.loadConfig();

            if (body.autoBalanceFilter !== undefined) {
                cfg.autoBalanceFilter = Boolean(body.autoBalanceFilter);
            }
            if (body.motherBalanceOverride !== undefined) {
                if (body.motherBalanceOverride === null || body.motherBalanceOverride === '' || body.motherBalanceOverride === 'api') {
                    cfg.motherBalanceOverride = null; // Trả về dùng API thật
                } else {
                    const parsed = Number(body.motherBalanceOverride);
                    cfg.motherBalanceOverride = isNaN(parsed) ? null : parsed;
                }
            }

            botRunner.saveConfig(cfg);
            const updatedBal = await botRunner.getMotherBotBalance(true);
            botRunner.addLog('canboso', `Cập nhật cấu hình Ví Mẹ: AutoFilter=${cfg.autoBalanceFilter}, Override=${cfg.motherBalanceOverride} (Số dư hiệu lực: ${botRunner.formatMoney(updatedBal)})`);

            sendJson(res, 200, {
                success: true,
                message: 'Đã lưu cấu hình bộ lọc theo ví mẹ thành công!',
                motherBalance: updatedBal,
                motherBalanceText: botRunner.formatMoney(updatedBal),
                autoBalanceFilter: cfg.autoBalanceFilter !== false,
                motherBalanceOverride: cfg.motherBalanceOverride
            });
        } catch (err) {
            sendJson(res, 400, { success: false, message: err.message });
        }
        return;
    }

    if (pathname === '/api/mother-wallet/refresh' && req.method === 'POST') {
        try {
            const motherBal = await botRunner.getMotherBotBalance(true);
            const cfg = botRunner.loadConfig();
            sendJson(res, 200, {
                success: true,
                message: 'Đã làm mới số dư ví mẹ từ Canboso API thành công!',
                motherBalance: motherBal,
                motherBalanceText: botRunner.formatMoney(motherBal),
                autoBalanceFilter: cfg.autoBalanceFilter !== false,
                motherBalanceOverride: cfg.motherBalanceOverride
            });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // --- API WEBHOOK AUTO BANK (SEPAY / CASSO / CUSTOM WEBHOOK) ---
    if ((pathname === '/api/webhook/bank' || pathname === '/api/autobank/webhook') && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            console.log('⚡ Webhook Auto Bank nhận payload:', JSON.stringify(body));

            // Hỗ trợ cả SePAY format ({ transferAmount, content, referenceCode })
            // và Casso format ({ data: [{ amount, description, tid }] })
            if (Array.isArray(body.data)) {
                let results = [];
                for (const tx of body.data) {
                    const r = await botRunner.processAutoBankTransaction({
                        amount: tx.amount,
                        content: tx.description,
                        refId: tx.tid || tx.id,
                        gateway: 'Casso'
                    });
                    results.push(r);
                }
                return sendJson(res, 200, { success: true, results });
            }

            const transData = {
                amount: body.transferAmount || body.amount || body.amount_in || 0,
                content: body.content || body.description || body.transaction_content || '',
                refId: body.referenceCode || body.reference_number || body.id || body.code,
                gateway: body.gateway || 'SePAY'
            };

            const r = await botRunner.processAutoBankTransaction(transData);
            sendJson(res, 200, r);
        } catch (err) {
            console.error('Lỗi Webhook Auto Bank:', err);
            sendJson(res, 400, { success: false, message: err.message });
        }
        return;
    }

    // API Giả lập test Auto Bank (Dành cho Admin test thử nghiệm)
    if (pathname === '/api/autobank/test' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { chatId, amount } = body;
            const r = await botRunner.processAutoBankTransaction({
                amount: Number(amount) || 10000,
                content: `NAP ${chatId || '1170317703'}`,
                refId: 'TEST-' + Date.now(),
                gateway: 'Test Giả Lập'
            });
            sendJson(res, 200, r);
        } catch (err) {
            sendJson(res, 400, { success: false, message: err.message });
        }
        return;
    }

    // API Kiểm tra kết nối API MB Bank thực tế (Sieuthicode)
    if (pathname === '/api/autobank/check-connection' && req.method === 'POST') {
        try {
            const result = await botRunner.checkAutoBankConnection();
            sendJson(res, 200, result);
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // API Cấu hình Auto Bank
    if (pathname === '/api/autobank/config' && req.method === 'GET') {
        const cfg = botRunner.loadConfig();
        sendJson(res, 200, { success: true, autobank: cfg.autobank || {} });
        return;
    }

    if (pathname === '/api/autobank/config' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const cfg = botRunner.loadConfig();
            cfg.autobank = { ...(cfg.autobank || {}), ...body };
            botRunner.saveConfig(cfg);
            botRunner.addLog('autobank', `Cập nhật cấu hình Auto Bank: Provider=${cfg.autobank.provider}, Enabled=${cfg.autobank.enabled}`);
            sendJson(res, 200, { success: true, message: 'Đã lưu cấu hình Auto Bank!', autobank: cfg.autobank });
        } catch (err) {
            sendJson(res, 400, { success: false, message: err.message });
        }
        return;
    }

    // API Lịch sử giao dịch Auto Bank
    if (pathname === '/api/autobank/transactions' && req.method === 'GET') {
        const d = botRunner.loadData();
        const txs = Object.values(d.processedTransactions || {});
        txs.sort((a, b) => new Date(b.processedAt || 0) - new Date(a.processedAt || 0));
        sendJson(res, 200, { success: true, transactions: txs });
        return;
    }

    // --- API QUẢN LÝ NGÂN HÀNG & NẠP TIỀN (BANK MANAGEMENT) ---
    if (pathname === '/api/bank' && req.method === 'GET') {
        const cfg = botRunner.loadConfig();
        sendJson(res, 200, { success: true, bank: cfg.bank });
        return;
    }

    if (pathname === '/api/bank' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const cfg = botRunner.loadConfig();
            cfg.bank = { ...cfg.bank, ...body };
            botRunner.saveConfig(cfg);
            botRunner.addLog('bank', `Cập nhật cấu hình Bank: ${cfg.bank.bankCode} - ${cfg.bank.accountNumber} - ${cfg.bank.accountHolder}`);
            sendJson(res, 200, { success: true, message: 'Đã lưu thông tin tài khoản ngân hàng!', bank: cfg.bank });
        } catch (err) {
            sendJson(res, 400, { success: false, message: err.message });
        }
        return;
    }

    // Danh sách nạp tiền
    if (pathname === '/api/deposits' && req.method === 'GET') {
        const d = botRunner.loadData();
        sendJson(res, 200, { success: true, deposits: d.deposits || [] });
        return;
    }

    // Duyệt / Từ chối nạp tiền
    if (pathname === '/api/deposits/action' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { depositId, action, note } = body;
            const d = botRunner.loadData();
            const dep = (d.deposits || []).find(x => x.id === depositId);

            if (!dep) {
                return sendJson(res, 404, { success: false, message: 'Không tìm thấy yêu cầu nạp tiền' });
            }

            if (action === 'approve') {
                dep.status = 'approved';
                dep.approvedAt = new Date().toISOString();
                dep.note = note || 'Duyệt qua Web Manager';
                botRunner.saveData(d);

                const adj = botRunner.adjustUserBalance(dep.chatId, dep.amount, 'Duyệt nạp tiền qua Web', note);

                // Xóa ảnh mã QR nạp tiền của khách nếu có
                if (botRunner.removeUserQrMessage) {
                    await botRunner.removeUserQrMessage(dep.chatId);
                }

                // Gửi thông báo cho khách qua Telegram
                botRunner.sendMessage(dep.chatId, `🎉 <b>NẠP TIỀN THÀNH CÔNG!</b>\n━━━━━━━━━━━━━━━━━━\nSố tiền cộng ví: <b>+${botRunner.formatMoney(dep.amount)}</b>\nSố dư hiện tại: <b>${botRunner.formatMoney(adj.newBalance)}</b>\n\nBạn có thể bắt đầu mua sắm tài khoản Premium ngay!`);

                sendJson(res, 200, { success: true, message: `Đã duyệt nạp thành công +${botRunner.formatMoney(dep.amount)}!` });
            } else if (action === 'reject') {
                dep.status = 'rejected';
                dep.note = note || 'Từ chối bởi Admin';
                botRunner.saveData(d);

                botRunner.sendMessage(dep.chatId, `❌ <b>YÊU CẦU NẠP TIỀN BỊ TỪ CHỐI</b>\nSố tiền: <code>${botRunner.formatMoney(dep.amount)}</code>\nLý do: <i>${dep.note}</i>`);

                sendJson(res, 200, { success: true, message: 'Đã từ chối yêu cầu nạp tiền' });
            } else {
                sendJson(res, 400, { success: false, message: 'Hành động không hợp lệ' });
            }
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // Tạo lệnh nạp tiền thủ công từ Web
    if (pathname === '/api/deposits/manual' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { chatId, amount, note } = body;
            if (!chatId || !amount) {
                return sendJson(res, 400, { success: false, message: 'Thiếu chatId hoặc số tiền' });
            }

            const amt = Number(amount);
            const adj = botRunner.adjustUserBalance(chatId, amt, 'Nạp tiền thủ công từ Web', note);

            if (!adj.success) {
                return sendJson(res, 400, { success: false, message: adj.message });
            }

            const d = botRunner.loadData();
            d.deposits = d.deposits || [];
            d.deposits.unshift({
                id: 'DEP-' + Date.now(),
                chatId: chatId,
                username: (d.users[String(chatId)] && d.users[String(chatId)].username) || '',
                amount: amt,
                status: 'approved',
                createdAt: new Date().toISOString(),
                approvedAt: new Date().toISOString(),
                note: note || 'Nạp trực tiếp từ Web Admin'
            });
            botRunner.saveData(d);

            botRunner.sendMessage(chatId, `🎉 <b>BẠN VỪA ĐƯỢC CỘNG TIỀN VÀO VÍ!</b>\n━━━━━━━━━━━━━━━━━━\nSố tiền: <b>+${botRunner.formatMoney(amt)}</b>\nSố dư hiện tại: <b>${botRunner.formatMoney(adj.newBalance)}</b>\nGhi chú: <i>${note || 'Nạp bởi Admin'}</i>`);

            sendJson(res, 200, { success: true, message: `Đã cộng +${botRunner.formatMoney(amt)} thành công! Số dư mới: ${botRunner.formatMoney(adj.newBalance)}` });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // --- API QUẢN LÝ KHÁCH HÀNG (USERS & WALLETS) ---
    if (pathname === '/api/users' && req.method === 'GET') {
        const d = botRunner.loadData();
        const users = Object.values(d.users || {});
        users.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
        sendJson(res, 200, { success: true, users });
        return;
    }

    // Điều chỉnh số dư user (+ hoặc -)
    if (pathname === '/api/users/adjust-balance' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { chatId, amount, reason } = body;
            const amt = Number(amount);

            const resAdj = botRunner.adjustUserBalance(chatId, amt, reason || 'Web Admin');
            if (resAdj.success) {
                botRunner.sendMessage(chatId, `🔔 <b>BIẾN ĐỘNG SỐ DƯ VÍ:</b>\n${amt > 0 ? '+' : ''}${botRunner.formatMoney(amt)}\nSố dư hiện tại: <b>${botRunner.formatMoney(resAdj.newBalance)}</b>\nLý do: <i>${reason || 'Admin điều chỉnh'}</i>`);
                sendJson(res, 200, { success: true, newBalance: resAdj.newBalance });
            } else {
                sendJson(res, 400, { success: false, message: resAdj.message });
            }
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // --- API ĐƠN HÀNG & BẢO HÀNH (ORDERS & WARRANTIES) ---
    if (pathname === '/api/orders' && req.method === 'GET') {
        const d = botRunner.loadData();
        sendJson(res, 200, { success: true, orders: d.orders || [] });
        return;
    }

    if (pathname === '/api/warranties' && req.method === 'GET') {
        const d = botRunner.loadData();
        sendJson(res, 200, { success: true, warranties: d.warrantyTickets || [] });
        return;
    }

    if (pathname === '/api/warranties/action' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { ticketId, action, responseText, refundAmount } = body;
            const d = botRunner.loadData();
            const ticket = (d.warrantyTickets || []).find(t => t.id === ticketId);

            if (!ticket) {
                return sendJson(res, 404, { success: false, message: 'Ticket không tồn tại' });
            }

            ticket.status = (action === 'reject') ? 'rejected' : 'resolved';
            ticket.responseNote = responseText || (action === 'refund' ? `Đã hoàn tiền ${botRunner.formatMoney(refundAmount)}` : 'Đã xử lý');
            ticket.resolvedAt = new Date().toISOString();

            if (action === 'refund' && refundAmount > 0) {
                botRunner.adjustUserBalance(ticket.chatId, Number(refundAmount), `Hoàn tiền bảo hành đơn #${ticket.orderCode}`);
                botRunner.sendMessage(ticket.chatId, `🎉 <b>BẢO HÀNH ĐƠN HÀNG #${ticket.orderCode}:</b>\nAdmin đã duyệt hoàn <b>${botRunner.formatMoney(refundAmount)}</b> vào ví tiền của bạn!\nPhản hồi: <i>${responseText || 'Đã hoàn tiền'}</i>`);
            } else if (action === 'resolve') {
                botRunner.sendMessage(ticket.chatId, `✅ <b>KẾT QUẢ XỬ LÝ BẢO HÀNH #${ticket.orderCode}:</b>\nAdmin phản hồi: <i>${responseText || 'Đã đổi mới/khắc phục tài khoản thành công.'}</i>`);
            } else {
                botRunner.sendMessage(ticket.chatId, `⚠️ <b>KẾT QUẢ BẢO HÀNH #${ticket.orderCode}:</b>\nAdmin phản hồi: <i>${responseText || 'Yêu cầu không thuộc diện bảo hành quy định.'}</i>`);
            }

            botRunner.saveData(d);
            sendJson(res, 200, { success: true, message: 'Đã cập nhật trạng thái bảo hành thành công!' });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // --- API QUẢN LÝ AVATAR & THÔNG TIN TELEGRAM BOT ---
    if (pathname === '/api/bot/profile' && req.method === 'GET') {
        try {
            const profile = await botRunner.getBotProfileInfo();
            sendJson(res, 200, profile);
        } catch (err) {
            sendJson(res, 500, { ok: false, description: err.message });
        }
        return;
    }

    if (pathname === '/api/bot/avatar/image' && req.method === 'GET') {
        try {
            const profile = await botRunner.getBotProfileInfo();
            if (profile.ok && profile.avatarUrl) {
                https.get(profile.avatarUrl, (pRes) => {
                    let cType = pRes.headers['content-type'];
                    if (!cType || cType === 'application/octet-stream') cType = 'image/jpeg';
                    res.writeHead(pRes.statusCode, {
                        'Content-Type': cType,
                        'Cache-Control': 'no-cache',
                        'Access-Control-Allow-Origin': '*'
                    });
                    pRes.pipe(res);
                }).on('error', () => {
                    res.writeHead(404);
                    res.end('Not found');
                });
                return;
            }
            res.writeHead(404);
            res.end('No avatar');
        } catch (e) {
            res.writeHead(500);
            res.end(e.message);
        }
        return;
    }

    if (pathname === '/api/bot/avatar' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            if (!body.imageBase64) {
                return sendJson(res, 400, { success: false, message: 'Thiếu dữ liệu ảnh (imageBase64)' });
            }

            let data = body.imageBase64;
            let mimeType = 'image/jpeg';
            const matches = data.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
            let rawBase64 = data;
            if (matches) {
                mimeType = matches[1];
                rawBase64 = matches[2];
            }

            const buffer = Buffer.from(rawBase64, 'base64');
            if (buffer.length < 500) {
                return sendJson(res, 400, { success: false, message: 'Dữ liệu ảnh không hợp lệ hoặc quá nhỏ' });
            }

            const result = await botRunner.setBotAvatar(buffer, mimeType);
            if (result.ok) {
                const updatedProfile = await botRunner.getBotProfileInfo();
                sendJson(res, 200, {
                    success: true,
                    message: 'Đã đổi ảnh đại diện (avatar) Telegram Bot thành công!',
                    profile: updatedProfile
                });
            } else {
                sendJson(res, 400, {
                    success: false,
                    message: result.description || 'Không thể đổi avatar bot',
                    error: result
                });
            }
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    if (pathname === '/api/bot/avatar/remove' && req.method === 'POST') {
        try {
            const result = await botRunner.removeBotAvatar();
            if (result.ok) {
                const updatedProfile = await botRunner.getBotProfileInfo();
                sendJson(res, 200, {
                    success: true,
                    message: 'Đã gỡ bỏ ảnh đại diện của Bot!',
                    profile: updatedProfile
                });
            } else {
                sendJson(res, 400, { success: false, message: result.description || 'Không thể gỡ avatar bot' });
            }
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // --- API CẤU HÌNH BOT (BOT CONFIG) ---
    if (pathname === '/api/bot-config' && req.method === 'GET') {
        const cfg = botRunner.loadConfig();
        sendJson(res, 200, cfg);
        return;
    }

    if (pathname === '/api/bot-config' && req.method === 'POST') {
        try {
            const data = await parseJsonBody(req);
            const current = botRunner.loadConfig();
            const updated = { ...current, ...data };
            botRunner.saveConfig(updated);
            botRunner.startPolling();
            sendJson(res, 200, { status: 'ok', config: updated, message: 'Đã lưu cấu hình và khởi động lại bot!' });
        } catch (err) {
            sendJson(res, 400, { status: 'error', message: err.message });
        }
        return;
    }

    // --- API QUẢN LÝ THÔNG BÁO TỪ BAN QUẢN TRỊ (ADMIN ANNOUNCEMENTS) ---
    if (pathname === '/api/announcements' && req.method === 'GET') {
        const d = botRunner.loadData();
        const uids = Object.keys(d.users || {});
        sendJson(res, 200, {
            success: true,
            announcements: d.announcements || [],
            totalUsers: uids.length
        });
        return;
    }

    if (pathname === '/api/announcements/send' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { title, type, content, buttonText, buttonUrl, pinToBot } = body;
            if (!content || !content.trim()) {
                return sendJson(res, 400, { success: false, message: 'Nội dung thông báo không được để trống' });
            }

            const result = await botRunner.broadcastAnnouncement({
                title: (title || '').trim(),
                type: type || 'news',
                content: content.trim(),
                buttonText: (buttonText || '').trim(),
                buttonUrl: (buttonUrl || '').trim(),
                pinToBot: Boolean(pinToBot)
            });

            sendJson(res, 200, result);
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    if (pathname === '/api/announcements/test' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const cfg = botRunner.loadConfig();
            const { title, type, content, buttonText, buttonUrl } = body;

            if (!cfg.adminId) {
                return sendJson(res, 400, { success: false, message: 'Chưa cấu hình Telegram Admin ID trong cài đặt' });
            }

            const result = await botRunner.broadcastAnnouncement({
                title: (title || '').trim(),
                type: type || 'news',
                content: (content || 'Nội dung thông báo thử nghiệm từ Ban Quản Trị').trim(),
                buttonText: (buttonText || '').trim(),
                buttonUrl: (buttonUrl || '').trim(),
                testOnlyChatId: cfg.adminId
            });

            sendJson(res, 200, result);
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    if (pathname === '/api/announcements/delete' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { id } = body;
            const d = botRunner.loadData();
            d.announcements = (d.announcements || []).filter(a => a.id !== id);
            botRunner.saveData(d);
            sendJson(res, 200, { success: true, message: 'Đã xóa thông báo khỏi lịch sử!' });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // Gửi broadcast từ Web (Hỗ trợ tương thích ngược)
    if (pathname === '/api/bot/broadcast' && req.method === 'POST') {
        try {
            const body = await parseJsonBody(req);
            const { message, title, type } = body;
            if (!message) return sendJson(res, 400, { success: false, message: 'Tin nhắn không được để trống' });

            const result = await botRunner.broadcastAnnouncement({
                title: title || 'Thông Báo Từ Ban Quản Trị',
                type: type || 'news',
                content: message,
                pinToBot: true
            });

            sendJson(res, 200, { success: true, message: `Đã gửi thông báo đến ${result.sentCount}/${result.totalUsers} khách hàng!` });
        } catch (err) {
            sendJson(res, 500, { success: false, message: err.message });
        }
        return;
    }

    // Lấy Logs hoạt động
    if (pathname === '/api/logs' && req.method === 'GET') {
        const d = botRunner.loadData();
        sendJson(res, 200, { success: true, logs: d.activityLogs || [] });
        return;
    }

    // --- PHỤC VỤ FILE TĨNH (STATIC FILE SERVING) ---
    let reqPath = decodeURI(pathname);
    if (reqPath === '/' || reqPath === '') {
        reqPath = '/telegram-bot-manager.html';
    }

    const filePath = path.join(ROOT, reqPath);

    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        res.writeHead(200, {
            'Content-Type': contentType,
            'Access-Control-Allow-Origin': '*'
        });

        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(`🌐 Web Manager: http://localhost:${PORT}/telegram-bot-manager.html`);
    console.log(`🤖 Khởi động Telegram Bot service kết nối Canboso...`);
    console.log(`====================================================`);
    botRunner.startPolling();
});
