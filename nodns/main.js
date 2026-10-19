
// === AUDIO FEEDBACK (Synthesized Web Audio API) ===
let audioCtx = null;
function playSoftClick(freq = 600, duration = 0.04) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, audioCtx.currentTime + duration);
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {}
}

// === FAQ ACCORDION ===
function initFaqAccordion() {
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    const answer = item.querySelector('.faq-answer');
    btn?.addEventListener('click', () => {
      const isOpen = item.classList.contains('active');
      playSoftClick(isOpen ? 450 : 700);

      // Close other items
      faqItems.forEach(other => {
        if (other !== item) {
          other.classList.remove('active');
          other.querySelector('.faq-question')?.setAttribute('aria-expanded', 'false');
          const otherAns = other.querySelector('.faq-answer');
          if (otherAns) otherAns.style.maxHeight = null;
        }
      });

      // Toggle current
      item.classList.toggle('active', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
      if (!isOpen) {
        answer.style.maxHeight = answer.scrollHeight + 'px';
      } else {
        answer.style.maxHeight = null;
      }
    });
  });
}

// === LENIS SMOOTH SCROLL ===
if (typeof Lenis !== 'undefined') {
  const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
  function raf(time) { lenis.raf(time); requestAnimationFrame(raf); }
  requestAnimationFrame(raf);
}

// === NAVBAR SCROLL ===
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 10) navbar.classList.add('scrolled');
  else navbar.classList.remove('scrolled');
});

// === MOBILE NAV TOGGLE ===
const navToggle = document.getElementById('nav-toggle');
const navLinks = document.getElementById('nav-links');
navToggle?.addEventListener('click', () => {
  navLinks.classList.toggle('open');
});
// Close on link click
navLinks?.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => navLinks.classList.remove('open'));
});

// === ZALO FLOAT - compact after scroll ===
const zaloFloat = document.getElementById('zalo-float');
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const curr = window.scrollY;
  if (curr > 300 && curr > lastScroll) {
    zaloFloat?.classList.add('compact');
  } else {
    zaloFloat?.classList.remove('compact');
  }
  lastScroll = curr;
});

// === LOGO DATA ===
const LOGOS = [
  { name: 'Ứng dụng gốc', bg: '#F5A623', heart: '#fff', style: 'default' },
  { name: 'Hồng pastel', bg: '#F8B4D4', heart: '#E0507A', style: 'default' },
  { name: 'Tím nhạt', bg: '#C4B3F0', heart: '#7B4FDC', style: 'default' },
  { name: 'Xanh lam', bg: '#93C5FD', heart: '#1D4ED8', style: 'default' },
  { name: 'Xanh lá', bg: '#86EFAC', heart: '#166534', style: 'default' },
  { name: 'Đỏ', bg: '#FCA5A5', heart: '#991B1B', style: 'default' },
  { name: 'Vàng', bg: '#FDE68A', heart: '#92400E', style: 'default' },
  { name: 'Cam', bg: '#FDBA74', heart: '#9A3412', style: 'default' },
  { name: 'Mint', bg: '#A7F3D0', heart: '#065F46', style: 'default' },
  { name: 'Đen', bg: '#1F2937', heart: '#F9FAFB', style: 'default' },
  { name: 'Trắng', bg: '#F9FAFB', heart: '#111827', style: 'default' },
  { name: 'Hoa anh đào', bg: '#FBB6CE', heart: '#9D174D', style: 'floral' },
  { name: 'Tím đậm', bg: '#7B4FDC', heart: '#EDE9FE', style: 'default' },
  { name: 'Xanh đậm', bg: '#1D4ED8', heart: '#DBEAFE', style: 'default' },
  { name: 'Hồng đậm', bg: '#EC4899', heart: '#FCE7F3', style: 'default' },
  { name: 'Xanh cyan', bg: '#06B6D4', heart: '#CFFAFE', style: 'default' },
  { name: 'Đỏ đậm', bg: '#DC2626', heart: '#FEE2E2', style: 'default' },
  { name: 'Nâu', bg: '#78350F', heart: '#FEF3C7', style: 'default' },
  { name: 'Xám', bg: '#6B7280', heart: '#F9FAFB', style: 'default' },
  { name: 'Indigo', bg: '#4338CA', heart: '#E0E7FF', style: 'default' },
  { name: 'Rose', bg: '#F43F5E', heart: '#FFE4E6', style: 'default' },
  { name: 'Teal', bg: '#0F766E', heart: '#CCFBF1', style: 'default' },
  { name: 'Sky', bg: '#0EA5E9', heart: '#E0F2FE', style: 'default' },
  { name: 'Fuchsia', bg: '#C026D3', heart: '#FAE8FF', style: 'default' },
  { name: 'Emerald', bg: '#059669', heart: '#D1FAE5', style: 'default' },
  { name: 'Amber', bg: '#D97706', heart: '#FEF3C7', style: 'default' },
  { name: 'Violet', bg: '#7C3AED', heart: '#EDE9FE', style: 'default' },
  { name: 'Lime', bg: '#65A30D', heart: '#F7FEE7', style: 'default' },
  { name: 'Pink Neon', bg: '#FF0080', heart: '#FFD6EC', style: 'default' },
  { name: 'Bầu trời', bg: '#38BDF8', heart: '#F0F9FF', style: 'default' },
  { name: 'Hoa cúc', bg: '#FEF08A', heart: '#713F12', style: 'floral' },
  { name: 'Đêm', bg: '#0F172A', heart: '#38BDF8', style: 'default' },
  { name: 'Bình minh', bg: '#FED7AA', heart: '#9A3412', style: 'default' },
  { name: 'Biển cả', bg: '#0369A1', heart: '#E0F2FE', style: 'default' },
  { name: 'Huyền bí', bg: '#581C87', heart: '#FAF5FF', style: 'default' },
];

function drawLogoCanvas(canvas, bg, heart, size = 64) {
  const ctx = canvas.getContext('2d');
  canvas.width = size;
  canvas.height = size;
  const r = size * 0.2;

  // Background rounded rect
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Heart shape
  const cx = size / 2;
  const cy = size / 2 + size * 0.05;
  const hw = size * 0.32;

  ctx.fillStyle = heart;
  ctx.beginPath();
  ctx.moveTo(cx, cy + hw * 0.6);
  ctx.bezierCurveTo(cx - hw * 1.1, cy - hw * 0.1, cx - hw * 1.3, cy - hw * 0.9, cx, cy - hw * 0.4);
  ctx.bezierCurveTo(cx + hw * 1.3, cy - hw * 0.9, cx + hw * 1.1, cy - hw * 0.1, cx, cy + hw * 0.6);
  ctx.closePath();
  ctx.fill();
}

// === LOGO PICKER ===
function initLogoPicker() {
  const grid = document.getElementById('logo-grid');
  const previewCanvas = document.getElementById('logo-canvas');
  const previewName = document.getElementById('logo-preview-name');
  const previewSub = document.getElementById('logo-preview-subtitle');
  const btnSeeAll = document.getElementById('btn-see-all-logos');

  if (!grid) return;

  // Draw preview (first logo)
  drawLogoCanvas(previewCanvas, LOGOS[0].bg, LOGOS[0].heart, 64);

  LOGOS.forEach((logo, i) => {
    const item = document.createElement('div');
    item.className = 'logo-item' + (i === 0 ? ' active' : '');
    item.title = logo.name;

    const canvas = document.createElement('canvas');
    canvas.className = 'logo-item-canvas';
    drawLogoCanvas(canvas, logo.bg, logo.heart, 56);

    const label = document.createElement('div');
    label.className = 'logo-item-name';
    label.textContent = logo.name;

    item.appendChild(canvas);
    item.appendChild(label);

    item.addEventListener('click', () => {
      grid.querySelectorAll('.logo-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      drawLogoCanvas(previewCanvas, logo.bg, logo.heart, 64); playSoftClick(650);
      previewName.textContent = 'Locket';
      previewSub.textContent = logo.name;
    });

    grid.appendChild(item);
  });

  let expanded = false;
  btnSeeAll?.addEventListener('click', () => {
    expanded = !expanded;
    grid.classList.toggle('expanded', expanded);
    btnSeeAll.textContent = expanded ? 'Thu gọn' : 'Xem tất cả 35 mẫu';
  });
}

// === WIDGET FRAMES DATA ===
const WIDGET_FRAMES = [
  { name: 'Không khung', emoji: '⬜', bg: '#f0f0f0' },
  { name: 'Loopy', emoji: '🌀', bg: '#E0CCFF' },
  { name: 'Trời mưa', emoji: '🌧', bg: '#BFD7FF' },
  { name: '2 ngày 1 đêm', emoji: '🏕️', bg: '#FFE7B0' },
  { name: '20/10 Việt Nam', emoji: '🌺', bg: '#FFD6EC' },
  { name: '20/10 viền mảnh', emoji: '🌸', bg: '#FFE5F5' },
  { name: 'Giáng sinh', emoji: '🎄', bg: '#D1FAE5' },
  { name: 'Năm mới', emoji: '🎆', bg: '#FEF3C7' },
  { name: 'Mùa thu', emoji: '🍂', bg: '#FED7AA' },
];

function initWidgetPicker() {
  const grid = document.getElementById('widget-frames-grid');
  if (!grid) return;

  WIDGET_FRAMES.forEach((frame, i) => {
    const item = document.createElement('div');
    item.className = 'widget-frame-item' + (i === 0 ? ' active' : '');

    const preview = document.createElement('div');
    preview.className = 'widget-frame-preview';
    preview.style.background = frame.bg;
    preview.textContent = frame.emoji;

    const label = document.createElement('div');
    label.className = 'widget-frame-label';
    label.textContent = frame.name;

    item.appendChild(preview);
    item.appendChild(label);

    item.addEventListener('click', () => {
      grid.querySelectorAll('.widget-frame-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active'); playSoftClick(550);
      // Update widget display
      const widgetDisplay = document.querySelector('.widget-photo-inner');
      if (widgetDisplay) {
        widgetDisplay.style.background = frame.bg;
      }
    });

    grid.appendChild(item);
  });

  // Tab switching
  document.querySelectorAll('.wtab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.wtab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
    });
  });

  // Upload button
  document.querySelector('.btn-upload-frame')?.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png';
    input.click();
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const widgetDisplay = document.querySelector('.widget-photo-inner');
      if (widgetDisplay) {
        widgetDisplay.style.background = `url(${url}) center/cover`;
      }
    };
  });
}

// === CAMERA THEMES ===
const CAMERA_THEMES = [
  { name: 'Mặc định', color: '#4A1A3D', dot: '#9B4D6B', label: 'Mặc định' },
  { name: 'Vàng', color: '#7A5500', dot: '#F5A623', label: 'Vàng' },
  { name: 'Xanh nhạt', color: '#1B4A6B', dot: '#5BC4F5', label: 'Xanh nhạt' },
  { name: 'Xám nhạt', color: '#4A4A4A', dot: '#D0D0D0', label: 'Xám nhạt' },
  { name: 'Xám bạc', color: '#5A5A5A', dot: '#C0C0C0', label: 'Xám bạc' },
  { name: 'Tím pastel', color: '#5B3080', dot: '#C4A0E0', label: 'Tím pastel' },
  { name: 'Hồng', color: '#8B1A60', dot: '#FF5CA8', label: 'Hồng' },
  { name: 'Tím đậm', color: '#350062', dot: '#9B59B6', label: 'Tím đậm' },
  { name: 'Cyan', color: '#006B6B', dot: '#00FFFF', label: 'Cyan' },
  { name: 'Xanh dương', color: '#0033A0', dot: '#4A90E2', label: 'Xanh dương' },
  { name: 'Đỏ', color: '#8B1A1A', dot: '#FF4444', label: 'Đỏ' },
  { name: 'Cam', color: '#8B3A00', dot: '#FF8C00', label: 'Cam' },
  { name: 'Vàng nhạt', color: '#6B5A00', dot: '#FFD700', label: 'Vàng nhạt' },
  { name: 'Vàng nâu', color: '#7A4A00', dot: '#DAA520', label: 'Vàng nâu' },
];

let currentTheme = 6; // Start with Hồng

function initCameraThemes() {
  const dotsContainer = document.getElementById('color-dots');
  const cameraDemo = document.getElementById('camera-demo');
  const themeLabel = document.getElementById('camera-theme-label');
  const cameraInner = document.getElementById('camera-inner-circle');
  const prevBtn = document.getElementById('camera-prev');
  const nextBtn = document.getElementById('camera-next');

  if (!dotsContainer) return;

  function applyTheme(idx) {
    const theme = CAMERA_THEMES[idx];
    cameraDemo.style.background = theme.color;
    if (themeLabel) themeLabel.textContent = theme.label;
    if (cameraInner) cameraInner.style.borderColor = theme.dot;

    // Update section gradient
    const section = document.getElementById('chu-de');
    if (section) {
      const hsl = hexToHsl(theme.color);
      section.style.background = `linear-gradient(160deg, hsl(${hsl[0]}, ${Math.max(hsl[1]-20, 10)}%, ${Math.min(hsl[2]+40, 95)}%) 0%, hsl(${hsl[0]+20}, ${Math.max(hsl[1]-10, 10)}%, ${Math.min(hsl[2]+30, 92)}%) 100%)`;
    }

    // Update dots
    dotsContainer.querySelectorAll('.color-dot').forEach((dot, i) => {
      dot.classList.toggle('active', i === idx);
    });

    currentTheme = idx;
  }

  function hexToHsl(hex) {
    let r = parseInt(hex.slice(1,3),16)/255;
    let g = parseInt(hex.slice(3,5),16)/255;
    let b = parseInt(hex.slice(5,7),16)/255;
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    let h, s, l = (max+min)/2;
    if (max === min) { h = s = 0; }
    else {
      const d = max-min;
      s = l > 0.5 ? d/(2-max-min) : d/(max+min);
      switch(max) {
        case r: h = (g-b)/d + (g<b?6:0); break;
        case g: h = (b-r)/d + 2; break;
        case b: h = (r-g)/d + 4; break;
      }
      h /= 6;
    }
    return [Math.round(h*360), Math.round(s*100), Math.round(l*100)];
  }

  // Render dots
  CAMERA_THEMES.forEach((theme, i) => {
    const dot = document.createElement('button');
    dot.className = 'color-dot' + (i === currentTheme ? ' active' : '');
    dot.style.background = theme.dot;
    dot.title = theme.label;
    dot.addEventListener('click', () => applyTheme(i));
    dotsContainer.appendChild(dot);
  });

  // Initial apply
  applyTheme(currentTheme);

  prevBtn?.addEventListener('click', () => {
    applyTheme((currentTheme - 1 + CAMERA_THEMES.length) % CAMERA_THEMES.length);
  });
  nextBtn?.addEventListener('click', () => {
    applyTheme((currentTheme + 1) % CAMERA_THEMES.length);
  });
}

// === INTERSECTION OBSERVER - Animate on scroll ===
function initScrollAnimations() {
  const animateEl = document.querySelectorAll('.feature-card, .trust-card, .review-card, .pricing-card');
  
  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const siblings = Array.from(entry.target.parentElement.children);
        const idx = siblings.indexOf(entry.target);
        setTimeout(() => {
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'translateY(0)';
        }, 80 * idx);
        cardObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

  animateEl.forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(24px)';
    el.style.transition = 'opacity 0.55s ease, transform 0.55s ease';
    cardObserver.observe(el);
  });
}

// === INIT ===
document.addEventListener('DOMContentLoaded', () => {
  initLogoPicker();
  initWidgetPicker();
  initCameraThemes();
  initScrollAnimations();
  initFaqAccordion();
});
