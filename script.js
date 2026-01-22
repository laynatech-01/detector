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

function hablar(texto) {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    window.speechSynthesis.speak(msg);
}

// --- CALIBRACIÓN DE COLOR (RESCATE DE AZULES) ---
function analizarColorTono(r, g, b) {
    const brillo = (r + g + b) / 3;
    if (brillo < 15) return "negro fuerte";
    if (brillo > 235) return "blanco claro";

    let base = "";
    if (b > r * 1.05 && b > g * 1.05) base = "azul";
    else if (r > g * 1.2 && r > b * 1.2) base = "rojo";
    else if (g > r * 1.1 && g > b * 1.1) base = "verde";
    else if (r > 130 && g > 130 && b < 100) base = "amarillo";
    else base = "gris";

    if (brillo > 170) return base + " claro";
    if (brillo < 80) return base + " fuerte";
    return base + " medio";
}



function obtenerDetallesVoz(p) {
    const [x, y, w, h] = p.bbox;
    try {
        if (p.class === "person") {
            const dataC = ctx.getImageData(x + (w/2), y + (h * 0.35), 8, 8).data;
            const dataP = ctx.getImageData(x + (w/2), y + (h * 0.80), 8, 8).data;
            const promediar = (d) => {
                let r=0, g=0, b=0;
                for(let i=0; i<d.length; i+=4){ r+=d[i]; g+=d[i+1]; b+=d[i+2]; }
                return [r/(d.length/4), g/(d.length/4), b/(d.length/4)];
            };
            const rgbC = promediar(dataC); const rgbP = promediar(dataP);
            return `. Camisa ${analizarColorTono(rgbC[0],rgbC[1],rgbC[2])}, pantalón ${analizarColorTono(rgbP[0],rgbP[1],rgbP[2])}`;
        } else {
            const data = ctx.getImageData(x+(w/2), y+(h/2), 5, 5).data;
            return `. Color ${analizarColorTono(data[0], data[1], data[2])}`;
        }
    } catch (e) { return ""; }
}

// --- RECONOCIMIENTO DE VOZ ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true; // Para que aparezca el texto mientras hablas

    rec.onstart = () => { window.speechSynthesis.cancel(); };

    rec.onresult = (event) => {
        let interimTranscript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                const cmd = event.results[i][0].transcript.toLowerCase();
                inputText.value = cmd;
                if (cmd.includes("iniciar")) start();
                else if (cmd.includes("detener")) stop();
                else if (cmd.includes("no describir")) { modoDescripcion = false; hablar("Modo simple"); }
                else if (cmd.includes("describir")) { modoDescripcion = true; hablar("Modo descripción"); }
            } else {
                interimTranscript += event.results[i][0].transcript;
                inputText.value = interimTranscript;
            }
        }
    };
    document.body.addEventListener('click', () => rec.start(), { once: true });
}

// --- BOTONES FÍSICOS ---
btnDescribir.onclick = () => { modoDescripcion = true; hablar("Modo descripción activo"); };
btnNoDescribir.onclick = () => { modoDescripcion = false; hablar("Modo simple activo"); };

async function predict() {
    if (!streaming) return;
    const preds = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    preds.filter(p => p.score > 0.6).forEach(p => {
        const [x, y, w, h] = p.bbox;
        const nombre = traducciones[p.class] || p.class;
        const dist = Math.round(((ALTURAS_REALES[p.class] || 0.5) * FOCAL_LENGTH) / h);

        ctx.strokeStyle = "#00ff00";
        ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = "#00ff00";
        ctx.fillText(`${nombre} ${dist}m`, x, y > 20 ? y - 10 : 20);

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

async function start() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream; video.play();
        streaming = true; startButton.disabled = true; stopButton.disabled = false;
        video.onloadedmetadata = () => { canvas.width = video.videoWidth; canvas.height = video.videoHeight; predict(); };
    } catch (e) { statusElem.textContent = "Error de cámara."; }
}

function stop() {
    streaming = false; if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null; startButton.disabled = false; stopButton.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

(async () => {
    model = await cocoSsd.load();
    statusElem.textContent = "V5-K LISTO.";
})();

startButton.onclick = start;
stopButton.onclick = stop;