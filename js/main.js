// ==========================================
// 全局引擎初始化
// ==========================================
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('main-container');
const allSpans = document.querySelectorAll('.column span');

// 1. 清理 3D 诗词 Hover 延迟 Bug
if (allSpans.length > 0) {
    allSpans.forEach((span) => {
        const order = parseInt(span.getAttribute('data-order'));
        span.style.transitionDelay = `${order * 0.04}s`;
        setTimeout(() => { span.style.transitionDelay = '0s'; }, 1200); 
    });
}

// 2. 画布自适应
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// 3. 核心交互变量：只保留全局鼠标坐标
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2 + 50; 

// 鼠标实时跟踪 (现在仅用于双星雷达，彻底去除了导致卡顿的 3D 诗词跟踪)
window.addEventListener('mousemove', (e) => { 
    mouseX = e.clientX; 
    mouseY = e.clientY; 
});


// ==========================================
// 4. 动力学引擎：李萨如双星 + 流星拖尾
// ==========================================
let p1 = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0, radius: 5, history: [] };
let p2 = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0, radius: 4, history: [] };
let trailX = window.innerWidth / 2;
let trailY = window.innerHeight / 2;
let time = 0;

let lastScrollY = window.scrollY || 0;
let lastAttractor = null;

function updatePhysics(p, targetX, targetY, isLight, isAnchored) {
    let orbitScale = isAnchored ? 0.35 : 1.0; 
    let speedScale = isAnchored ? 0.5 : 1.0;  

    let freqX = (isLight ? 1.3 : 0.85) * speedScale; 
    let freqY = (isLight ? 0.9 : 1.25) * speedScale; 
    let radiusX = (isLight ? 45 : 35) * orbitScale;
    let radiusY = (isLight ? 30 : 50) * orbitScale;
    let phase = isLight ? 0 : Math.PI; 

    let ghostX = targetX + Math.sin(time * freqX + phase) * radiusX;
    let ghostY = targetY + Math.cos(time * freqY + phase) * radiusY;

    let spring = isAnchored ? 0.08 : 0.035; 
    p.vx += (ghostX - p.x) * spring;
    p.vy += (ghostY - p.y) * spring;

    let friction = isAnchored ? 0.75 : 0.86; 
    p.vx *= friction;
    p.vy *= friction;

    p.x += p.vx;
    p.y += p.vy;

    p.history.unshift({x: p.x, y: p.y});
    if (p.history.length > 25) p.history.pop();
}

// 实体圆润线段渲染方式
function drawTrail(p, rgbString) {
    if (p.history.length < 2) return; 
    
    for (let i = 0; i < p.history.length - 1; i++) {
        let pt1 = p.history[i];
        let pt2 = p.history[i+1];
        
        let alpha = (1 - i / p.history.length) * 0.4; 
        let size = p.radius * (1 - (i / p.history.length) * 0.8) * 2; 
        
        ctx.beginPath();
        ctx.moveTo(pt1.x, pt1.y);
        ctx.lineTo(pt2.x, pt2.y);
        ctx.strokeStyle = `rgba(${rgbString}, ${alpha})`;
        ctx.lineWidth = size;
        ctx.lineCap = 'round'; 
        ctx.stroke();
    }
}

// 🚨 性能优化版：带设备断点感知的雷达扫描逻辑 🚨
let currentAttractor = null; 

function scanForAttractor() {
    // 动态决定扫描目标：详情页的标题始终扫描；
    // 主页的 .section-title 只有在手机/竖屏 iPad (<= 850px) 时才被扫描
    let selector = '.content-title, .massive-title';
    if (window.innerWidth <= 850) {
        selector += ', .section-title';
    }
    
    const activeTitles = document.querySelectorAll(selector);
    
    // 如果当前屏幕模式下没有合法目标（比如电脑端的主页），立刻释放吸附，跟随鼠标
    if (activeTitles.length === 0) {
        currentAttractor = null;
        return;
    }

    let minDiff = Infinity;
    const readingLine = window.innerHeight * 0.35; 
    let newAttractor = null;
    
    activeTitles.forEach(title => {
        const rect = title.getBoundingClientRect();
        const diff = Math.abs(rect.top - readingLine);
        if (diff < minDiff) { minDiff = diff; newAttractor = title; }
    });
    
    currentAttractor = newAttractor;
}

scanForAttractor();
window.addEventListener('scroll', scanForAttractor, { passive: true });
window.addEventListener('resize', scanForAttractor, { passive: true });

// 5. 动画主循环
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    time += 0.02;
    let currentScrollY = window.scrollY || 0;
    let scrollDelta = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;
    let isAnchored = false;

    if (currentAttractor && currentAttractor === lastAttractor && scrollDelta !== 0) {
        trailY -= scrollDelta;
        p1.y -= scrollDelta;
        p2.y -= scrollDelta;
        p1.history.forEach(pt => pt.y -= scrollDelta);
        p2.history.forEach(pt => pt.y -= scrollDelta);
    }
    lastAttractor = currentAttractor;

    if (currentAttractor) {
        const rect = currentAttractor.getBoundingClientRect();
        isAnchored = true;
        
        // 将安全判定界限同步改为 850px，与 iPad 竖屏布局一致
        if (window.innerWidth <= 850) {
            trailX += (35 - trailX) * 0.12;
            trailY += ((rect.top + rect.height / 2) - trailY) * 0.12;
        } else {
            trailX += ((rect.left - 40) - trailX) * 0.12; 
            trailY += ((rect.top + rect.height / 2) - trailY) * 0.12;
        }
    } else {
        // 解放后的自由模式：完美跟随鼠标
        trailX += (mouseX - trailX) * 0.06;
        trailY += (mouseY - trailY) * 0.06;
    }

    updatePhysics(p1, trailX, trailY, true, isAnchored);
    updatePhysics(p2, trailX, trailY, false, isAnchored);

    drawTrail(p1, '255, 255, 255');
    drawTrail(p2, '0, 255, 255');

    ctx.beginPath();
    ctx.arc(p1.x, p1.y, p1.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ffffff';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(p2.x, p2.y, p2.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#002233'; 
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffff'; 
    ctx.fill();
    
    ctx.shadowBlur = 0; 
    requestAnimationFrame(animate);
}

animate();

// ==========================================
// 6. 动态渲染项目卡片系统
// ==========================================
function renderProjects() {
    const container = document.getElementById('project-list-container');
    if (!container) return; 
    if (typeof portfolioData === 'undefined') return;

    let htmlContent = '';
    portfolioData.projects.forEach(project => {
        const tagsHtml = project.tags.map(tag => `<span>${tag}</span>`).join('');
        htmlContent += `
            <a href="${project.link}" class="project-link">
                <div class="glass-card">
                    <h3>${project.title}</h3>
                    <div class="tags">${tagsHtml}</div>
                    <p>${project.desc}</p>
                </div>
            </a>
        `;
    });
    container.innerHTML = htmlContent;
}
renderProjects();

// ==========================================
// 8. 全屏大图查看器系统 (Lightbox)
// ==========================================
function initLightbox() {
    // 1. 动态在网页底层创建一个“暗房”容器，免去修改 HTML 的麻烦
    const overlay = document.createElement('div');
    overlay.className = 'lightbox-overlay';
    const img = document.createElement('img');
    img.className = 'lightbox-img';
    overlay.appendChild(img);
    document.body.appendChild(overlay);

    // 2. 自动搜捕页面上所有的展示图
    const images = document.querySelectorAll('.sailors-hero-img, .showcase-img, .pixel-art');
    
    // 3. 为它们绑定点击放大事件
    images.forEach(image => {
        image.addEventListener('click', () => {
            img.src = image.src; // 把被点击的图片地址塞进暗房
            overlay.classList.add('active'); // 开灯
        });
    });

    // 4. 点击暗房任意区域即可关闭
    overlay.addEventListener('click', () => {
        overlay.classList.remove('active');
        // 延迟清空图片地址，保证淡出动画丝滑
        setTimeout(() => { if(!overlay.classList.contains('active')) img.src = ''; }, 300);
    });
}

// 确保网页完全加载后激活系统
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLightbox);
} else {
    initLightbox();
}