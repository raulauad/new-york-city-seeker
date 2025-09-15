const track = document.getElementById("imgs");
const slides = track.querySelectorAll("img");
const prevBtn = document.getElementById("left");
const nextBtn = document.getElementById("right");

let index = 0;
let timer = null; //Inicio timer en null, ya que todavia no se inició

function slideWidth() {
    // El ancho visible del viewport, que es el ancho del contenedor padre
    return track.parentElement.clientWidth;
}

function goTo(i) {
    index = (i + slides.length) % slides.length; //Sumo slides.length para evitar negativos, uso modulo para volver al inicio
    const offset = -index * slideWidth(); //Index negativo, ya que muevo la tira a la izquierda * el ancho de la imagen(slideWidth())
    track.style.transform = `translateX(${offset}px)`; //Aplico el movimiento al contenedor de imagenes
}

function next() { goTo(index + 1); }
function prev() { goTo(index - 1); }

function startAuto() {
    stopAuto(); //Limpiamos el timer si ya estaba andando
    timer = setInterval(next, 3000); //Cada 3 segundos, llamamos a next("devuelve el siguiente valor")
}

function stopAuto() {
    if (timer) clearInterval(timer);
    timer = null;
}

// Listeners
nextBtn.addEventListener("click", () => { next(); startAuto(); });
prevBtn.addEventListener("click", () => { prev(); startAuto(); });
window.addEventListener("resize", () => goTo(index)); //Recalcular al cambiar tamaño

// Init
goTo(0);
startAuto();

