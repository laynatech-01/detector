const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusElem = document.getElementById('status');

let model, streaming = false, localStream = null;
let objetosYaAnunciados = new Set();
let alarmaActiva = false;

// LISTA DE AMENAZAS MAX-13
const AMENAZAS = {
    "knife": "CUCHILLO",
    "scissors": "OBJETO PUNZANTE",
    "baseball bat": "PALO O BATE",
    "handgun": "PISTOLA",
    "hammer": "MARTILLO",
    "umbrella": "OBJETO ALARGADO"
};

// FUNCIÓN DE ALARMA (10 SEGUNDOS)
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
        // Pitido de alerta
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square'; // Sonido más agresivo de alarma
        osc.frequency.setValueAtTime(900, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
    }, 250);
}

function hablar(texto, urgente = false) {
    if (urgente) window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.pitch = 0.8; // Estilo Jarvis
    msg.rate = urgente ? 1.3 : 1.0;
    window.speechSynthesis.speak(msg);
}

// LÓGICA DE SEGUIMIENTO DINÁMICO
function analizarManosMAX13(persona, todasPreds) {
    const [px, py, pw, ph] = persona.bbox;
    
    // Zona dinámica de empuñadura (torso y brazos)
    const zX = px - (pw * 0.2);
    const zY = py + (ph * 0.25);
    const zW = pw * 1.4;
    const zH = ph * 0.7;

    let hallazgo = null;

    todasPreds.forEach(obj => {
        if (obj.class !== "person" && obj.score > 0.3) {
            const [ox, oy, ow, oh] = obj.bbox;
            const cX = ox + ow / 2;
            const cY = oy + oh / 2;

            if (cX > zX && cX < (zX + zW) && cY > zY && cY < (zY + zH)) {
                // Verificar forma alargada (Relación de aspecto)
                const esAlargado = (oh > ow * 2.5) || (ow > oh * 2.5);
                const esAmenaza = AMENAZAS[obj.class] || esAlargado;
                
                hallazgo = obj;
                hallazgo.esPeligroso = !!esAmenaza;

                // ENCUADRE DINÁMICO: Sigue el objeto
                ctx.strokeStyle = esAmenaza ? "#ff0000" : "#ffff00"; 
                ctx.lineWidth = esAmenaza ? 6 : 2;
                ctx.strokeRect(ox, oy, ow, oh);
                
                ctx.fillStyle = ctx.strokeStyle;
                ctx.font = "bold 14px Arial";
                ctx.fillText(esAmenaza ? "AMENAZA DETECTADA" : "OBJETO EN MANO", ox, oy - 10);
            }
        }
    });
    return hallazgo;
}

async function predict() {
    if (!streaming) return;
    try {
        const preds = await model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        preds.forEach(p => {
            if (p.score > 0.5) {
                const [x, y, w, h] = p.bbox;
                if (p.class === "person") {
                    const obj = analizarManosMAX13(p, preds);
                    
                    if (obj && obj.esPeligroso) {
                        const nombre = AMENAZAS[obj.class] || "OBJETO ALARGADO";
                        if (!objetosYaAnunciados.has(`AM-${obj.class}`)) {
                            sonarAlarma();
                            hablar(`${nombre}. Amenaza detectada.`, true);
                            objetosYaAnunciados.add(`AM-${obj.class}`);
                            setTimeout(() => objetosYaAnunciados.delete(`AM-${obj.class}`), 10000);
                        }
                    }
                    // Persona en cuadro verde base
                    ctx.strokeStyle = "#00ff00";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, w, h);
                }
            }
        });
    } catch (e) { console.error(e); }
    requestAnimationFrame(predict);
}

(async () => {
    try {
        statusElem.textContent = "INICIANDO MOTOR MAX-13...";
        let check = 0;
        while (typeof cocoSsd === 'undefined' && check < 30) {
            await new Promise(r => setTimeout(r, 500));
            check++;
        }
        model = await cocoSsd.load();
        statusElem.textContent = "VERSIÓN MAX-13 LISTA";
        startButton.disabled = false;
    } catch (e) { statusElem.textContent = "ERROR MOTOR"; }
})();

startButton.onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        hablar("Sistemas MAX-13 activos.");
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            predict();
        };
    } catch (e) { statusElem.textContent = "Error Cámara"; }
};

stopButton.onclick = () => {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
};