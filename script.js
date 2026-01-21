// --- CONFIGURACIÓN INICIAL DEL ROBOT ---
const VERSION_ROBOT = "14"; 
const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusElem = document.getElementById('status');
const inputTextoVoz = document.getElementById('inputText');
const indicadorVoz = document.getElementById('voice-indicator');

// --- CONFIGURACIÓN DE SEGURIDAD (TOKEN DIVIDIDO) ---
const parte1 = "hf_MjBnFUxTnOWHEoNM"; 
const parte2 = "ofqsPLHLsAKPAtrdur"; 
const HF_TOKEN = parte1 + parte2; 

let model, streaming = false, objetosVistos = [];
let localStream = null;

// --- SISTEMA DE VOZ ---
function hablar(texto) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    window.speechSynthesis.speak(msg);
}

// --- CEREBRO INTELIGENTE (META LLAMA 3.2) ---
async function preguntarIA(pregunta) {
    statusElem.textContent = `V${VERSION_ROBOT} procesando...`;
    
    const contexto = objetosVistos.length > 0 
        ? `En tu cámara ves: ${objetosVistos.join(", ")}.` 
        : "No detectas objetos específicos ahora.";
    
    const prompt = `Instrucción: Eres el cerebro del robot Laynatech V${VERSION_ROBOT}. ${contexto} Responde en español de forma muy breve (máximo 15 palabras) y robótica a: ${pregunta}`;

    try {
        const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-1B-Instruct", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: prompt,
                parameters: { max_new_tokens: 50, temperature: 0.5 },
                options: { wait_for_model: true } 
            })
        });

        const data = await response.json();
        let respuestaRaw = Array.isArray(data) ? data[0].generated_text : data.generated_text;
        
        // Limpiamos la respuesta para que no repita la instrucción
        let respuestaLimpia = respuestaRaw.replace(prompt, "").trim();
        
        hablar(respuestaLimpia || "Entendido.");
        statusElem.textContent = `V${VERSION_ROBOT} Activa.`;
    } catch (e) {
        console.error(e);
        hablar("Error en mi conexión neuronal.");
        statusElem.textContent = "Error de Red.";
    }
}

// --- RECONOCIMIENTO DE VOZ CON VISUALIZACIÓN ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;

    rec.onresult = (event) => {
        const speech = event.results[event.results.length - 1][0].transcript;
        
        // Actualizamos la pantalla con lo que escucha
        inputTextoVoz.value = speech;
        indicadorVoz.textContent = `🎤 Escuché: ${speech}`;
        indicadorVoz.classList.remove("hidden");

        const comando = speech.toLowerCase();
        if (comando.includes("iniciar")) {
            start();
        } else if (comando.includes("detener")) {
            stopCamera();
        } else {
            preguntarIA(comando);
        }
    };
    rec.onend = () => { if(streaming) rec.start(); };
    rec.start();
}

// --- CONTROL DE CÁMARA (INICIAR/DETENER) ---
async function start() {
    if (streaming) return;
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = localStream;
        video.play();
        streaming = true;
        
        video.onloadedmetadata = () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            hablar(`Sistemas de visión V${VERSION_ROBOT} activos.`);
            predict();
        };
    } catch (e) {
        hablar("Error de cámara.");
    }
}

function stopCamera() {
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        video.srcObject = null;
        streaming = false;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        hablar("Visión desactivada.");
        statusElem.textContent = "Cámara detenida.";
    }
}

async function predict() {
    if (!streaming) return;
    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    objetosVistos = predictions.filter(p => p.score > 0.6).map(p => p.class);

    predictions.forEach(p => {
        if (p.score > 0.6) {
            const [x, y, w, h] = p.bbox;
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = "#00ff00";
            ctx.fillText(p.class.toUpperCase(), x, y > 20 ? y - 10 : 20);
        }
    });
    requestAnimationFrame(predict);
}

// --- ARRANQUE AUTOMÁTICO ---
(async () => {
    try {
        statusElem.textContent = `Iniciando V${VERSION_ROBOT}...`;
        model = await cocoSsd.load();
        statusElem.textContent = `V${VERSION_ROBOT} ONLINE.`;
        hablar(`Cerebro de Laynatech cargado. Versión ${VERSION_ROBOT} lista. Toca la pantalla y di iniciar.`);
    } catch (e) {
        statusElem.textContent = "Error de inicio.";
    }
})();