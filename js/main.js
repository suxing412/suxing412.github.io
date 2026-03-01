// 获取画布与DOM元素
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('main-container');
const allSpans = document.querySelectorAll('.column span');

// 清理 Hover 延迟 Bug
allSpans.forEach((span) => {
    const order = parseInt(span.getAttribute('data-order'));
    span.style.transitionDelay = `${order * 0.04}s`;
    setTimeout(() => { span.style.transitionDelay = '0s'; }, 1200); 
});

// 画布自适应
function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener('resize', resize);
resize();

// 鼠标与面板状态变量
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2 + 50; 
let isLeftDrawerOpen = false;
let isRightDrawerOpen = false;

// 监听侧边栏展开状态
document.getElementById('left-drawer').addEventListener('mouseenter', () => { isLeftDrawerOpen = true; updateContainerPhysics(); });
document.getElementById('left-drawer').addEventListener('mouseleave', () => { isLeftDrawerOpen = false; updateContainerPhysics(); });

document.getElementById('right-drawer').addEventListener('mouseenter', () => { isRightDrawerOpen = true; updateContainerPhysics(); });
document.getElementById('right-drawer').addEventListener('mouseleave', () => { isRightDrawerOpen = false; updateContainerPhysics(); });

// 鼠标实时跟踪
window.addEventListener('mousemove', (e) => { 
    mouseX = e.clientX; 
    mouseY = e.clientY; 
    updateContainerPhysics(); 
});

// 3D 诗词视角控制 (注意力机制)
function updateContainerPhysics() {
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

// 动力学李萨如双星系统
let p1 = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0 };
let p2 = { x: window.innerWidth / 2, y: window.innerHeight / 2, vx: 0, vy: 0 };
let trailX = window.innerWidth / 2;
let trailY = window.innerHeight / 2;
let time = 0;

function updatePhysics(p, targetX, targetY, isLight) {
    let freqX = isLight ? 1.3 : 0.85; 
    let freqY = isLight ? 0.9 : 1.25; 
    let radiusX = isLight ? 45 : 35;
    let radiusY = isLight ? 30 : 50;
    let phase = isLight ? 0 : Math.PI; 

    let ghostX = targetX + Math.sin(time * freqX + phase) * radiusX;
    let ghostY = targetY + Math.cos(time * freqY + phase) * radiusY;

    let spring = 0.035; 
    p.vx += (ghostX - p.x) * spring;
    p.vy += (ghostY - p.y) * spring;

    let friction = 0.86; 
    p.vx *= friction;
    p.vy *= friction;

    p.x += p.vx;
    p.y += p.vy;
}

// 动画主循环
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    time += 0.02;

    trailX += (mouseX - trailX) * 0.06;
    trailY += (mouseY - trailY) * 0.06;

    updatePhysics(p1, trailX, trailY, true);
    updatePhysics(p2, trailX, trailY, false);

    // 绘制亮星
    ctx.beginPath();
    ctx.arc(p1.x, p1.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#ffffff';
    ctx.fill();

    // 绘制暗星
    ctx.beginPath();
    ctx.arc(p2.x, p2.y, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#002233'; 
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#00ffff'; 
    ctx.fill();
    
    ctx.shadowBlur = 0; 
    requestAnimationFrame(animate);
}

animate();