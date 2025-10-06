const toggleButton = document.querySelector('.dropbtn');
const dropdownMenu = document.querySelector('.dropdown ul');

let menuOpen = false;

toggleButton.addEventListener('click', () => {

    menuOpen = !menuOpen;
    if (menuOpen) {
        dropdownMenu.style.display = 'block';
        dropdownMenu.style.display = 'flex';

    } else {
        dropdownMenu.style.display = 'none';
    }
});

window.addEventListener('click', (e) => {

    if (!toggleButton.contains(e.target) && !dropdownMenu.contains(e.target)) {
        dropdownMenu.style.display = 'none';
        menuOpen = false;
        toggleButton.classList.remove('open');
    }
});

const menuItems = dropdownMenu.querySelectorAll('li');

menuItems.forEach((item, index) => {
    item.style.transitionDelay = `${index * 0.3}s`;
})