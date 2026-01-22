const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const btnDescribir = document.getElementById('btnDescribir');
const btnNoDescribir = document.getElementById('btnNoDescribir');
const inputText = document.getElementById('inputText');
const statusElem = document.getElementById('status');

let model, streaming = false, localStream = null;
let objetosYaAnunciados = new Set();
let modoDescripcion = false; 

const ALTURAS_REALES = { "person": 1.7, "chair": 0.9, "cell phone": 0.15, "bottle": 0.25, "laptop": 0.25 };
const FOCAL_LENGTH = 600;
const traducciones = { "person": "persona", "chair": "silla", "bottle": "botella", "cell phone": "celular", "laptop": "computadora" };

// --- CONTROL DE VOZ SALIDA ---
function hablar(texto) {
    // Si ya está hablando, cancelamos para no acumular
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    window.speechSynthesis.speak(msg);
}

// --- ACTUALIZAR BOTONES ---
function actualizarInterfazModo() {
    btnDescribir.classList.toggle('active-desc', modoDescripcion);
    btnNoDescribir.classList.toggle('active-simple', !modoDescripcion);
}

// --- CALIBRACIÓN DE COLOR ---
function analizarColorTono(r, g, b) {
    const brillo = (r + g + b) / 3;
    if (brillo < 15) return "negro fuerte";
    if (brillo > 238) return "blanco claro";
    let base = (b > r * 1.05 && b > g * 1.05) ? "azul" : 
               (r > g * 1.2 && r > b * 1.2) ? "rojo" : 
               (g > r * 1.1 && g > b * 1.1) ? "verde" : 
               (r > 130 && g > 130 && b < 100) ? "amarillo" : "gris";
    if (brillo > 175) return base + " claro";
    if (brillo < 85) return base + " fuerte";
    return base + " medio";
}

// --- ANÁLISIS DE ROPA ---
function obtenerDetallesVoz(p) {
    const [x, y, w, h] = p.bbox;
    try {
        if (p.class === "person") {
            const dataC = ctx.getImageData(x + (w/2), y + (h * 0.35), 6, 6).data;
            const dataP = ctx.getImageData(x + (w/2), y + (h * 0.80), 6, 6).data;
            const prom = (d) => {
                let r=0, g=0, b=0;
                for(let i=0; i<d.length; i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
                return [r/(d.length/4), g/(d.length/4), b/(d.length/4)];
            };
            const rgbC = prom(dataC); const rgbP = prom(dataP);
            return `. Camisa ${analizarColorTono(rgbC[0],rgbC[1],rgbC[2])}, pantalón ${analizarColorTono(rgbP[0],rgbP[1],rgbP[2])}`;
        }
        const data = ctx.getImageData(x+(w/2), y+(h/2), 4, 4).data;
        return `. Color ${analizarColorTono(data[0], data[1], data[2])}`;
    } catch (e) { return ""; }
}

// --- RECONOCIMIENTO DE VOZ MEJORADO ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = false; // Cambiado a false para evitar bucles de procesamiento

    rec.onstart = () => { window.speechSynthesis.cancel(); };
    rec.onresult = (event) => {
        const transcripcion = event.results[event.results.length - 1][0].transcript.toLowerCase();
        inputText.value = transcripcion;

        if (transcripcion.includes("iniciar")) start();
        else if (transcripcion.includes("detener")) stop();
        else if (transcripcion.includes("no describir") || transcripcion.includes("modo simple")) { 
            if (modoDescripcion) { // Solo ejecutar si hay cambio real
                modoDescripcion = false; 
                actualizarInterfazModo();
                hablar("Modo simple activado");
            }
        }
        else if (transcripcion.includes("describir") || transcripcion.includes("modo descripción")) { 
            if (!modoDescripcion) { // Solo ejecutar si hay cambio real
                modoDescripcion = true; 
                actualizarInterfazModo();
                hablar("Modo descripción activado");
            }
        }
    };
    document.body.addEventListener('click', () => rec.start(), { once: true });
}

// --- BOTONES FÍSICOS ---
btnDescribir.onclick = () => { 
    if (!modoDescripcion) {
        modoDescripcion = true; 
        actualizarInterfazModo();
        hablar("Modo descripción activado");
    }
};

btnNoDescribir.onclick = () => { 
    if (modoDescripcion) {
        modoDescripcion = false; 
        actualizarInterfazModo();
        hablar("Modo simple activado");
    }
};

async function start() {
    if (streaming) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        hablar("Iniciando sistema");
        video.onloadedmetadata = () => { canvas.width = video.videoWidth; canvas.height = video.videoHeight; predict(); };
    } catch (e) { statusElem.textContent = "Error de cámara."; }
}

function stop() {
    if (!streaming) return;
    streaming = false;
    hablar("Sistema detenido"); 
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

async function predict() {
    if (!streaming) return;
    const preds = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    preds.filter(p => p.score > 0.6).forEach(p => {
        const [x, y, w, h] = p.bbox;
        const nombre = traducciones[p.class] || p.class;
        const dist = Math.round(((ALTURAS_REALES[p.class] || 0.5) * FOCAL_LENGTH) / h);
        ctx.strokeStyle = "#00ff00"; ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "#00ff00"; ctx.fillText(`${nombre} ${dist}m`, x, y > 20 ? y - 10 : 20);

        if (!objetosYaAnunciados.has(p.class)) {
            let mensaje = `${nombre} a ${dist} metros`;
            if (modoDescripcion) mensaje += obtenerDetallesVoz(p);
            hablar(mensaje);
            objetosYaAnunciados.add(p.class);
            setTimeout(() => objetosYaAnunciados.delete(p.class), 12000);
        }
    });
    requestAnimationFrame(predict);
}

startButton.onclick = start;
stopButton.onclick = stop;

(async () => {
    model = await cocoSsd.load();
    statusElem.textContent = "SISTEMA LISTO.";
})();