const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusElem = document.getElementById('status');

let model, streaming = false, localStream = null;
let objetosYaAnunciados = new Set();
let alarmaActiva = false;

// PARÁMETROS DE DISTANCIA (MAX-6 / V5-N)
const ALTURAS_REALES = { 
    "person": 1.7, "chair": 0.9, "cell phone": 0.15, 
    "bottle": 0.25, "laptop": 0.25, "car": 1.5, "dog": 0.5,
    "knife": 0.20, "handgun": 0.18, "backpack": 0.45
};
const FOCAL_LENGTH = 600;

const AMENAZAS = {
    "knife": "CUCHILLO",
    "scissors": "OBJETO PUNZANTE",
    "baseball bat": "PALO O BATE",
    "handgun": "PISTOLA",
    "hammer": "MARTILLO"
};

const TRADUCCIONES = {
    "person": "persona", "cell phone": "celular", "bottle": "botella", 
    "backpack": "mochila", "cup": "taza", "chair": "silla", "laptop": "computadora",
    "dog": "perro", "cat": "gato"
};

// Pitido de precaución
function sonarPitido() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(700, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.1);
}

function calcularDistancia(alturaPixels, clase) {
    const alturaReal = ALTURAS_REALES[clase] || 0.5;
    return (alturaReal * FOCAL_LENGTH) / alturaPixels;
}

function sonarAlarma() {
    if (alarmaActiva) return;
    alarmaActiva = true;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const duration = 10; 
    const startTime = audioCtx.currentTime;
    const interval = setInterval(() => {
        if (audioCtx.currentTime - startTime > duration) {
            clearInterval(interval);
            alarmaActiva = false;
            return;
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(950, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    }, 300);
}

function hablar(texto, urgente = false) {
    if (urgente) window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = urgente ? 1.3 : 1.1;
    window.speechSynthesis.speak(msg);
}

function detectarEmpuñadura(persona, todasPreds) {
    const [px, py, pw, ph] = persona.bbox;
    // Zona de interacción (manos/torso)
    const zX = px - (pw * 0.2);
    const zY = py + (ph * 0.2);
    const zW = pw * 1.4;
    const zH = ph * 0.7;

    let objetoEnMano = null;
    todasPreds.forEach(obj => {
        if (obj.class !== "person" && obj.score > 0.3) {
            const [ox, oy, ow, oh] = obj.bbox;
            const cX = ox + ow / 2;
            const cY = oy + oh / 2;

            if (cX > zX && cX < (zX + zW) && cY > zY && cY < (zY + zH)) {
                objetoEnMano = obj;
                // Dibujo visual del objeto en mano
                ctx.strokeStyle = AMENAZAS[obj.class] ? "#ff0000" : "#ffff00";
                ctx.lineWidth = 4;
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

        preds.forEach(p => {
            if (p.score > 0.5) {
                const [x, y, w, h] = p.bbox;
                const nombreTraducido = TRADUCCIONES[p.class] || AMENAZAS[p.class] || p.class;
                const dist = calcularDistancia(h, p.class).toFixed(1);

                // LÓGICA DE VOZ
                if (p.class === "person") {
                    const mano = detectarEmpuñadura(p, preds);
                    const idVoz = mano ? `MANO-${mano.class}` : `PER-${p.class}`;

                    if (!objetosYaAnunciados.has(idVoz)) {
                        if (mano) {
                            const nObj = AMENAZAS[mano.class] || TRADUCCIONES[mano.class] || "objeto";
                            sonarPitido();
                            if (AMENAZAS[mano.class]) {
                                sonarAlarma();
                                hablar(`Precaución. Alerta, trae un ${nObj} en las manos`, true);
                            } else {
                                hablar(`Precaución. Trae un ${nObj} en las manos`);
                            }
                        } else {
                            hablar(`Persona a ${dist} metros`);
                        }
                        objetosYaAnunciados.add(idVoz);
                        setTimeout(() => objetosYaAnunciados.delete(idVoz), 8000);
                    }
                } else if (!AMENAZAS[p.class]) {
                    // Detección de objetos generales (Silla, botella, etc.)
                    if (!objetosYaAnunciados.has(p.class)) {
                        hablar(`${nombreTraducido} a ${dist} metros`);
                        objetosYaAnunciados.add(p.class);
                        setTimeout(() => objetosYaAnunciados.delete(p.class), 12000);
                    }
                }

                // UI Visual
                ctx.strokeStyle = AMENAZAS[p.class] ? "#ff0000" : "#00ff00";
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = ctx.strokeStyle;
                ctx.fillText(`${nombreTraducido.toUpperCase()} ${dist}m`, x, y - 5);
            }
        });
    } catch (e) {}
    requestAnimationFrame(predict);
}

// Inicialización MAX-15
(async () => {
    try {
        statusElem.textContent = "CARGANDO IA MAX-16...";
        let i = 0;
        while (typeof cocoSsd === 'undefined' && i < 20) {
            await new Promise(r => setTimeout(r, 500));
            i++;
        }
        model = await cocoSsd.load();
        statusElem.textContent = "SISTEMA LISTO";
        startButton.disabled = false;
    } catch (e) { statusElem.textContent = "ERROR DE MOTOR"; }
})();

startButton.onclick = async () => {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = localStream;
    video.play();
    streaming = true;
    startButton.disabled = true;
    stopButton.disabled = false;
    hablar("Sistema iniciado");
    video.onloadedmetadata = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        predict();
    };
};

stopButton.onclick = () => {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    alarmaActiva = false;
    hablar("Sistema detenido");
};