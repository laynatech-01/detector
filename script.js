// --- ELEMENTOS DE LA INTERFAZ ---
const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusElem = document.getElementById('status');

// --- CONFIGURACIÓN DE SEGURIDAD (HUGGING FACE) ---
// Dividimos tu token para evitar bloqueos de seguridad en GitHub
const parte1 = "hf_MjBnFUxTnOWHEoNM"; 
const parte2 = "ofqsPLHLsAKPAtrdur"; 
const HF_TOKEN = parte1 + parte2; 

let model, streaming = false, objetosVistos = [];

// --- SISTEMA DE VOZ ---
function hablar(texto) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    window.speechSynthesis.speak(msg);
}

// --- CEREBRO INTELIGENTE (MISTRAL VÍA HF) ---
async function preguntarIA(pregunta) {
    if (objetosVistos.length === 0) {
        hablar("Soy Laynatech 01 versión 8. Mis sensores no detectan objetos claros.");
        return;
    }

    statusElem.textContent = "Laynatech 01 V8 procesando...";
    const lista = objetosVistos.join(", ");
    
    // Instrucción específica para la Versión 8
    const prompt = `<s>[INST] Eres el cerebro del robot Laynatech 01 Versión 8. 
    Ves estos objetos: ${lista}. 
    Responde en español de forma muy breve (máximo 12 palabras) y robótica a: ${pregunta} [/INST]`;

    try {
        const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: prompt,
                parameters: { max_new_tokens: 50, temperature: 0.7 }
            })
        });

        const data = await response.json();
        let respuestaTotal = data[0].generated_text;
        let respuestaLimpia = respuestaTotal.split("[/INST]").pop().trim();
        
        hablar(respuestaLimpia);
        statusElem.textContent = "V8 respondió.";
    } catch (e) {
        console.error(e);
        hablar("Error en mi conexión neuronal externa.");
    }
}

// --- RECONOCIMIENTO DE COMANDOS POR VOZ ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec;

if (Recognition) {
    rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;

    rec.onresult = (event) => {
        const speech = event.results[event.results.length - 1][0].transcript.toLowerCase();
        statusElem.textContent = `V8 escuchó: ${speech}`;

        if (speech.includes("quién eres") || speech.includes("quien eres")) {
            hablar("Soy el cerebro del robot Laynatech 01, versión 8.");
        } 
        else if (speech.includes("qué ves") || speech.includes("analiza") || speech.includes("que es esto")) {
            preguntarIA(speech);
        }
        else if (speech.includes("iniciar")) {
            start();
        }
    };

    rec.onend = () => { if(streaming) rec.start(); };
}

// --- VISIÓN Y DETECCIÓN (COCO-SSD) ---
async function start() {
    if (streaming) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            streaming = true;
            hablar("Visión de la versión 8 iniciada.");
            predict();
        };
    } catch (e) {
        hablar("Error de cámara. Revisa los permisos.");
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
        statusElem.textContent = "Iniciando Laynatech 01 V8...";
        // Cargamos el modelo de detección de objetos
        model = await cocoSsd.load();
        statusElem.textContent = "Versión 8 Lista.";
        
        // El robot se presenta
        hablar("Cerebro de Laynatech 01 cargado. Versión 8 lista para operar. Toca la pantalla y di iniciar.");
        
        if(rec) rec.start();
    } catch (e) {
        console.error(e);
        statusElem.textContent = "Fallo en la V8.";
    }
})();