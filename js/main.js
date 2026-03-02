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

// 3. 核心交互变量：全局引力场与状态
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2 + 50; 
let isLeftDrawerOpen = false;
let isRightDrawerOpen = false;

// 鼠标实时跟踪 (主页使用)
window.addEventListener('mousemove', (e) => { 
    mouseX = e.clientX; 
    mouseY = e.clientY; 
    if(container) updateContainerPhysics(); 
});

// 4. 主页：侧边栏引力劫持
const leftDrawer = document.getElementById('left-drawer');
const rightDrawer = document.getElementById('right-drawer');
let leftTab = null, rightTab = null;

if (leftDrawer && rightDrawer) {
    leftTab = leftDrawer.querySelector('.drawer-tab');
    rightTab = rightDrawer.querySelector('.drawer-tab');

    leftDrawer.addEventListener('mouseenter', () => { isLeftDrawerOpen = true; updateContainerPhysics(); });
    leftDrawer.addEventListener('mouseleave', () => { isLeftDrawerOpen = false; updateContainerPhysics(); });
    rightDrawer.addEventListener('mouseenter', () => { isRightDrawerOpen = true; updateContainerPhysics(); });
    rightDrawer.addEventListener('mouseleave', () => { isRightDrawerOpen = false; updateContainerPhysics(); });
}

// 5. 3D 诗词视角控制
function updateContainerPhysics() {
    if (!container) return;
    if (isLeftDrawerOpen) {
        container.style.transform = `translate3d(100px, 0, 0) rotateX(0deg) rotateY(-25deg)`;
    } else if (isRightDrawerOpen) {
        container.style.transform = `translate3d(-100px, 0, 0) rotateX(0deg) rotateY(25deg)`;
    } else {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const percentX = (mouseX - centerX) / centerX;
        const percentY = (mouseY - centerY) / centerY;
        container.style.transform = `translate3d(${percentX * 40}px, ${percentY * 40}px, 0) rotateX(${-percentY * 18}deg) rotateY(${percentX * 18}deg)`;
    }
}

// ==========================================
// 6. 动力学引擎：李萨如双星 + 流星拖尾
// ==========================================
let p1 = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0, radius: 5, history: [] };
let p2 = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0, radius: 4, history: [] };
let trailX = window.innerWidth / 2;
let trailY = window.innerHeight / 2;
let time = 0;

// 新增：记录上一帧的滚动位置和吸引目标
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

function drawTrail(p, rgbString) {
    for (let i = 0; i < p.history.length; i++) {
        let pt = p.history[i];
        let alpha = (1 - i / p.history.length) * 0.4; 
        let size = p.radius * (1 - (i / p.history.length) * 0.8); 
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${rgbString}, ${alpha})`;
        ctx.fill();
    }
}

// 获取详情页所有的标题元素
const contentTitles = document.querySelectorAll('.content-title, .massive-title');

// 7. 动画主循环 (搭载滚动视差补偿系统)
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    time += 0.02;
    
    // --- 核心修复 1：计算这一帧的真实滚动位移 ---
    let currentScrollY = window.scrollY || 0;
    let scrollDelta = currentScrollY - lastScrollY;
    lastScrollY = currentScrollY;
    
    let isAnchored = false;
    let currentAttractor = null;

    // --- 雷达扫描 ---
    if (isLeftDrawerOpen && leftTab) {
        currentAttractor = leftTab;
    } else if (isRightDrawerOpen && rightTab) {
        currentAttractor = rightTab;
    } else if (contentTitles.length > 0) {
        let minDiff = Infinity;
        const readingLine = window.innerHeight * 0.35; 
        
        contentTitles.forEach(title => {
            const rect = title.getBoundingClientRect();
            const diff = Math.abs(rect.top - readingLine);
            if (diff < minDiff) {
                minDiff = diff;
                currentAttractor = title;
            }
        });
    }

    // --- 核心修复 2：绝对锁定补偿！消除所有拉扯感 ---
    // 如果我们仍然锁定在同一个标题上，且页面发生了滚动
    if (currentAttractor && currentAttractor === lastAttractor && scrollDelta !== 0) {
        // 把滚动的像素差直接补偿给整个物理系统，抵消由于 DOM 瞬间移动造成的相对位移
        trailY -= scrollDelta;
        p1.y -= scrollDelta;
        p2.y -= scrollDelta;
        // 把拖尾的历史轨迹也一起平移，防止拖尾被拉长
        p1.history.forEach(pt => pt.y -= scrollDelta);
        p2.history.forEach(pt => pt.y -= scrollDelta);
    }
    lastAttractor = currentAttractor;

    // --- 引力场结算 ---
    if (currentAttractor) {
        const rect = currentAttractor.getBoundingClientRect();
        isAnchored = true;
        
        if (currentAttractor.classList.contains('drawer-tab')) {
            const isLeft = currentAttractor.parentElement.classList.contains('left');
            trailX += ((isLeft ? rect.right + 25 : rect.left - 25) - trailX) * 0.15;
            trailY += ((rect.top + rect.height / 2) - trailY) * 0.15;
        } else {
            // 既然滚动滞后已经被补偿解决，这里的飞行追踪系数可以稍微提高到 0.12，让跃迁更干脆
            trailX += ((rect.left - 40) - trailX) * 0.12; 
            trailY += ((rect.top + rect.height / 2) - trailY) * 0.12;
        }
    } else {
        trailX += (mouseX - trailX) * 0.06;
        trailY += (mouseY - trailY) * 0.06;
    }

    // 更新物理并绘制
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
// 8. 动态渲染项目卡片系统
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