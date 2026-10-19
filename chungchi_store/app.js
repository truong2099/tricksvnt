/**
 * Cert New - Official Web Application
 * Fully functional child store matching https://certnew.com & https://certnew.com/dashboard
 * Connected to live API: https://chungchi.store/api/v1
 */

const CONFIG = {
  apiBase: "/api/proxy",
  bankInfo: {
    bankName: "MB Bank (Ngân Hàng Quân Đội)",
    accountNumber: "0968389378",
    accountHolder: "CHUNG CHI STORE",
    bin: "970422"
  }
};

const DEFAULT_PLANS = [
  {
    id: 1,
    title: "Gói Sale",
    amount: 30000,
    warranty_days: 0,
    duration_days: 365,
    description: "Chứng Chỉ iPhone / iPad Cá Nhân.",
    features: [
      "Sử dụng 01 thiết bị duy nhất.",
      "Hỗ trợ Unban xóa bỏ blacklist.",
      "Hỗ trợ thiết bị Bypass ẩn iCloud.",
      "Chứng chỉ P12 và tệp MobileProvision.",
      "Nhận hàng ngay sau khi thanh toán."
    ]
  },
  {
    id: 2,
    title: "Gói Basic",
    amount: 50000,
    warranty_days: 30,
    duration_days: 365,
    is_featured: true,
    description: "Chứng Chỉ iPhone / iPad Cá Nhân.",
    features: [
      "Sử dụng 01 thiết bị duy nhất.",
      "Hỗ trợ Unban xóa bỏ blacklist.",
      "Hỗ trợ thiết bị Bypass ẩn iCloud.",
      "Chứng chỉ P12 và tệp MobileProvision.",
      "Nhận hàng ngay sau khi thanh toán."
    ]
  },
  {
    id: 3,
    title: "Gói Plus",
    amount: 100000,
    warranty_days: 180,
    duration_days: 365,
    description: "Chứng Chỉ iPhone / iPad Cá Nhân.",
    features: [
      "Sử dụng 01 thiết bị duy nhất.",
      "Hỗ trợ Unban xóa bỏ blacklist.",
      "Hỗ trợ thiết bị Bypass ẩn iCloud.",
      "Chứng chỉ P12 và tệp MobileProvision.",
      "Nhận hàng ngay sau khi thanh toán."
    ]
  },
  {
    id: 4,
    title: "Gói Premium",
    amount: 150000,
    warranty_days: 300,
    duration_days: 365,
    description: "Chứng Chỉ iPhone / iPad Cá Nhân.",
    features: [
      "Sử dụng 01 thiết bị duy nhất.",
      "Hỗ trợ Unban xóa bỏ blacklist.",
      "Hỗ trợ thiết bị Bypass ẩn iCloud.",
      "Chứng chỉ P12 và tệp MobileProvision.",
      "Nhận hàng ngay sau khi thanh toán."
    ]
  },
  {
    id: 5,
    title: "Gói Free",
    amount: 0,
    warranty_days: 0,
    duration_days: 7,
    description: "Chứng Chỉ Dùng Thử Miễn Phí.",
    features: [
      "Sử dụng không giới hạn thiết bị.",
      "Hạn sử dụng thường dưới 7 ngày.",
      "Chứng chỉ có thể không hoạt động.",
      "Hỗ trợ cài đặt ESign, GBox, Scarlet.",
      "Không hỗ trợ nếu không cài được."
    ]
  },
  {
    id: 6,
    title: "Gói Doanh Nghiệp",
    amount: 3000000,
    warranty_days: 30,
    duration_days: 30,
    description: "Ký Và Phân Phối Ứng Dụng.",
    features: [
      "Giới hạn 50.000 lượt cài / Tháng.",
      "Tùy chỉnh tên và bundle ứng dụng.",
      "Chỉ hỗ trợ ký ứng dụng dưới 1 GB.",
      "Không giới hạn update 1 lần / Ngày.",
      "Gia hạn linh hoạt theo tháng."
    ]
  }
];

const PRESET_APPS = [
  { id: 13, name: "ESign", version: "5.0.2", icon: "images/esign.png" },
  { id: 12, name: "GBox", version: "6.1.3", icon: "images/gbox.png" },
  { id: 10, name: "Feather", version: "2.9.0", icon: "images/feather.png" },
  { id: 14, name: "LCSign", version: "1.3", icon: "images/lcsign.png" }
];

const state = {
  currentUser: null,
  sessionToken: localStorage.getItem("ccs_session_token") || null,
  currentNav: "home",
  activeDashTab: "overview",
  plans: DEFAULT_PLANS,
  selectedPlan: null,
  activeOrder: null,
  activeDeposit: null,
  stats: null,
  orderCheckInterval: null
};

// ===== Utility Helpers =====
function formatCurrency(amount) {
  if (amount === 0) return "0 đ";
  if (!amount) return "0 đ";
  return new Intl.NumberFormat("vi-VN").format(amount) + " đ";
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toastNotice");
  const msgEl = document.getElementById("toastMessage");
  const iconEl = document.getElementById("toastIcon");
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  toast.className = `toast-notice show ${type === "error" ? "error" : type === "success" ? "success" : ""}`;
  if (iconEl) {
    iconEl.className = type === "error" ? "fas fa-exclamation-circle" : type === "success" ? "fas fa-check-circle" : "fas fa-info-circle";
  }

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function copyText(text, successMsg = "Đã sao chép vào bộ nhớ tạm!") {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => showToast(successMsg, "success")).catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    showToast(successMsg, "success");
  } catch (err) {
    showToast("Không thể sao chép!", "error");
  }
  document.body.removeChild(textarea);
}

// ===== API Requester =====
async function apiRequest(endpoint, method = "GET", body = null) {
  const headers = {
    "Accept": "application/json"
  };
  if (state.sessionToken) {
    headers["X-Session-Token"] = state.sessionToken;
  }
  if (body) {
    headers["Content-Type"] = "application/json";
  }

  try {
    const res = await fetch(endpoint, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null
    });
    const data = await res.json().catch(() => null);
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    console.warn("API Error:", err);
    return { ok: false, status: 0, error: err.message };
  }
}

// ===== Navigation Controller =====
function navigateTo(navId) {
  if (navId === "bang-gia") navId = "home";
  state.currentNav = navId;
  window.location.hash = navId;

  // Update nav links
  document.querySelectorAll(".nav-item").forEach(link => {
    link.classList.toggle("active", link.dataset.nav === navId);
  });

  // Switch view panels
  document.querySelectorAll(".view-panel").forEach(panel => {
    panel.classList.toggle("active", panel.id === `view-${navId}`);
  });

  // If dashboard, refresh dashboard content
  if (navId === "dashboard") {
    renderDashboardView();
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function scrollToPricing() {
  if (state.currentNav !== "home") {
    navigateTo("home");
  }
  setTimeout(() => {
    const el = document.getElementById("bang-gia");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, 100);
}

// ===== Authentication & User State =====
async function checkAuthSession() {
  if (!state.sessionToken) {
    updateTopBarAuth();
    return;
  }

  const res = await apiRequest("/api/auth/me");
  if (res.ok && res.data && res.data.success && res.data.user) {
    state.currentUser = res.data.user;
  } else {
    state.currentUser = null;
    state.sessionToken = null;
    localStorage.removeItem("ccs_session_token");
  }
  updateTopBarAuth();
}

function updateTopBarAuth() {
  const slot = document.getElementById("authTopBarSlot");
  if (!slot) return;

  if (state.currentUser) {
    slot.innerHTML = `
      <div class="user-badge-header" onclick="navigateTo('dashboard')">
        <span class="user-avatar-dot"><i class="fas fa-user"></i></span>
        <span>${state.currentUser.username}</span>
        <span class="user-balance-pill">${formatCurrency(state.currentUser.balance)}</span>
      </div>
      <button class="btn btn-red btn-sm" onclick="handleLogout(event)" title="Đăng Xuất">
        <i class="fas fa-sign-out-alt"></i>
      </button>
    `;
  } else {
    slot.innerHTML = `
      <button class="btn btn-lime btn-sm" onclick="openAuthModal('login')">
        <i class="fas fa-sign-in-alt"></i> Đăng nhập
      </button>
    `;
  }
}

async function handleLogout(e) {
  if (e && e.preventDefault) e.preventDefault();
  try {
    if (state.sessionToken) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Token': state.sessionToken
        }
      });
    }
  } catch (err) {
    console.warn("Logout upstream err:", err);
  }

  state.currentUser = null;
  state.sessionToken = null;
  localStorage.removeItem("ccs_session_token");
  updateTopBarAuth();
  showToast("Đã đăng xuất tài khoản thành công!", "info");

  if (state.currentNav === "dashboard") {
    renderDashboardView();
  }
}

// ===== Auth Modal Controls =====
function openAuthModal(mode = "login") {
  document.getElementById("authModal").classList.add("open");
  switchAuthMode(mode);
}

function closeAuthModal() {
  document.getElementById("authModal").classList.remove("open");
}

function switchAuthMode(mode) {
  const isLogin = mode === "login";
  document.getElementById("authTabLoginBtn").className = `btn btn-sm ${isLogin ? "btn-lime" : "btn-line"}`;
  document.getElementById("authTabRegBtn").className = `btn btn-sm ${!isLogin ? "btn-lime" : "btn-line"}`;
  document.getElementById("formAuthLogin").style.display = isLogin ? "flex" : "none";
  document.getElementById("formAuthRegister").style.display = isLogin ? "none" : "flex";
}

async function handleAuthLoginSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const username = document.getElementById("authModalUsername").value.trim();
  const password = document.getElementById("authModalPassword").value.trim();

  if (!username || !password) {
    showToast("Vui lòng nhập tài khoản và mật khẩu!", "error");
    return;
  }

  const btn = document.getElementById("btnModalLoginSubmit");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang đăng nhập...`;

  const res = await apiRequest("/api/auth/login", "POST", { username, password });
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-sign-in-alt"></i> Đăng Nhập`;

  if (res.ok && res.data && res.data.success) {
    state.sessionToken = res.data.token;
    state.currentUser = res.data.user;
    localStorage.setItem("ccs_session_token", res.data.token);
    updateTopBarAuth();
    closeAuthModal();
    showToast(`Chào mừng trở lại, ${state.currentUser.username}!`, "success");
    if (state.currentNav === "dashboard") {
      renderDashboardView();
    }
  } else {
    showToast((res.data && res.data.error) || "Đăng nhập thất bại. Kiểm tra lại thông tin!", "error");
  }
}

async function handleAuthRegisterSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const username = document.getElementById("regModalUsername").value.trim();
  const email = document.getElementById("regModalEmail").value.trim();
  const password = document.getElementById("regModalPassword").value.trim();

  if (!username || !email || !password) {
    showToast("Vui lòng điền đầy đủ các mục!", "error");
    return;
  }

  const btn = document.getElementById("btnModalRegSubmit");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang đăng ký...`;

  const res = await apiRequest("/api/auth/register", "POST", { username, email, password });
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-user-plus"></i> Tạo Tài Khoản`;

  if (res.ok && res.data && res.data.success) {
    state.sessionToken = res.data.token;
    state.currentUser = res.data.user;
    localStorage.setItem("ccs_session_token", res.data.token);
    updateTopBarAuth();
    closeAuthModal();
    showToast("Đăng ký tài khoản thành công!", "success");
    if (state.currentNav === "dashboard") {
      renderDashboardView();
    }
  } else {
    showToast((res.data && res.data.error) || "Đăng ký thất bại. Email hoặc tài khoản đã tồn tại!", "error");
  }
}

async function handleDashLoginForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  const username = document.getElementById("dashLoginUsername").value.trim();
  const password = document.getElementById("dashLoginPassword").value.trim();

  if (!username || !password) {
    showToast("Vui lòng nhập tài khoản và mật khẩu!", "error");
    return;
  }

  const btn = document.getElementById("btnDashLoginSubmit");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang đăng nhập...`;

  const res = await apiRequest("/api/auth/login", "POST", { username, password });
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-sign-in-alt"></i> Đăng Nhập Ngay`;

  if (res.ok && res.data && res.data.success) {
    state.sessionToken = res.data.token;
    state.currentUser = res.data.user;
    localStorage.setItem("ccs_session_token", res.data.token);
    updateTopBarAuth();
    showToast(`Đăng nhập thành công, chào ${state.currentUser.username}!`, "success");
    renderDashboardView();
  } else {
    showToast((res.data && res.data.error) || "Đăng nhập thất bại!", "error");
  }
}

// ===== Plans Loader & Renderer =====
async function loadPlans() {
  const res = await apiRequest("/api/proxy/plans");
  if (res.ok && res.data && res.data.data && res.data.data.plans && res.data.data.plans.length > 0) {
    // Map upstream plans with certnew format
    state.plans = res.data.data.plans.map((p, idx) => ({
      id: p.id,
      title: p.title || `Gói ${p.id}`,
      amount: p.amount || 0,
      warranty_days: p.warranty_days || (idx === 1 ? 30 : idx === 2 ? 180 : idx === 3 ? 300 : 0),
      duration_days: 365,
      is_featured: idx === 1,
      description: p.description || "Chứng Chỉ iPhone / iPad Cá Nhân.",
      features: [
        "Sử dụng 01 thiết bị duy nhất.",
        "Hỗ trợ Unban xóa bỏ blacklist.",
        "Hỗ trợ thiết bị Bypass ẩn iCloud.",
        "Chứng chỉ P12 và tệp MobileProvision.",
        "Nhận hàng ngay sau khi thanh toán."
      ]
    }));
  } else {
    state.plans = DEFAULT_PLANS;
  }
  renderPricingGrid();
}

function renderPricingGrid() {
  const grid = document.getElementById("certPricingGrid");
  if (!grid) return;

  grid.innerHTML = state.plans.map(p => `
    <article class="pricing-card ${p.is_featured ? 'featured' : ''}">
      ${p.is_featured ? '<span class="pricing-card-badge">★ Phổ biến nhất</span>' : ''}
      <div>
        <h3 class="pricing-title">${p.title}</h3>
        <p class="text-muted" style="font-size: 13.5px; margin-top: 0.35rem;">${p.description || "Chứng Chỉ iPhone / iPad Cá Nhân."}</p>

        <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin-top: 1rem;">
          <span class="pill" style="background: var(--c-cta);">
            <i class="far fa-calendar-alt"></i> ${p.duration_days || 365} ngày
          </span>
          <span class="pill" style="${p.warranty_days > 0 ? 'background: #dcfce7; color: #166534;' : 'background: var(--c-raise); color: var(--c-ink);'}">
            <i class="fas fa-shield-alt"></i> ${p.warranty_days > 0 ? `Bảo hành ${p.warranty_days} ngày` : 'Không bảo hành'}
          </span>
        </div>

        <ul class="pricing-features">
          ${(p.features || [
            "Sử dụng 01 thiết bị duy nhất.",
            "Hỗ trợ Unban xóa bỏ blacklist.",
            "Hỗ trợ thiết bị Bypass ẩn iCloud.",
            "Chứng chỉ P12 và tệp MobileProvision.",
            "Nhận hàng ngay sau khi thanh toán."
          ]).map(f => `
            <li><i class="fas fa-check-circle"></i><span>${f}</span></li>
          `).join('')}
        </ul>
      </div>

      <div class="pricing-price-row">
        <p class="pricing-amount">${p.amount === 0 ? "Miễn phí" : formatCurrency(p.amount)}</p>
        <button class="btn btn-lime btn-block" style="margin-top: 1rem;" onclick="openBuyModal(${p.id})">
          <i class="fas fa-shopping-cart"></i> ${p.amount === 0 ? "Nhận Ngay" : "Mua Ngay"}
        </button>
      </div>
    </article>
  `).join('');
}

// ===== Preset Apps Renderer (for #check) =====
function renderPresetApps() {
  const grid = document.getElementById("presetAppsGrid");
  if (!grid) return;

  grid.innerHTML = PRESET_APPS.map(app => `
    <div style="display: flex; align-items: center; justify-content: space-between; padding: 0.85rem; border: 2px solid var(--c-border); background: var(--c-soft); gap: 1rem;">
      <div style="display: flex; align-items: center; gap: 0.85rem;">
        <img src="${app.icon}" class="app-icon-squircle" style="width: 46px; height: 46px;" alt="${app.name}">
        <div>
          <strong style="font-size: 15px;">${app.name}</strong>
          <p class="text-muted" style="font-size: 12px;">Phiên bản v${app.version}</p>
        </div>
      </div>
      <div>
        <button class="btn btn-blue btn-sm" onclick="triggerQuickSign('${app.name}')">
          <i class="fas fa-file-signature"></i> Ký app
        </button>
      </div>
    </div>
  `).join('');
}

function triggerQuickSign(appName) {
  const udid = document.getElementById("checkOrderUdidInput")?.value.trim();
  if (!udid) {
    showToast(`Vui lòng nhập UDID thiết bị để ký ứng dụng ${appName}!`, "error");
    document.getElementById("checkOrderUdidInput")?.focus();
    return;
  }
  showToast(`Đang kết nối API ký chứng chỉ cho app ${appName}...`, "info");
}

// ===== Check Cert & Order Status (#check) =====
async function handleCheckCertAndOrder() {
  const input = document.getElementById("checkOrderUdidInput");
  const query = input?.value.trim();
  const container = document.getElementById("checkCertResultContainer");
  const btn = document.getElementById("btnCheckCertSubmit");

  if (!query) {
    showToast("Vui lòng nhập UDID thiết bị hoặc Mã đơn hàng!", "error");
    input?.focus();
    return;
  }

  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang kiểm tra...`;
  container.style.display = "block";
  container.innerHTML = `<div style="text-align: center; padding: 1.5rem;"><i class="fas fa-spinner fa-spin text-red" style="font-size: 24px;"></i><p style="margin-top: 8px;">Đang tra cứu từ máy chủ Apple & ChungChi...</p></div>`;

  // First check cert via POST /api/proxy/chekcert
  const certRes = await apiRequest("/api/proxy/chekcert", "POST", { order_code: query, udid: query });
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-search"></i> Kiểm tra ngay`;

  if (certRes.ok && certRes.data && certRes.data.data) {
    const cert = certRes.data.data;
    const isLive = cert.status === "live" || cert.status === "active" || cert.status === "completed";

    container.innerHTML = `
      <div style="border: 2.5px solid var(--c-border); background: var(--c-soft); padding: 1.25rem; box-shadow: 3px 3px 0 var(--c-border);">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
          <h4 style="font-size: 16px; text-transform: uppercase;">Kết Quả Kiểm Tra</h4>
          <span class="status-badge ${isLive ? 'status-active' : 'status-revoked'}">
            ${isLive ? 'HOẠT ĐỘNG (LIVE)' : 'BỊ THU HỒI (REVOKED)'}
          </span>
        </div>
        <div style="font-size: 13.5px; display: flex; flex-direction: column; gap: 0.4rem;">
          <div>Mã tra cứu: <strong class="font-mono text-blue">${query}</strong></div>
          <div>Trạng thái: <strong>${isLive ? 'Chứng chỉ đang hoạt động bình thường' : 'Chứng chỉ đã bị Apple thu hồi'}</strong></div>
          ${cert.expires_at ? `<div>Hạn sử dụng: <strong>${new Date(cert.expires_at).toLocaleDateString('vi-VN')}</strong></div>` : ''}
        </div>
        <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
          <a href="https://chungchi.store/search/cert/username-${query}.zip" class="btn btn-lime btn-sm" target="_blank">
            <i class="fas fa-download"></i> Tải File Chứng Chỉ (.zip)
          </a>
          <button class="btn btn-red btn-sm" onclick="triggerWarrantyRequest('${query}')">
            <i class="fas fa-sync-alt"></i> Yêu cầu bảo hành (Cấp lại)
          </button>
        </div>
      </div>
    `;
  } else {
    // If not found as cert, try order lookup
    const orderRes = await apiRequest(`/api/proxy/orders/${query}`);
    if (orderRes.ok && orderRes.data && orderRes.data.data && orderRes.data.data.order) {
      const ord = orderRes.data.data.order;
      container.innerHTML = `
        <div style="border: 2.5px solid var(--c-border); background: var(--c-soft); padding: 1.25rem; box-shadow: 3px 3px 0 var(--c-border);">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;">
            <h4 style="font-size: 16px; text-transform: uppercase;">Đơn Hàng: ${ord.order_code}</h4>
            <span class="status-badge status-${ord.status}">${ord.status.toUpperCase()}</span>
          </div>
          <div style="font-size: 13.5px; display: flex; flex-direction: column; gap: 0.4rem;">
            <div>Gói: <strong>${ord.title || "Chứng chỉ Apple"}</strong> (${formatCurrency(ord.amount || 0)})</div>
            <div>Thiết bị: <strong class="font-mono">${ord.device || "iPhone"} - ${ord.udid}</strong></div>
            <div>Ngày tạo: <strong>${new Date(ord.created_at).toLocaleString('vi-VN')}</strong></div>
          </div>
          <div style="margin-top: 1rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
            ${ord.download_url ? `<a href="${ord.download_url}" class="btn btn-lime btn-sm" target="_blank"><i class="fas fa-download"></i> Tải chứng chỉ</a>` : `<a href="https://chungchi.store/search/cert/username-${ord.order_code}.zip" class="btn btn-lime btn-sm" target="_blank"><i class="fas fa-download"></i> Tải zip</a>`}
            <button class="btn btn-red btn-sm" onclick="triggerWarrantyRequest('${ord.order_code}')"><i class="fas fa-sync-alt"></i> Yêu cầu bảo hành</button>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div style="border: 2px solid var(--c-red); background: #fee2e2; padding: 1rem; color: #991b1b; text-align: center; font-size: 13.5px;">
          <i class="fas fa-exclamation-triangle" style="font-size: 18px; margin-bottom: 4px; display: block;"></i>
          Không tìm thấy chứng chỉ hoặc đơn hàng tương ứng với thông tin: <strong>${query}</strong>.<br>Vui lòng kiểm tra lại mã UDID hoặc Mã đơn!
        </div>
      `;
    }
  }
}

async function triggerWarrantyRequest(orderCode) {
  showToast(`Đang gửi yêu cầu bảo hành cấp lại cho đơn: ${orderCode}...`, "info");
  const res = await apiRequest("/api/proxy/warranty", "POST", { order_code: orderCode });
  if (res.ok && res.data && res.data.success) {
    showToast("Yêu cầu bảo hành đã được gửi thành công!", "success");
  } else {
    const err = (res.data && (res.data.error || res.data.message)) || "Yêu cầu bảo hành không thành công. Vui lòng liên hệ hỗ trợ viên!";
    showToast(err, "error");
  }
}

// ===== DASHBOARD CONTROLLER (https://certnew.com/dashboard) =====
function renderDashboardView() {
  const gate = document.getElementById("dashAuthGate");
  const wrapper = document.getElementById("dashMainWrapper");

  if (!state.currentUser) {
    if (gate) gate.style.display = "block";
    if (wrapper) wrapper.style.display = "none";
    return;
  }

  if (gate) gate.style.display = "none";
  if (wrapper) wrapper.style.display = "grid";

  // Update User info in sidebar
  document.getElementById("dashUsernameText").textContent = state.currentUser.username;
  document.getElementById("dashEmailText").textContent = state.currentUser.email;
  document.getElementById("dashBalancePill").textContent = formatCurrency(state.currentUser.balance);
  document.getElementById("dashBigBalance").textContent = formatCurrency(state.currentUser.balance);

  // Load stats and orders
  loadDashboardStats();
  loadDashboardOrders();
  loadDashboardDevices();

  // Show active tab
  switchDashTab(state.activeDashTab || "overview");
}

function switchDashTab(tabId) {
  state.activeDashTab = tabId;

  // Update sidebar buttons
  document.querySelectorAll(".dash-menu-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  // Switch subtab panels
  document.querySelectorAll(".dash-subtab").forEach(tab => {
    tab.style.display = tab.id === `dash-tab-${tabId}` ? "block" : "none";
  });

  if (tabId === "orders") {
    loadDashboardOrders();
  } else if (tabId === "devices") {
    loadDashboardDevices();
  }
}

async function loadDashboardStats() {
  const res = await apiRequest("/api/user/stats");
  if (res.ok && res.data && res.data.success) {
    const s = res.data.stats;
    state.stats = s;
    state.currentUser.balance = s.balance;
    updateTopBarAuth();

    document.getElementById("statBalanceValue").textContent = formatCurrency(s.balance);
    document.getElementById("statOrderCountValue").textContent = s.order_count;
    document.getElementById("statDeviceCountValue").textContent = s.device_count;
    document.getElementById("dashBigBalance").textContent = formatCurrency(s.balance);

    if (s.api_token) {
      state.currentUser.api_token = s.api_token;
      document.getElementById("dashApiTokenInput").value = s.api_token;
    }
  }
}

async function loadDashboardOrders() {
  const res = await apiRequest("/api/user/orders");
  const recentTbody = document.getElementById("dashRecentOrdersBody");
  const allTbody = document.getElementById("dashAllOrdersBody");

  if (!res.ok || !res.data || !res.data.orders || res.data.orders.length === 0) {
    const emptyRow = `<tr><td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--c-muted);"><i class="fas fa-box-open" style="font-size: 26px; margin-bottom: 6px; display: block;"></i>Chưa có đơn hàng nào.</td></tr>`;
    if (recentTbody) recentTbody.innerHTML = emptyRow;
    if (allTbody) allTbody.innerHTML = emptyRow;
    return;
  }

  const orders = res.data.orders;
  const recentOrders = orders.slice(0, 5);

  const renderRow = (ord) => `
    <tr>
      <td><strong class="font-mono text-red">${ord.order_code}</strong></td>
      <td><strong>${ord.title || "Gói Apple"}</strong></td>
      <td><span class="font-mono" style="font-size: 12px;">${ord.udid.substring(0, 8)}...</span></td>
      <td>${new Date(ord.created_at).toLocaleDateString('vi-VN')}</td>
      <td><span class="status-badge status-${ord.status}">${ord.status.toUpperCase()}</span></td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          <a href="https://chungchi.store/search/cert/username-${ord.order_code}.zip" class="btn btn-lime btn-sm" target="_blank" style="padding: 3px 8px; font-size: 11px;">
            <i class="fas fa-download"></i> Tải zip
          </a>
          <button class="btn btn-red btn-sm" onclick="triggerWarrantyRequest('${ord.order_code}')" style="padding: 3px 8px; font-size: 11px;">
            <i class="fas fa-shield-alt"></i> Bảo hành
          </button>
        </div>
      </td>
    </tr>
  `;

  if (recentTbody) recentTbody.innerHTML = recentOrders.map(renderRow).join('');
  if (allTbody) allTbody.innerHTML = orders.map(ord => `
    <tr>
      <td><strong class="font-mono text-red">${ord.order_code}</strong></td>
      <td><strong>${ord.title || "Gói Apple"}</strong></td>
      <td>${formatCurrency(ord.amount)}</td>
      <td><span class="font-mono" style="font-size: 12px;">${ord.udid}</span></td>
      <td>${new Date(ord.created_at).toLocaleString('vi-VN')}</td>
      <td><span class="status-badge status-${ord.status}">${ord.status.toUpperCase()}</span></td>
      <td>
        <div style="display: flex; gap: 0.35rem;">
          <a href="https://chungchi.store/search/cert/username-${ord.order_code}.zip" class="btn btn-lime btn-sm" target="_blank" style="padding: 3px 8px; font-size: 11px;">
            <i class="fas fa-download"></i> Tải zip
          </a>
          <button class="btn btn-red btn-sm" onclick="triggerWarrantyRequest('${ord.order_code}')" style="padding: 3px 8px; font-size: 11px;">
            <i class="fas fa-shield-alt"></i> Bảo hành
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function loadDashboardDevices() {
  const tbody = document.getElementById("dashDevicesTableBody");
  if (!tbody) return;

  const res = await apiRequest("/api/user/devices");
  if (!res.ok || !res.data || !res.data.devices || res.data.devices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--c-muted);"><i class="fas fa-mobile-alt" style="font-size: 26px; margin-bottom: 6px; display: block;"></i>Chưa có thiết bị nào được gán. Hãy lấy UDID và mua gói chứng chỉ đầu tiên!</td></tr>`;
    return;
  }

  tbody.innerHTML = res.data.devices.map(dev => `
    <tr>
      <td><strong>${(dev.model || "iPhone").toUpperCase()}</strong></td>
      <td><code class="font-mono" style="font-size: 12.5px;">${dev.udid}</code></td>
      <td>${dev.plan_name || "Gói Apple"}</td>
      <td>${new Date(dev.created_at).toLocaleDateString('vi-VN')}</td>
      <td><span class="status-badge status-${dev.status || 'active'}">${(dev.status || 'ACTIVE').toUpperCase()}</span></td>
      <td>
        <button class="btn btn-lime btn-sm" onclick="copyText('${dev.udid}')" style="padding: 3px 8px; font-size: 11px;">
          <i class="fas fa-copy"></i> Sao chép UDID
        </button>
      </td>
    </tr>
  `).join('');
}

// Quick Deposit Amount Select in Dashboard
function selectDashDepositAmount(amt) {
  document.getElementById("dashDepositAmountInput").value = amt;
}

async function handleCreateDashDeposit() {
  const amtInput = document.getElementById("dashDepositAmountInput");
  const amount = parseInt(amtInput?.value) || 0;

  if (amount < 10000) {
    showToast("Số tiền nạp tối thiểu là 10.000đ!", "error");
    return;
  }

  const btn = document.getElementById("btnCreateDashDeposit");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo mã nạp...`;

  const res = await apiRequest("/api/user/deposit", "POST", { amount });
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-qrcode"></i> Tạo mã nạp tiền VietQR`;

  if (res.ok && res.data && res.data.success) {
    state.activeDeposit = res.data;
    const memo = encodeURIComponent(res.data.deposit_code);
    const qrUrl = `https://img.vietqr.io/image/${CONFIG.bankInfo.bin}-${CONFIG.bankInfo.accountNumber}-compact2.png?amount=${res.data.amount}&addInfo=${memo}&accountName=${encodeURIComponent(CONFIG.bankInfo.accountHolder)}`;

    document.getElementById("dashVietQrImg").src = qrUrl;
    document.getElementById("dashDepositAmountText").textContent = formatCurrency(res.data.amount);
    document.getElementById("dashDepositContentText").textContent = res.data.deposit_code;
    document.getElementById("dashDepositQrBox").style.display = "block";

    showToast("Đã tạo mã QR nạp tiền thành công! Quét mã bằng app ngân hàng.", "success");
    document.getElementById("dashDepositQrBox").scrollIntoView({ behavior: "smooth" });
  } else {
    showToast((res.data && res.data.error) || "Không thể tạo mã nạp tiền!", "error");
  }
}

async function handleConfirmDashDeposit() {
  if (!state.activeDeposit) return;
  const btn = document.getElementById("btnConfirmDashDeposit");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang kiểm tra giao dịch...`;

  const res = await apiRequest("/api/user/confirm-deposit", "POST", { deposit_code: state.activeDeposit.deposit_code });
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-check-circle"></i> Tôi đã chuyển tiền (Kiểm tra ngay)`;

  if (res.ok && res.data && res.data.success) {
    state.currentUser.balance = res.data.new_balance;
    updateTopBarAuth();
    document.getElementById("statBalanceValue").textContent = formatCurrency(res.data.new_balance);
    document.getElementById("dashBigBalance").textContent = formatCurrency(res.data.new_balance);
    document.getElementById("dashDepositQrBox").style.display = "none";
    showToast(res.data.message || "Nạp tiền thành công!", "success");
  } else {
    showToast((res.data && res.data.error) || "Chưa nhận được giao dịch. Vui lòng thử lại sau giây lát!", "error");
  }
}

function copyDashApiToken() {
  const token = document.getElementById("dashApiTokenInput")?.value;
  if (token) {
    copyText(token, "Đã sao chép API Token!");
  }
}

async function handleChangePasswordForm(e) {
  if (e && e.preventDefault) e.preventDefault();
  const old_password = document.getElementById("settingsOldPassword").value;
  const new_password = document.getElementById("settingsNewPassword").value;
  const confirm_password = document.getElementById("settingsConfirmPassword").value;

  if (new_password !== confirm_password) {
    showToast("Mật khẩu mới và xác nhận mật khẩu không khớp!", "error");
    return;
  }

  const btn = document.getElementById("btnSettingsSubmit");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang lưu...`;

  const res = await apiRequest("/api/auth/change-password", "POST", { old_password, new_password });
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-save"></i> Cập Nhật Mật Khẩu`;

  if (res.ok && res.data && res.data.success) {
    showToast("Đổi mật khẩu thành công!", "success");
    document.getElementById("settingsOldPassword").value = "";
    document.getElementById("settingsNewPassword").value = "";
    document.getElementById("settingsConfirmPassword").value = "";
  } else {
    showToast((res.data && res.data.error) || "Không thể đổi mật khẩu. Kiểm tra lại mật khẩu cũ!", "error");
  }
}

// ===== BUY / CHECKOUT MODAL =====
function openBuyModal(planId) {
  const plan = state.plans.find(p => p.id === planId) || DEFAULT_PLANS.find(p => p.id === planId);
  if (!plan) return;
  state.selectedPlan = plan;

  document.getElementById("checkoutPlanTitle").textContent = plan.title;
  document.getElementById("checkoutPlanPrice").textContent = `Giá thanh toán: ${formatCurrency(plan.amount)} / ${plan.duration_days || 365} ngày`;
  document.getElementById("checkoutStepForm").style.display = "block";
  document.getElementById("checkoutStepPayment").style.display = "none";

  const userBalance = state.currentUser ? state.currentUser.balance : 0;
  document.getElementById("checkoutUserBalanceText").textContent = formatCurrency(userBalance);

  document.getElementById("checkoutModal").classList.add("open");
}

function closeCheckoutModal() {
  document.getElementById("checkoutModal").classList.remove("open");
  clearInterval(state.orderCheckInterval);
}

async function handleConfirmOrderSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const udid = document.getElementById("orderUdidInput").value.trim();
  const device = document.getElementById("orderDeviceSelect").value || "iphone";
  const p12_password = document.getElementById("orderP12PasswordInput").value.trim() || "1";
  const pay_with_wallet = document.getElementById("chkPayWithWallet").checked;

  if (!udid || udid.length < 8) {
    showToast("Vui lòng nhập mã UDID hợp lệ của thiết bị!", "error");
    document.getElementById("orderUdidInput").focus();
    return;
  }

  const btn = document.getElementById("btnSubmitOrderAction");
  btn.disabled = true;
  btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Đang tạo đơn...`;

  const payload = {
    plan_id: state.selectedPlan.id,
    udid,
    device,
    p12_password,
    pay_with_balance: pay_with_wallet
  };

  const res = await apiRequest("/api/proxy/orders", "POST", payload);
  btn.disabled = false;
  btn.innerHTML = `<i class="fas fa-check-circle"></i> Xác Nhận Tạo Đơn Hàng`;

  if (res.ok && res.data && res.data.data && res.data.data.order) {
    state.activeOrder = res.data.data.order;
    showToast("Tạo đơn hàng thành công!", "success");

    if (pay_with_wallet) {
      if (state.currentUser) {
        state.currentUser.balance -= state.selectedPlan.amount;
        updateTopBarAuth();
      }
      closeCheckoutModal();
      navigateTo("dashboard");
      switchDashTab("orders");
      showToast(`Đã thanh toán gói ${state.selectedPlan.title} thành công bằng số dư ví!`, "success");
    } else {
      showOrderPaymentStep(state.activeOrder);
    }
  } else {
    const errText = (res.data && (res.data.error || res.data.message)) || "Không thể tạo đơn hàng qua hệ thống API. Vui lòng kiểm tra lại UDID!";
    showToast(errText, "error");
  }
}

function showOrderPaymentStep(order) {
  document.getElementById("checkoutStepForm").style.display = "none";
  document.getElementById("checkoutStepPayment").style.display = "block";

  document.getElementById("orderPayCode").textContent = order.order_code;
  document.getElementById("orderPayAmount").textContent = formatCurrency(order.amount);
  document.getElementById("orderPayContent").textContent = order.order_code;

  const memo = encodeURIComponent(order.order_code);
  const qrUrl = `https://img.vietqr.io/image/${CONFIG.bankInfo.bin}-${CONFIG.bankInfo.accountNumber}-compact2.png?amount=${order.amount}&addInfo=${memo}&accountName=${encodeURIComponent(CONFIG.bankInfo.accountHolder)}`;
  document.getElementById("orderVietQrImage").src = qrUrl;

  clearInterval(state.orderCheckInterval);
  state.orderCheckInterval = setInterval(() => checkActiveOrderStatus(order.order_code), 8000);
}

async function checkActiveOrderStatus(orderCode) {
  const code = orderCode || (state.activeOrder && state.activeOrder.order_code);
  if (!code) return;

  const res = await apiRequest(`/api/proxy/orders/${code}`);
  if (res.ok && res.data && res.data.data && res.data.data.order) {
    const ord = res.data.data.order;
    if (ord.status === "completed" || ord.status === "active") {
      clearInterval(state.orderCheckInterval);
      closeCheckoutModal();
      showToast(`Đơn hàng ${code} đã kích hoạt thành công!`, "success");
      navigateTo("dashboard");
      switchDashTab("orders");
    } else {
      showToast(`Trạng thái đơn ${code}: ${ord.status.toUpperCase()}`, "info");
    }
  }
}

// ===== UDID Detection Helper =====
function checkDetectedUdid() {
  const urlParams = new URLSearchParams(window.location.search);
  let udid = urlParams.get("udid");
  if (!udid && window.location.hash.includes("udid=")) {
    const match = window.location.hash.match(/udid=([A-Za-z0-9\-_]+)/);
    if (match) udid = match[1];
  }

  if (udid) {
    const box = document.getElementById("detectedUdidBox");
    const text = document.getElementById("detectedUdidText");
    if (box && text) {
      text.textContent = udid;
      box.style.display = "block";
    }
    const input = document.getElementById("orderUdidInput");
    if (input) input.value = udid;
    const checkInput = document.getElementById("checkOrderUdidInput");
    if (checkInput) checkInput.value = udid;
  }
}

function copyDetectedUdid() {
  const text = document.getElementById("detectedUdidText")?.textContent;
  if (text) copyText(text, "Đã sao chép mã UDID!");
}

// ===== Initialize =====
document.addEventListener("DOMContentLoaded", () => {
  // Check hash route
  const hash = window.location.hash.replace("#", "") || "home";
  navigateTo(hash);

  window.addEventListener("hashchange", () => {
    const h = window.location.hash.replace("#", "") || "home";
    navigateTo(h);
  });

  // Load initial data
  checkAuthSession();
  loadPlans();
  renderPresetApps();
  checkDetectedUdid();
});

// Window Exports for direct HTML onclick access
window.navigateTo = navigateTo;
window.scrollToPricing = scrollToPricing;
window.handleLogout = handleLogout;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthMode = switchAuthMode;
window.handleAuthLoginSubmit = handleAuthLoginSubmit;
window.handleAuthRegisterSubmit = handleAuthRegisterSubmit;
window.handleDashLoginForm = handleDashLoginForm;
window.openBuyModal = openBuyModal;
window.closeCheckoutModal = closeCheckoutModal;
window.handleConfirmOrderSubmit = handleConfirmOrderSubmit;
window.checkActiveOrderStatus = checkActiveOrderStatus;
window.switchDashTab = switchDashTab;
window.selectDashDepositAmount = selectDashDepositAmount;
window.handleCreateDashDeposit = handleCreateDashDeposit;
window.handleConfirmDashDeposit = handleConfirmDashDeposit;
window.copyDashApiToken = copyDashApiToken;
window.handleChangePasswordForm = handleChangePasswordForm;
window.handleCheckCertAndOrder = handleCheckCertAndOrder;
window.triggerWarrantyRequest = triggerWarrantyRequest;
window.triggerQuickSign = triggerQuickSign;
window.copyDetectedUdid = copyDetectedUdid;
window.copyText = copyText;
