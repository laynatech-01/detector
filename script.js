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
let modoDescripcion = true; 

// Variables de Control
let manosOcupadas = false;
let ultimoMomentoConObjeto = 0;
let lastBeepTime = 0;
const TIEMPO_ESPERA_RESTABLECER = 10000; 
const FOCAL_LENGTH = 600;

// Lógica de Conteo y Estabilidad
let cantidadPersonasPrevia = -1; 
let conteoEstablecido = 0;
let tiempoInicioEstabilidad = 0;

const ALTURAS_REALES = { "person": 1.7, "chair": 0.9, "cell phone": 0.15, "bottle": 0.25, "knife": 0.20 };

const TRADUCCIONES = {
    "person": "persona", "bicycle": "bicicleta", "car": "carro", "motorcycle": "moto",
    "airplane": "avión", "bus": "bus", "train": "tren", "truck": "camión", "boat": "barco",
    "traffic light": "semáforo", "fire hydrant": "hidrante", "stop sign": "señal de pare",
    "parking meter": "parquímetro", "bench": "banca", "bird": "pájaro", "cat": "gato",
    "dog": "perro", "horse": "caballo", "sheep": "oveja", "cow": "vaca", "elephant": "elefante",
    "bear": "oso", "zebra": "cebra", "giraffe": "jirafa", "backpack": "mochila",
    "umbrella": "paraguas", "handbag": "bolso", "tie": "corbata", "suitcase": "maleta",
    "frisbee": "frisbee", "skis": "esquís", "snowboard": "snowboard", "sports ball": "pelota",
    "kite": "cometa", "baseball bat": "bate de béisbol", "baseball glove": "guante de béisbol",
    "skateboard": "patineta", "surfboard": "tabla de surf", "tennis racket": "raqueta de tenis",
    "bottle": "botella", "wine glass": "copa de vino", "cup": "taza", "fork": "tenedor",
    "knife": "cuchillo", "spoon": "cuchara", "bowl": "tazón", "banana": "plátano",
    "apple": "manzana", "sandwich": "sándwich", "orange": "naranja", "broccoli": "brócoli",
    "carrot": "zanahoria", "hot dog": "hot dog", "pizza": "pizza", "donut": "dona",
    "cake": "pastel", "chair": "silla", "couch": "sofá", "potted plant": "planta",
    "bed": "cama", "dining table": "mesa", "toilet": "inodoro", "tv": "televisión",
    "laptop": "computadora", "mouse": "mouse", "remote": "control remoto", "keyboard": "teclado",
    "cell phone": "celular", "microwave": "microondas", "oven": "horno", "toaster": "tostadora",
    "sink": "lavabo", "refrigerator": "refrigerador", "book": "libro", "clock": "reloj",
    "vase": "florero", "scissors": "tijeras", "teddy bear": "oso de peluche",
    "hair drier": "secador de pelo", "toothbrush": "cepillo de dientes"
};

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
    if (!modoDescripcion && !urgente) return;
    if (urgente) window.speechSynthesis.cancel();
    inputText.value = texto; 
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = urgente ? 1.3 : 1.1;
    window.speechSynthesis.speak(msg);
}

// Función para buscar objetos cerca de las manos de una persona
function obtenerObjetoEnMano(persona, todasPreds) {
    const [px, py, pw, ph] = persona.bbox;
    // Zona de interés: mitad superior y un poco más ancha que el torso
    const zX = px - (pw * 0.2), zY = py + (ph * 0.2);
    const zW = pw * 1.4, zH = ph * 0.7;

    return todasPreds.find(obj => {
        if (obj.class === "person" || obj.score < 0.3) return false;
        const [ox, oy, ow, oh] = obj.bbox;
        const cX = ox + ow / 2, cY = oy + oh / 2;
        return (cX > zX && cX < (zX + zW) && cY > zY && cY < (zY + zH));
    });
}

async function predict() {
    if (!streaming) return;
    try {
        const preds = await model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const ahora = Date.now();
        
        let conteoFrameActual = 0; 
        let masCercanoDist = 999;
        let amenazaDetectadaEnEsteFrame = false;

        preds.forEach(p => {
            if (p.score > 0.5 && p.class === "person") {
                conteoFrameActual++;
                const [x, y, w, h] = p.bbox;
                const dist = parseFloat(((1.7 * FOCAL_LENGTH) / h).toFixed(1));
                if (dist < masCercanoDist) masCercanoDist = dist;

                // Dibujar Persona (Verde)
                ctx.strokeStyle = "#00ff00";
                ctx.lineWidth = 2;
                ctx.strokeRect(x, y, w, h);
                ctx.fillStyle = "#00ff00";
                ctx.fillText(`${dist}m`, x, y - 5);

                // Comprobar Objeto en Mano
                const objetoMano = obtenerObjetoEnMano(p, preds);
                if (objetoMano) {
                    amenazaDetectadaEnEsteFrame = true;
                    manosOcupadas = true;
                    ultimoMomentoConObjeto = ahora;

                    // DIBUJAR RECUADRO AMARILLO (Corregido)
                    ctx.strokeStyle = "#ffff00";
                    ctx.lineWidth = 6;
                    ctx.strokeRect(...objetoMano.bbox);

                    if (ahora - lastBeepTime > 1100) { sonarPitidoUnSegundo(); lastBeepTime = ahora; }
                    if (!objetosYaAnunciados.has("ALERTA_MANOS")) {
                        hablar("ALERTA: Objeto detectado en manos", true);
                        objetosYaAnunciados.add("ALERTA_MANOS");
                    }
                }
            }
        });

        // Lógica de Conteo Estable
        if (conteoFrameActual !== cantidadPersonasPrevia) {
            if (conteoFrameActual !== conteoEstablecido) {
                conteoEstablecido = conteoFrameActual;
                tiempoInicioEstabilidad = ahora;
            } else if (ahora - tiempoInicioEstabilidad > 2000) {
                let mensaje = "";
                if (conteoFrameActual === 0) mensaje = "Ya no detecto personas";
                else if (conteoFrameActual === 1) mensaje = `Una persona detectada a ${masCercanoDist} metros`;
                else mensaje = `${conteoFrameActual} personas. La más cercana a ${masCercanoDist} metros`;
                
                hablar(mensaje);
                cantidadPersonasPrevia = conteoFrameActual;
            }
        }

        ctx.fillStyle = "#00ff00";
        ctx.font = "bold 20px Segoe UI";
        ctx.fillText(`PERSONAS: ${conteoFrameActual}`, 10, 30);

        // Restablecer estado de manos si no hay amenazas por 10 seg
        if (!amenazaDetectadaEnEsteFrame && manosOcupadas && (ahora - ultimoMomentoConObjeto > TIEMPO_ESPERA_RESTABLECER)) {
            manosOcupadas = false;
            objetosYaAnunciados.delete("ALERTA_MANOS");
        }

        // Descripción de otros objetos (Solo si no hay manos ocupadas)
        if (!manosOcupadas) {
            preds.forEach(p => {
                if (p.score > 0.5 && p.class !== "person") {
                    if (!objetosYaAnunciados.has(p.class)) {
                        const d = ((ALTURAS_REALES[p.class] || 0.5) * FOCAL_LENGTH / p.bbox[3]).toFixed(1);
                        hablar(`${TRADUCCIONES[p.class] || p.class} a ${d} metros`);
                        objetosYaAnunciados.add(p.class);
                        setTimeout(() => objetosYaAnunciados.delete(p.class), 15000);
                    }
                    ctx.strokeStyle = "#00ff00";
                    ctx.lineWidth = 1;
                    ctx.strokeRect(...p.bbox);
                }
            });
        }
    } catch (e) { console.error(e); }
    requestAnimationFrame(predict);
}

// Comandos de voz y Control (Idénticos)
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const recognition = new Recognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.onresult = (e) => {
        const cmd = e.results[e.results.length - 1][0].transcript.toLowerCase();
        if (cmd.includes("activar sistema")) iniciarSistema();
        if (cmd.includes("desactivar sistema")) detenerSistema();
        if (cmd.includes("describir")) activarDescripcion();
        if (cmd.includes("no describir")) desactivarDescripcion();
    };
    recognition.start();
}

async function iniciarSistema() {
    localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = localStream;
    video.play();
    streaming = true;
    startButton.disabled = true; stopButton.disabled = false;
    hablar("MAX-29 Activa", true);
    video.onloadedmetadata = () => { canvas.width = video.videoWidth; canvas.height = video.videoHeight; predict(); };
}

function detenerSistema() {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false; stopButton.disabled = true;
    hablar("MAX-29 Apagada", true);
}

function activarDescripcion() { modoDescripcion = true; hablar("Descripción activa"); }
function desactivarDescripcion() { hablar("Descripción desactivada"); setTimeout(() => modoDescripcion = false, 1000); }

startButton.onclick = iniciarSistema;
stopButton.onclick = detenerSistema;
btnDescribir.onclick = activarDescripcion;
btnNoDescribir.onclick = desactivarDescripcion;

(async () => {
    try {
        statusElem.textContent = "INICIALIZANDO MAX-29...";
        model = await cocoSsd.load();
        statusElem.textContent = "MAX-29 LISTO";
        startButton.disabled = false;
    } catch (e) { statusElem.textContent = "ERROR MOTOR"; }
})();