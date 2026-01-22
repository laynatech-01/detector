const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const inputText = document.getElementById('inputText');
const statusElem = document.getElementById('status');

let model, streaming = false, localStream = null;
let objetosYaAnunciados = new Set();
let modoDescripcion = false; 

// --- CONFIGURACIÓN TÉCNICA ---
const ALTURAS_REALES = { "person": 1.7, "chair": 0.9, "cell phone": 0.15, "bottle": 0.25, "laptop": 0.25 };
const FOCAL_LENGTH = 600;

const traducciones = {
    "person": "persona", "bicycle": "bicicleta", "car": "carro", "motorcycle": "moto",
    "dog": "perro", "cat": "gato", "chair": "silla", "bottle": "botella", "cup": "taza",
    "cell phone": "celular", "laptop": "computadora", "remote": "control"
};

// --- CONTROL DE VOZ (SALIDA) ---
function hablar(texto) {
    if (window.speechSynthesis.speaking) window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    window.speechSynthesis.speak(msg);
}

// --- MOTOR DE COLOR ULTRA-CALIBRADO (V5-J) ---
function analizarColorTono(r, g, b) {
    const brillo = (r + g + b) / 3;
    
    // CALIBRACIÓN DE NEGRO: Bajamos el umbral de 25 a 15.
    // Esto evita que el azul marino sea confundido con negro.
    if (brillo < 15) return "negro fuerte";
    
    if (brillo > 235) return "blanco claro";

    let base = "";
    
    // FILTRO DE RESCATE DE AZULES:
    // Comparamos el canal azul contra el rojo y verde. 
    // Si el azul es dominante aunque sea por poco, lo priorizamos.
    if (b > r * 1.05 && b > g * 1.05) {
        base = "azul";
    } 
    else if (r > g * 1.2 && r > b * 1.2) {
        base = "rojo";
    } 
    else if (g > r * 1.1 && g > b * 1.1) {
        base = "verde";
    } 
    else if (r > 130 && g > 130 && b < 100) {
        base = "amarillo";
    } 
    else {
        base = "gris";
    }

    // Clasificación de Tonalidad refinada
    if (brillo > 170) return base + " claro";
    if (brillo < 80) return base + " fuerte u oscuro";
    return base + " medio";
}

// --- ANÁLISIS DE VESTIMENTA CON MUESTREO DE ÁREA ---
function obtenerDetallesVoz(p) {
    const [x, y, w, h] = p.bbox;
    try {
        if (p.class === "person") {
            // En lugar de 1 píxel, tomamos un área de 8x8 para un color más real
            const sampleCamisa = ctx.getImageData(x + (w/2), y + (h * 0.35), 8, 8).data;
            const samplePantalon = ctx.getImageData(x + (w/2), y + (h * 0.80), 8, 8).data;

            const promediar = (data) => {
                let r=0, g=0, b=0;
                for(let i=0; i<data.length; i+=4){ r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
                const t = data.length/4;
                return [r/t, g/t, b/t];
            };

            const rgbC = promediar(sampleCamisa);
            const rgbP = promediar(samplePantalon);

            const camisa = analizarColorTono(rgbC[0], rgbC[1], rgbC[2]);
            const pantalon = analizarColorTono(rgbP[0], rgbP[1], rgbP[2]);

            return `. El color de la camisa es ${camisa}, el color del pantalón es ${pantalon}`;
        } else {
            const data = ctx.getImageData(x + (w/2), y + (h/2), 5, 5).data;
            const tono = analizarColorTono(data[0], data[1], data[2]);
            return `. Es de color ${tono}`;
        }
    } catch (e) { return ""; }
}

// --- RECONOCIMIENTO DE VOZ (ENTRADA) ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;
    
    rec.onstart = () => { window.speechSynthesis.cancel(); };

    rec.onresult = (event) => {
        const cmd = event.results[event.results.length - 1][0].transcript.toLowerCase();
        inputText.value = cmd;

        if (cmd.includes("iniciar")) start();
        else if (cmd.includes("detener")) stop();
        else if (cmd.includes("no describir")) { 
            modoDescripcion = false; 
            hablar("Modo simple activo"); 
        }
        else if (cmd.includes("describir")) { 
            modoDescripcion = true; 
            hablar("Modo descripción activo"); 
        }
    };
    
    document.body.addEventListener('click', () => { 
        rec.start(); 
        statusElem.textContent = "Escuchando comandos..."; 
    }, { once: true });
}

// --- PREDICCIÓN Y VISUALIZACIÓN ---
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
        video.srcObject = localStream;
        video.play();
        streaming = true;
        startButton.disabled = true;
        stopButton.disabled = false;
        video.onloadedmetadata = () => { 
            canvas.width = video.videoWidth; 
            canvas.height = video.videoHeight; 
            predict(); 
        };
    } catch (e) { statusElem.textContent = "Error de cámara."; }
}

function stop() {
    streaming = false;
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

(async () => {
    try {
        model = await cocoSsd.load();
        statusElem.textContent = "V5-J CALIBRADO Y LISTO.";
    } catch (e) { statusElem.textContent = "Error al cargar motor."; }
})();

startButton.onclick = start;
stopButton.onclick = stop;