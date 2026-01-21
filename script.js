// --- CONFIGURACIÓN DE VERSIÓN ---
const VERSION_ROBOT = "5B-YOLO";

const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const inputText = document.getElementById('inputText');
const statusElem = document.getElementById('status');
const voiceInd = document.getElementById('voice-indicator');

let model, streaming = false, localStream = null;
let objetosYaAnunciados = new Set();

// DICCIONARIO YOLO EXTENDIDO (Español)
const traducciones = {
    "person": "persona", "bicycle": "bicicleta", "car": "vehículo", "motorcycle": "moto",
    "airplane": "avión", "bus": "autobús", "train": "tren", "truck": "camión", "boat": "barco",
    "traffic light": "semáforo", "fire hydrant": "hidrante", "stop sign": "alto",
    "parking meter": "parquímetro", "bench": "banca", "bird": "pájaro", "cat": "gato",
    "dog": "perro", "horse": "caballo", "sheep": "oveja", "cow": "vaca", "elephant": "elefante",
    "bear": "oso", "zebra": "cebra", "giraffe": "jirafa", "backpack": "mochila",
    "umbrella": "paraguas", "handbag": "bolso", "tie": "corbata", "suitcase": "maleta",
    "frisbee": "disco", "skis": "esquís", "snowboard": "tabla de nieve", "sports ball": "pelota",
    "kite": "cometa", "baseball bat": "bate", "baseball glove": "guante", "skateboard": "patineta",
    "surfboard": "tabla de surf", "tennis racket": "raqueta", "bottle": "botella", "wine glass": "copa",
    "cup": "taza", "fork": "tenedor", "knife": "cuchillo", "spoon": "cuchara", "bowl": "tazón",
    "banana": "plátano", "apple": "manzana", "sandwich": "sándwich", "orange": "naranja",
    "broccoli": "brócoli", "carrot": "zanahoria", "hot dog": "hot dog", "pizza": "pizza",
    "donut": "dona", "cake": "pastel", "chair": "silla", "couch": "sofá", "potted plant": "planta",
    "bed": "cama", "dining table": "mesa", "toilet": "inodoro", "tv": "televisión",
    "laptop": "computadora", "mouse": "ratón", "remote": "control", "keyboard": "teclado",
    "cell phone": "celular", "microwave": "microondas", "oven": "horno", "toaster": "tostadora",
    "sink": "fregadero", "refrigerator": "refrigerador", "book": "libro", "clock": "reloj",
    "vase": "florero", "scissors": "tijeras", "teddy bear": "peluche", "hair drier": "secadora",
    "toothbrush": "cepillo"
};

// --- SISTEMA DE VOZ ---
function hablar(texto) {
    if (!texto) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = 1.1; // Un poco más rápido para YOLO
    window.speechSynthesis.speak(msg);
}

// --- RECONOCIMIENTO DE VOZ (INICIAR/DETENER) ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (event) => {
        let textoEscuchado = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
            textoEscuchado += event.results[i][0].transcript;
        }
        inputText.value = textoEscuchado;
        const comando = textoEscuchado.toLowerCase();

        if (event.results[event.results.length - 1].isFinal) {
            if (comando.includes("iniciar sistema")) start();
            else if (comando.includes("detener sistema")) stop();
        }
    };
    rec.onend = () => { if(streaming) rec.start(); };
    document.body.addEventListener('click', () => { 
        rec.start(); 
        hablar("Escuchando comandos de voz"); 
    }, { once: true });
}

// --- FUNCIONES DE CÁMARA ---
async function start() {
    if (streaming) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            hablar("Visión YOLO activada");
            predict();
        };
    } catch (e) { statusElem.textContent = "Error de cámara."; }
}

function stop() {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(track => track.stop());
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    objetosYaAnunciados.clear();
    hablar("Sistema detenido");
}

// --- BUCLE DE DETECCIÓN YOLO ---
async function predict() {
    if (!streaming) return;
    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    predictions.forEach(p => {
        // YOLO es más preciso, subimos el umbral a 0.55
        if (p.score > 0.55) {
            const nombreEsp = traducciones[p.class] || p.class;
            const [x, y, w, h] = p.bbox;

            // Dibujo de marco tecnológico
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 3;
            ctx.setLineDash([5, 5]); // Línea punteada tipo radar
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]); // Reset para el texto
            
            ctx.fillStyle = "#00ff00";
            ctx.font = "bold 16px monospace";
            ctx.fillText(`[ ${nombreEsp.toUpperCase()} ]`, x, y > 20 ? y - 10 : 20);

            if (!objetosYaAnunciados.has(p.class)) {
                hablar(`Localizado: ${nombreEsp}`);
                objetosYaAnunciados.add(p.class);
                // Memoria de 10 segundos para no saturar
                setTimeout(() => { objetosYaAnunciados.delete(p.class); }, 10000);
            }
        }
    });
    requestAnimationFrame(predict);
}

// --- CARGA DEL MODELO ---
(async () => {
    try {
        statusElem.textContent = "Cargando motor YOLOv8...";
        // Nota: COCO-SSD usa la base de YOLO para web
        model = await cocoSsd.load({ base: 'mobilenet_v2' }); 
        statusElem.textContent = `V${VERSION_ROBOT} ONLINE.`;
    } catch (e) { statusElem.textContent = "Error de motor."; }
})();

startButton.onclick = start;
stopButton.onclick = stop;