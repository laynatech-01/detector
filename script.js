const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusElem = document.getElementById('status');

let model, streaming = false, localStream = null;
let objetosYaAnunciados = new Set();
let alarmaActiva = false;

// CONFIGURACIÓN DE AMENAZAS CRÍTICAS
const AMENAZAS = {
    "knife": "CUCHILLO",
    "scissors": "OBJETO PUNZANTE",
    "baseball bat": "PALO O BATE",
    "handgun": "PISTOLA",
    "umbrella": "PARAGUAS",
    "hammer": "MARTILLO"
};

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
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
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
    msg.pitch = 0.8; 
    msg.rate = urgente ? 1.3 : 1.1;
    window.speechSynthesis.speak(msg);
}

// FUNCIÓN MAX-15: Detección de mano sujetando cualquier objeto
function detectarEmpuñadura(persona, todasPreds) {
    const [px, py, pw, ph] = persona.bbox;
    // Zona de manos: Enfoque dinámico en brazos y torso inferior
    const zX = px - (pw * 0.2);
    const zY = py + (ph * 0.3);
    const zW = pw * 1.4;
    const zH = ph * 0.6;

    let objetoSujetado = null;
    
    todasPreds.forEach(obj => {
        // Ignoramos a la persona misma en la búsqueda de objetos
        if (obj.class !== "person" && obj.score > 0.3) {
            const [ox, oy, ow, oh] = obj.bbox;
            const cX = ox + ow / 2;
            const cY = oy + oh / 2;

            // Verificamos si el centro del objeto está en la zona de las manos
            if (cX > zX && cX < (zX + zW) && cY > zY && cY < (zY + zH)) {
                objetoSujetado = obj;
                
                const esAmenazaDirecta = AMENAZAS[obj.class];
                const ratio = Math.max(oh/ow, ow/oh);
                const esAlargado = (ratio > 1.8);

                // Protocolo visual: Rojo para amenazas/alargados, Amarillo para cualquier otro objeto
                ctx.strokeStyle = (esAmenazaDirecta || esAlargado) ? "#ff0000" : "#ffff00";
                ctx.lineWidth = (esAmenazaDirecta || esAlargado) ? 6 : 3;
                ctx.strokeRect(ox, oy, ow, oh);
                
                ctx.fillStyle = ctx.strokeStyle;
                ctx.font = "bold 14px Arial";
                ctx.fillText("EMPUÑADURA DETECTADA", ox, oy - 10);
            }
        }
    });
    return objetoSujetado;
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
                    const objeto = detectarEmpuñadura(p, preds);
                    
                    if (objeto) {
                        // Si se detecta cualquier objeto en la mano, se activa el aviso
                        if (!objetosYaAnunciados.has(`EMP-${objeto.class}`)) {
                            sonarAlarma();
                            hablar("Precaución, empuñadura de objeto.", true);
                            
                            // Registramos para evitar repetición inmediata
                            objetosYaAnunciados.add(`EMP-${objeto.class}`);
                            setTimeout(() => objetosYaAnunciados.delete(`EMP-${objeto.class}`), 8000);
                        }
                    }

                    // Cuadro de persona
                    ctx.strokeStyle = "#00ff00";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(x, y, w, h);
                }
            }
        });
    } catch (e) {}
    requestAnimationFrame(predict);
}

(async () => {
    try {
        statusElem.textContent = "INICIALIZANDO MAX-15...";
        let check = 0;
        while (typeof cocoSsd === 'undefined' && check < 30) {
            await new Promise(r => setTimeout(r, 500));
            check++;
        }
        model = await cocoSsd.load();
        statusElem.textContent = "SISTEMA MAX-15 LISTO";
        startButton.disabled = false;
    } catch (e) { statusElem.textContent = "ERROR DE CARGA"; }
})();

startButton.onclick = async () => {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        hablar("Sistema de seguridad MAX 15 activo.");
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            predict();
        };
    } catch (e) { statusElem.textContent = "Error de cámara"; }
};

stopButton.onclick = () => {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
};