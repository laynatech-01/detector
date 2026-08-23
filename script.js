const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const btnDescribir = document.getElementById('btnDescribir');
const btnNoDescribir = document.getElementById('btnNoDescribir');
const inputText = document.getElementById('inputText');
const statusElem = document.getElementById('status');

let model = null;
let streaming = false;
let localStream = null;
let esperandoUsuarioVoz = false;
const USUARIO_CLAVE = "tango";

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

function hablar(texto, urgente = false) {
    if (urgente) window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = urgente ? 1.3 : 1.1;
    window.speechSynthesis.speak(msg);
}

// 1. RECONOCIMIENTO DE VOZ CONTINUO (SIEMPRE ACTIVO EN PRIMER PLANO)
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;

if (Recognition) {
    recognition = new Recognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
        let textoEnTiempoReal = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            textoEnTiempoReal += e.results[i][0].transcript;
        }

        // Muestra en todo momento lo que escucha en el cuadro de texto
        if (inputText && textoEnTiempoReal.trim() !== "") {
            inputText.value = textoEnTiempoReal;
        }

        const cmd = textoEnTiempoReal.toLowerCase().trim();

        // Autenticación por clave de acceso
        if (esperandoUsuarioVoz) {
            if (cmd.includes(USUARIO_CLAVE)) {
                esperandoUsuarioVoz = false;
                iniciarCamaraPasoUnico();
            }
            return;
        }

        // Detección bajo demanda
        if (cmd.includes("fx detectar")) {
            ejecutarDeteccionPuntual();
            if (inputText) inputText.value = "";
        } else if (cmd.includes("fx no detectar")) {
            apagarCamara();
            hablar("Detección desactivada", true);
            if (inputText) inputText.value = "";
        } else if (cmd.includes("fx1 desactivar")) {
            apagarCamara();
            esperandoUsuarioVoz = false;
            hablar("sistema fx1 desactivado", true);
        }
    };

    // Reenganche automático permanente
    recognition.onend = () => {
        setTimeout(() => {
            try { recognition.start(); } catch(e) {}
        }, 100);
    };

    try { recognition.start(); } catch(e) {}
}

// 2. DETECCIÓN A PETICIÓN (Captura imagen, detecta objeto, habla y apaga)
async function ejecutarDeteccionPuntual() {
    if (!model) return;

    try {
        // Enciende la cámara únicamente si no estaba previamente lista
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            video.srcObject = localStream;
            await video.play();
        }

        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        // Analiza un único frame de video
        const preds = await model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const detectados = preds.filter(p => p.score > 0.5);

        if (detectados.length === 0) {
            hablar("No detecto ningún objeto", true);
        } else {
            let objetosNombres = [];
            detectados.forEach(p => {
                const nombreES = TRADUCCIONES[p.class] || p.class;
                objetosNombres.push(nombreES);
                ctx.strokeStyle = "#00ff00";
                ctx.lineWidth = 3;
                ctx.strokeRect(...p.bbox);
                ctx.fillStyle = "#00ff00";
                ctx.fillText(nombreES, p.bbox[0], p.bbox[1] - 5);
            });

            const unicos = [...new Set(objetosNombres)];
            const mensaje = unicos.length === 1 
                ? `Detecto ${unicos[0]}` 
                : `Detecto ${unicos.join(", ")}`;

            hablar(mensaje, true);
        }
    } catch (e) {
        console.error("Error al procesar la imagen:", e);
    }
}

async function iniciarCamaraPasoUnico() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        await video.play();
        streaming = true;
        startButton.disabled = true; 
        stopButton.disabled = false;
        hablar("fx1 activado", true);
    } catch (e) {
        alert("Error al acceder a la cámara: " + e.message);
    }
}

function apagarCamara() {
    streaming = false;
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    video.srcObject = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    startButton.disabled = false; 
    stopButton.disabled = true;
}

function solicitarClaveVoz() {
    esperandoUsuarioVoz = true;
    hablar("sistema fx1 listo, indique su clave", true);
}

startButton.onclick = solicitarClaveVoz;
stopButton.onclick = () => { apagarCamara(); hablar("sistema fx1 desactivado", true); };
btnDescribir.onclick = ejecutarDeteccionPuntual;
btnNoDescribir.onclick = apagarCamara;

// 3. SECUENCIA INICIAL DE CARGA
(async () => {
    try {
        hablar("iniciando sistema fx1", true);
        statusElem.textContent = "INICIANDO SISTEMA FX1...";

        model = await cocoSsd.load();

        statusElem.textContent = "SISTEMA FX1 LISTO";
        startButton.disabled = false;

        solicitarClaveVoz();
    } catch (e) { 
        statusElem.textContent = "ERROR MOTOR"; 
    }
})();
