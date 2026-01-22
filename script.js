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
let modoDescripcion = true; // Control de si el sistema debe hablar

// Variables de control MAX-22
let manosOcupadas = false;
let ultimoMomentoConObjeto = 0;
let lastBeepTime = 0;
const TIEMPO_ESPERA_RESTABLECER = 10000;
const FOCAL_LENGTH = 600;

const ALTURAS_REALES = { 
    "person": 1.7, "chair": 0.9, "cell phone": 0.15, 
    "bottle": 0.25, "laptop": 0.25, "car": 1.5, "dog": 0.5,
    "knife": 0.20, "handgun": 0.18, "backpack": 0.45
};

const TRADUCCIONES = {
    "person": "persona", "cell phone": "celular", "bottle": "botella", 
    "backpack": "mochila", "cup": "taza", "chair": "silla", "laptop": "computadora"
};

// --- AUDIO Y VOZ ---
function sonarPitidoUnSegundo() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 1.0);
    } catch (e) {}
}

function hablar(texto, urgente = false) {
    if (!modoDescripcion && !urgente) return; // Si no está en modo describir, calla (excepto alertas)
    if (urgente) window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = urgente ? 1.3 : 1.1;
    window.speechSynthesis.speak(msg);
}

// --- RECONOCIMIENTO DE VOZ (COMANDOS) ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const recognition = new Recognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event) => {
        const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
        inputText.value = `Comando: ${command}`;

        if (command.includes("activar sistema")) iniciarSistema();
        if (command.includes("desactivar sistema")) detenerSistema();
        if (command.includes("describir")) activarDescripcion();
        if (command.includes("no describir")) desactivarDescripcion();
    };

    recognition.start();
    recognition.onend = () => recognition.start(); // Auto-reinicio
}

// --- LÓGICA DE DETECCIÓN ---
function detectarEmpuñadura(persona, todasPreds) {
    const [px, py, pw, ph] = persona.bbox;
    const zX = px - (pw * 0.2), zY = py + (ph * 0.2);
    const zW = pw * 1.4, zH = ph * 0.7;

    let objetoEnMano = null;
    todasPreds.forEach(obj => {
        if (obj.class !== "person" && obj.score > 0.3) {
            const [ox, oy, ow, oh] = obj.bbox;
            const cX = ox + ow / 2, cY = oy + oh / 2;
            if (cX > zX && cX < (zX + zW) && cY > zY && cY < (zY + zH)) {
                objetoEnMano = obj;
                ctx.strokeStyle = "#ffff00";
                ctx.lineWidth = 6;
                ctx.strokeRect(ox, oy, ow, oh);
            }
        }
    });
    return objetoEnMano;
}

async function predict() {
    if (!streaming) return;
    try {
        const preds = await model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ahora = Date.now();
        let objetoDetectadoEsteFrame = false;

        preds.forEach(p => {
            if (p.score > 0.5 && p.class === "person") {
                const mano = detectarEmpuñadura(p, preds);
                if (mano) {
                    objetoDetectadoEsteFrame = true;
                    manosOcupadas = true;
                    ultimoMomentoConObjeto = ahora;
                    if (ahora - lastBeepTime > 1100) {
                        sonarPitidoUnSegundo();
                        lastBeepTime = ahora;
                    }
                    if (!objetosYaAnunciados.has("ALERTA_MANOS")) {
                        hablar("Precaución. Trae un objeto en las manos", true);
                        objetosYaAnunciados.add("ALERTA_MANOS");
                    }
                }
                if (!manosOcupadas || mano) {
                    ctx.strokeStyle = "#00ff00";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(...p.bbox);
                }
            }
        });

        if (!objetoDetectadoEsteFrame && manosOcupadas) {
            if (ahora - ultimoMomentoConObjeto > TIEMPO_ESPERA_RESTABLECER) {
                manosOcupadas = false;
                objetosYaAnunciados.delete("ALERTA_MANOS");
            }
        }

        if (!manosOcupadas) {
            preds.forEach(p => {
                if (p.score > 0.5 && p.class !== "person") {
                    const dist = ((ALTURAS_REALES[p.class] || 0.5) * FOCAL_LENGTH / p.bbox[3]).toFixed(1);
                    if (!objetosYaAnunciados.has(p.class)) {
                        hablar(`${TRADUCCIONES[p.class] || p.class} a ${dist} metros`);
                        objetosYaAnunciados.add(p.class);
                        setTimeout(() => objetosYaAnunciados.delete(p.class), 12000);
                    }
                    ctx.strokeStyle = "#00ff00";
                    ctx.strokeRect(...p.bbox);
                }
            });
        }
    } catch (e) {}
    requestAnimationFrame(predict);
}

// --- ACCIONES DE BOTONES / COMANDOS ---
async function iniciarSistema() {
    if (streaming) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        hablar("sistema MAX-22 activo", true);
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            predict();
        };
    } catch (e) { statusElem.textContent = "Error de cámara"; }
}

function detenerSistema() {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    hablar("Sistema desactivado", true);
}

function activarDescripcion() {
    modoDescripcion = true;
    hablar("Modo descripción activado", true);
}

function desactivarDescripcion() {
    hablar("Modo descripción desactivado", true);
    setTimeout(() => modoDescripcion = false, 1500);
}

// Asignación de botones
startButton.onclick = iniciarSistema;
stopButton.onclick = detenerSistema;
btnDescribir.onclick = activarDescripcion;
btnNoDescribir.onclick = desactivarDescripcion;

// Inicialización de modelo
(async () => {
    try {
        statusElem.textContent = "CARGANDO MAX-22...";
        let i = 0;
        while (typeof cocoSsd === 'undefined' && i < 20) {
            await new Promise(r => setTimeout(r, 500));
            i++;
        }
        model = await cocoSsd.load();
        statusElem.textContent = "SISTEMA MAX-22 LISTO";
        startButton.disabled = false;
    } catch (e) { statusElem.textContent = "ERROR DE MOTOR"; }
})();