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
let modoDescripcion = false; // Desactivado por defecto para dar prioridad a la escucha

// Estado para autenticación por voz
let esperandoUsuarioVoz = false;
const USUARIO_CLAVE = "tango";

// Control de prioridad del micrófono y escuchas activas
let usuarioHablando = false;
let timeoutHablando = null;

// Variables para puente de audio del manos libres
let audioContext = null;
let micSource = null;

// Variables de Control
let manosOcupadas = false;
let ultimoMomentoConObjeto = 0;
let lastBeepTime = 0;
const TIEMPO_ESPERA_RESTABLECER = 10000; 
const FOCAL_LENGTH = 600;

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

// Ejecuta una sola lectura bajo demanda al escuchar "fx detectar"
async function ejecutarDeteccionUnica() {
    if (!streaming || !model) return;
    try {
        const preds = await model.detect(video);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        const detectados = preds.filter(p => p.score > 0.5);
        if (detectados.length === 0) {
            hablar("No detecto ningún objeto en este momento", true);
            return;
        }

        let objetosNombres = [];
        detectados.forEach(p => {
            const nombreES = TRADUCCIONES[p.class] || p.class;
            objetosNombres.push(nombreES);
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 2;
            ctx.strokeRect(...p.bbox);
            ctx.fillStyle = "#00ff00";
            ctx.fillText(nombreES, p.bbox[0], p.bbox[1] - 5);
        });

        // Elimina duplicados para el anuncio hablado
        const unicos = [...new Set(objetosNombres)];
        const mensaje = unicos.length === 1 
            ? `Detecto: ${unicos[0]}` 
            : `Detecto los siguientes objetos: ${unicos.join(", ")}`;

        hablar(mensaje, true);
    } catch (e) {
        console.error("Error en detección:", e);
    }
}

async function predict() {
    if (!streaming) return;
    // Bucle pasivo que mantiene el flujo del canvas sin emitir audios automáticos
    if (modoDescripcion) {
        try {
            const preds = await model.detect(video);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            preds.forEach(p => {
                if (p.score > 0.5) {
                    ctx.strokeStyle = "#00ff00";
                    ctx.lineWidth = 2;
                    ctx.strokeRect(...p.bbox);
                }
            });
        } catch (e) {}
    }
    requestAnimationFrame(predict);
}

// Reconocimiento de voz continuo
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const recognition = new Recognition();
    recognition.lang = 'es-ES';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e) => {
        let textoEnTiempoReal = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
            textoEnTiempoReal += e.results[i][0].transcript;
        }

        // Muestra en pantalla todo lo que el micrófono escucha
        if (inputText) {
            inputText.value = textoEnTiempoReal;
        }

        const cmd = textoEnTiempoReal.toLowerCase().trim();

        // Modo verificación de clave por voz
        if (esperandoUsuarioVoz) {
            if (cmd.includes(USUARIO_CLAVE)) {
                esperandoUsuarioVoz = false;
                ejecutarArranqueSistema();
            }
            return;
        }

        // Reconocimiento de comandos
        if (cmd.includes("fx detectar")) {
            ejecutarDeteccionUnica();
            if (inputText) inputText.value = ""; // Limpia la entrada tras ejecutar
        } else if (cmd.includes("fx1 desactivar")) {
            detenerSistema();
        }
    };

    recognition.onend = () => {
        setTimeout(() => {
            try { recognition.start(); } catch(e) {}
        }, 300);
    };

    recognition.start();
}

function solicitarUsuarioVoz() {
    if (streaming) return;
    esperandoUsuarioVoz = true;
    hablar("sistema fx1, indique su clave de acceso", true);
}

async function ejecutarArranqueSistema() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "environment" },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });

        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } else if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }

        micSource = audioContext.createMediaStreamSource(localStream);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0; 
        micSource.connect(gainNode);
        gainNode.connect(audioContext.destination);

        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true; stopButton.disabled = false;
        
        hablar("fx1 activado", true);
        video.onloadedmetadata = () => { 
            canvas.width = video.videoWidth; 
            canvas.height = video.videoHeight; 
            predict(); 
        };
    } catch (e) {
        alert("Error al iniciar cámara o micrófono: " + e.message);
    }
}

function detenerSistema() {
    streaming = false;
    esperandoUsuarioVoz = false;
    modoDescripcion = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.suspend();
    }
    video.srcObject = null;
    startButton.disabled = false; stopButton.disabled = true;
    hablar("sistema fx1 desactivado", true);
}

startButton.onclick = solicitarUsuarioVoz;
stopButton.onclick = detenerSistema;
btnDescribir.onclick = () => { modoDescripcion = true; hablar("Detección continua activa"); };
btnNoDescribir.onclick = () => { modoDescripcion = false; hablar("Detección continua desactivada"); };

(async () => {
    try {
        statusElem.textContent = "INICIALIZANDO VISIÓN FX1...";
        model = await cocoSsd.load();
        statusElem.textContent = "SISTEMA FX1 LISTO";
        startButton.disabled = false;
        
        // Ejecución inmediata al cargar la página
        solicitarUsuarioVoz();
    } catch (e) { statusElem.textContent = "ERROR MOTOR"; }
})();
