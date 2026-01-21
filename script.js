const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusElem = document.getElementById('status');

// --- PEGA AQUÍ TU CLAVE DE LA IMAGEN ---
const GEMINI_API_KEY = "PEGA_AQUÍ_TU_LLAVE_COPIADA"; 

let model, streaming = false, objetosVistos = [];

// --- IDENTIDAD Y VOZ ---
function hablar(texto) {
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    window.speechSynthesis.speak(msg);
}

// --- CEREBRO GEMINI ---
async function preguntarIA(pregunta) {
    if (objetosVistos.length === 0) {
        hablar("Soy Laynatech 01. Ahora mismo no detecto objetos claros para analizar.");
        return;
    }

    statusElem.textContent = "Laynatech 01 pensando...";
    const listaObjetos = objetosVistos.join(", ");
    
    const prompt = `Actúa como el cerebro del robot Laynatech 01. 
    A través de tu cámara ves: ${listaObjetos}. 
    Responde de forma breve, inteligente y robótica a: ${pregunta}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        const data = await response.json();
        const respuesta = data.candidates[0].content.parts[0].text;
        hablar(respuesta);
        statusElem.textContent = "Respuesta enviada.";
    } catch (e) {
        hablar("Error en mi módulo de lenguaje.");
    }
}

// --- RECONOCIMIENTO DE VOZ ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const rec = new Recognition();
rec.lang = 'es-ES';
rec.continuous = true;

rec.onresult = (event) => {
    const speech = event.results[event.results.length - 1][0].transcript.toLowerCase();
    
    if (speech.includes("quién eres") || speech.includes("quien eres")) {
        hablar("Soy el cerebro del robot Laynatech 01, diseñado para análisis visual.");
    } 
    else if (speech.includes("qué ves") || speech.includes("analiza") || speech.includes("que es esto")) {
        preguntarIA(speech);
    }
    else if (speech.includes("iniciar")) start();
};

rec.onstart = () => { statusElem.textContent = "Laynatech 01 escuchando..."; };
rec.onend = () => rec.start();

// --- INICIO DE SISTEMA ---
async function start() {
    const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    video.srcObject = s;
    video.onloadedmetadata = () => {
        video.play();
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        streaming = true;
        hablar("Sistema iniciado. Soy el cerebro del robot Laynatech 01.");
        predict();
    };
}

async function predict() {
    if (!streaming) return;
    const preds = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Actualizamos la lista de lo que el robot "está viendo"
    objetosVistos = preds.filter(p => p.score > 0.6).map(p => p.class);

    preds.forEach(p => {
        if (p.score > 0.6) {
            const [x, y, w, h] = p.bbox;
            ctx.strokeStyle = "#00ff00";
            ctx.strokeRect(x, y, w, h);
            ctx.fillText(p.class, x, y > 20 ? y - 10 : 20);
        }
    });
    requestAnimationFrame(predict);
}

(async () => {
    model = await cocoSsd.load();
    statusElem.textContent = "Sistemas listos.";
    rec.start();
})();