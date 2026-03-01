document.getElementById('menu-icon').addEventListener('click', function() {
    const navList = document.getElementById('nav-list');
    if (navList.style.display === 'flex') {
        navList.style.display = 'none';
    } else {
        navList.style.display = 'flex';
    }
});