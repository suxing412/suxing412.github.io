// ==========================================
// 苏省 · 系统蓝图引擎 (Blueprint Engine)
// 背景节点图 + 导航锚点高亮 + Lightbox + 联系复制
// ==========================================
const canvas = document.getElementById('bg-canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ==========================================
// 1. 背景节点图：漂移节点 + 连线 + 脉冲信号
// ==========================================
const LINE_COLOR = 'rgba(146, 180, 222, 0.16)';
const NODE_STROKE = 'rgba(146, 180, 222, 0.5)';
const NODE_FILL = '#0e1a2b';
const ACCENT = 'rgba(255, 180, 84, 0.9)';
const ACCENT_SOFT = 'rgba(255, 180, 84, 0.45)';

let nodes = [];
let edges = [];
let pulses = [];
let time = 0;
let rafId = null;
let animationRunning = false;
let mouseX = -9999, mouseY = -9999;

function resizeCanvas() {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function buildGraph() {
    if (!canvas) return;
    nodes = [];
    edges = [];
    pulses = [];
    const w = canvas.width, h = canvas.height;
    const count = Math.max(10, Math.min(20, Math.round((w * h) / 90000)));

    // 泊松式撒点：保证节点间最小距离
    let attempts = 0;
    while (nodes.length < count && attempts < count * 30) {
        attempts++;
        const x = 40 + Math.random() * (w - 80);
        const y = 40 + Math.random() * (h - 80);
        if (nodes.every(n => (n.hx - x) ** 2 + (n.hy - y) ** 2 > 150 ** 2)) {
            nodes.push({
                hx: x, hy: y, x, y,
                r: 2.5 + Math.random() * 2,
                major: Math.random() < 0.22,          // 少数主节点带琥珀环
                amp: 8 + Math.random() * 16,          // 漂移幅度
                phase: Math.random() * Math.PI * 2,
                speed: 0.25 + Math.random() * 0.35
            });
        }
    }

    // 每个节点连向最近的 2 个邻居（去重）
    const seen = new Set();
    nodes.forEach((n, i) => {
        const dists = nodes
            .map((m, j) => ({ j, d: (n.hx - m.hx) ** 2 + (n.hy - m.hy) ** 2 }))
            .filter(o => o.j !== i)
            .sort((a, b) => a.d - b.d)
            .slice(0, 2);
        dists.forEach(o => {
            const key = i < o.j ? `${i}-${o.j}` : `${o.j}-${i}`;
            if (!seen.has(key)) { seen.add(key); edges.push([i, o.j]); }
        });
    });
}

function spawnPulse() {
    if (edges.length === 0) return;
    const edge = edges[Math.floor(Math.random() * edges.length)];
    pulses.push({ edge, t: 0, speed: 0.006 + Math.random() * 0.006 });
}

function drawGraph() {
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 节点位置：围绕 home 点缓慢漂移 + 鼠标轻微牵引
    nodes.forEach(n => {
        n.x = n.hx + Math.sin(time * n.speed + n.phase) * n.amp;
        n.y = n.hy + Math.cos(time * n.speed * 0.8 + n.phase) * n.amp;
        const dx = mouseX - n.x, dy = mouseY - n.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 160 * 160) {
            const pull = (1 - Math.sqrt(distSq) / 160) * 14;
            n.x += (dx / Math.sqrt(distSq + 1)) * pull;
            n.y += (dy / Math.sqrt(distSq + 1)) * pull;
        }
    });

    // 连线
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = 1;
    edges.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
        ctx.stroke();
    });

    // 脉冲信号：沿边移动的琥珀光点
    pulses = pulses.filter(p => p.t <= 1);
    pulses.forEach(p => {
        p.t += p.speed;
        const [a, b] = p.edge;
        const x = nodes[a].x + (nodes[b].x - nodes[a].x) * p.t;
        const y = nodes[a].y + (nodes[b].y - nodes[a].y) * p.t;
        ctx.beginPath();
        ctx.arc(x, y, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = ACCENT;
        ctx.shadowBlur = 8;
        ctx.shadowColor = ACCENT;
        ctx.fill();
        ctx.shadowBlur = 0;
    });

    // 节点
    nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = NODE_FILL;
        ctx.strokeStyle = n.major ? ACCENT_SOFT : NODE_STROKE;
        ctx.lineWidth = n.major ? 1.5 : 1;
        ctx.fill();
        ctx.stroke();
        if (n.major) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, n.r + 4, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(255, 180, 84, 0.2)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    });
}

function animate() {
    if (!animationRunning) return;
    time += 0.016;
    if (Math.random() < 0.012) spawnPulse();
    drawGraph();
    rafId = requestAnimationFrame(animate);
}

function startAnimation() {
    if (animationRunning || !ctx) return;
    animationRunning = true;
    animate();
}

function stopAnimation() {
    animationRunning = false;
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
}

if (ctx) {
    resizeCanvas();
    buildGraph();
    window.addEventListener('resize', () => { resizeCanvas(); buildGraph(); if (prefersReducedMotion) drawGraph(); });

    if (prefersReducedMotion) {
        drawGraph(); // 静态一帧，不进循环
    } else {
        window.addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; }, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) stopAnimation(); else startAnimation();
        });
        startAnimation();
    }
}

// ==========================================
// 2. 导航锚点高亮（仅主页生效）
// ==========================================
function initNavHighlight() {
    const links = document.querySelectorAll('.nav-links a[href^="#"]');
    if (links.length === 0 || !('IntersectionObserver' in window)) return;
    const map = new Map();
    links.forEach(link => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) map.set(target, link);
    });
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                links.forEach(l => l.classList.remove('active'));
                const link = map.get(entry.target);
                if (link) link.classList.add('active');
            }
        });
    }, { rootMargin: '-40% 0px -55% 0px' });
    map.forEach((_, target) => observer.observe(target));
}

// ==========================================
// 3. 全屏大图查看器 (Lightbox)
// ==========================================
function initLightbox() {
    // 页面上没有可放大的图就不创建暗房（避免主页出现孤立关闭按钮）
    const images = document.querySelectorAll('.detail-hero-img, .detail-card-img, .showcase-img, .pixel-art');
    if (images.length === 0) return;

    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', '图片查看器');
    const img = document.createElement('img');
    img.className = 'lightbox-img';
    img.alt = '';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'lightbox-close';
    closeBtn.setAttribute('aria-label', '关闭大图 (Esc)');
    closeBtn.textContent = '✕';
    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);

    let lastTrigger = null; // 记录触发元素，关闭后归还焦点

    function openLightbox(source) {
        img.src = source.src;
        img.alt = source.alt || '';
        lastTrigger = source;
        overlay.classList.add('active');
        // .active 使 visibility 同步翻转为 visible，可立即移交焦点；个别渲染时序下补一次重试
        closeBtn.focus();
        if (document.activeElement !== closeBtn) setTimeout(() => closeBtn.focus(), 50);
    }

    function closeLightbox() {
        overlay.classList.remove('active');
        img.classList.remove('zoomed');
        overlay.scrollTo(0, 0);
        // 延迟清空图片地址，保证淡出动画丝滑
        setTimeout(() => { if (!overlay.classList.contains('active')) img.src = ''; }, 300);
        if (lastTrigger) lastTrigger.focus();
    }

    // 点击图片：在"适应屏幕 ↔ 原始尺寸"之间切换（大图看细节的关键路径）
    img.addEventListener('click', (e) => {
        e.stopPropagation(); // 点图不关闭，点背景才关闭
        img.classList.toggle('zoomed');
        if (!img.classList.contains('zoomed')) overlay.scrollTo(0, 0);
    });

    images.forEach(image => {
        image.setAttribute('tabindex', '0');
        image.setAttribute('role', 'button');
        image.addEventListener('click', () => openLightbox(image));
        image.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLightbox(image); }
        });
    });

    overlay.addEventListener('click', closeLightbox);
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeLightbox(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('active')) closeLightbox();
    });
}

// ==========================================
// 4. 联系方式一键复制（渐进增强：无 JS 时 mailto/链接原生可用）
// ==========================================
function initContactCopy() {
    document.querySelectorAll('[data-copy]').forEach(el => {
        el.addEventListener('click', () => {
            const text = el.getAttribute('data-copy');
            const write = navigator.clipboard
                ? navigator.clipboard.writeText(text)
                : Promise.reject();
            write.then(() => {
                // 优先只替换值文本，保留标签；页尾按钮无值节点则替换整体文本
                const target = el.querySelector('.contact-value') || el;
                if (!el.dataset.originalText) el.dataset.originalText = target.textContent;
                target.textContent = '已复制 ✓';
                el.classList.add('copied');
                clearTimeout(el._copyTimer);
                el._copyTimer = setTimeout(() => {
                    target.textContent = el.dataset.originalText;
                    el.classList.remove('copied');
                }, 1600);
            }).catch(() => { /* 剪贴板不可用时保持原生行为（mailto / 手动选中） */ });
        });
    });
}

// ==========================================
// 启动
// ==========================================
function initAll() {
    initNavHighlight();
    initLightbox();
    initContactCopy();
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
} else {
    initAll();
}
