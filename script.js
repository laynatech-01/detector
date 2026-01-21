const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const inputText = document.getElementById('inputText');
const statusElem = document.getElementById('status');
const voiceInd = document.getElementById('voice-indicator');

let model, streaming = false, ultimaDeteccion = "";

const traducciones = {
    "person": "persona", "bicycle": "bicicleta", "car": "carro", "motorcycle": "moto",
    "dog": "perro", "cat": "gato", "chair": "silla", "cup": "taza", "laptop": "laptop",
    "cell phone": "celular", "bottle": "botella", "remote": "control", "book": "libro",
    "backpack": "mochila", "handbag": "bolso", "umbrella": "paraguas", "clock": "reloj"
};

// --- CONTROL DE VOZ (SALIDA) ---
function hablar(texto) {
    if (window.speechSynthesis.speaking) return; 

    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = 0.9; 
    
    msg.onend = () => {
        // Pausa de 1.5 segundos antes de permitir la siguiente locución
        setTimeout(() => { ultimaDeteccion = ""; }, 1500);
    };

    window.speechSynthesis.speak(msg);
}

// --- RECONOCIMIENTO DE COMANDOS (ENTRADA) ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = new Recognition();
rec.lang = 'es-ES';
rec.continuous = true;

rec.onstart = () => voiceInd.classList.remove('hidden');
rec.onend = () => { if(streaming || !streaming) rec.start(); }; 

rec.onresult = (event) => {
    const speech = event.results[event.results.length - 1][0].transcript.toLowerCase();
    statusElem.textContent = `Voz: "${speech}"`;

    if (speech.includes("iniciar") || speech.includes("activar")) start();
    if (speech.includes("detener") || speech.includes("parar")) stop();
    if (speech.includes("detectar") || speech.includes("buscar")) {
        const obj = speech.split(" ").pop();
        inputText.value = obj;
        hablar(`Buscando ${obj}`);
    }
};

// --- CONTROL DE CÁMARA (AJUSTE MÓVIL) ---
async function start() {
    if (streaming) return;
    try {
        // AJUSTE: environment activa la cámara trasera en celulares
        const constraints = { 
            video: { 
                facingMode: "environment",
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        };
        
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = s;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            streaming = true;
            startButton.disabled = true;
            stopButton.disabled = false;
            hablar("Cámara trasera activa");
            predict();
        };
    } catch (e) { 
        statusElem.textContent = "Error: Use HTTPS y permita la cámara.";
        alert("La cámara requiere HTTPS para funcionar en el celular."); 
    }
}

function stop() {
    streaming = false;
    if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    startButton.disabled = false;
    stopButton.disabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hablar("Detección apagada");
}

// --- BUCLE DE DETECCIÓN IA ---
async function predict() {
    if (!streaming) return;
    const preds = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const filter = inputText.value.toLowerCase().trim();

    preds.forEach(p => {
        if (p.score > 0.6) { 
            const esp = traducciones[p.class.toLowerCase()] || p.class.toLowerCase();
            
            if (filter === "" || esp.includes(filter)) {
                const [x, y, w, h] = p.bbox;
                
                // Dibujo de cuadro verde
                ctx.strokeStyle = "#22c55e";
                ctx.lineWidth = 5;
                ctx.strokeRect(x, y, w, h);
                
                // Texto en pantalla
                ctx.fillStyle = "#22c55e";
                ctx.font = "bold 20px sans-serif";
                ctx.fillText(esp.toUpperCase(), x, y > 25 ? y - 10 : 25);

                // Lógica de audio con bloqueo por repetición
                if (ultimaDeteccion !== esp) {
                    ultimaDeteccion = esp; 
                    hablar(`Detectado: ${esp}`);
                }
            }
        }
    });
    requestAnimationFrame(predict);
}

// Inicialización del modelo al cargar la web
(async () => {
    try {
        model = await cocoSsd.load();
        statusElem.textContent = "IA Lista. Di 'Iniciar'.";
        rec.start();
    } catch(err) {
        statusElem.textContent = "Error cargando modelo.";
    }
})();

startButton.onclick = start;
stopButton.onclick = stop;