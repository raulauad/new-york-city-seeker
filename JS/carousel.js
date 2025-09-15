const track = document.getElementById("imgs");
const slides = track.querySelectorAll("img");
const prevBtn = document.getElementById("left");
const nextBtn = document.getElementById("right");

let index = 0;
let timer = null;

function slideWidth() {
    // El ancho visible del viewport 
    return track.parentElement.clientWidth;
}

function goTo(i) {
    index = (i + slides.length) % slides.length;  // wrap circular
    const offset = -index * slideWidth();
    track.style.transform = `translateX(${offset}px)`;
}

function next() { goTo(index + 1); }
function prev() { goTo(index - 1); }

function startAuto() {
    stopAuto();
    timer = setInterval(next, 3000);
}

function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
}

// Listeners
nextBtn.addEventListener("click", () => { next(); startAuto(); });
prevBtn.addEventListener("click", () => { prev(); startAuto(); });
window.addEventListener("resize", () => goTo(index)); // Recalcular al cambiar tamaño

// Init
goTo(0);
startAuto();

