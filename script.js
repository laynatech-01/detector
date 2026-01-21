// --- CONFIGURACIÓN INICIAL DEL ROBOT ---
const VERSION_ROBOT = "12"; 
const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusElem = document.getElementById('status');

// --- TOKEN DE SEGURIDAD ---
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

// --- CEREBRO INTELIGENTE (META LLAMA 3.2 - MÁS RÁPIDO) ---
async function preguntarIA(pregunta) {
    statusElem.textContent = `V${VERSION_ROBOT} conectando...`;
    
    const contexto = objetosVistos.length > 0 
        ? `Ves esto: ${objetosVistos.join(", ")}.` 
        : "No ves nada ahora.";
    
    const prompt = `Instrucción: Eres el robot Laynatech V${VERSION_ROBOT}. ${contexto} Responde en español, muy breve y robótico a: ${pregunta}`;

    try {
        const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-1B-Instruct", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: prompt,
                parameters: { max_new_tokens: 40, temperature: 0.5 },
                options: { wait_for_model: true } 
            })
        });

        const data = await response.json();

        // Si la API devuelve un array, tomamos el texto generado
        let respuestaRaw = Array.isArray(data) ? data[0].generated_text : data.generated_text;
        
        // Limpiamos la respuesta para que no repita la pregunta
        let respuestaLimpia = respuestaRaw.replace(prompt, "").trim();
        
        hablar(respuestaLimpia || "Entendido.");
        statusElem.textContent = `V${VERSION_ROBOT} lista.`;
    } catch (e) {
        console.error("Error de API:", e);
        hablar("Error de enlace neuronal. Reintenta.");
        statusElem.textContent = "Error de Red.";
    }
}

// --- RECONOCIMIENTO DE VOZ ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (Recognition) {
    const rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;

    rec.onresult = (event) => {
        const speech = event.results[event.results.length - 1][0].transcript.toLowerCase();
        statusElem.textContent = `V${VERSION_ROBOT} oyó: ${speech}`;

        if (speech.includes("iniciar")) {
            start();
        } else {
            preguntarIA(speech);
        }
    };
    rec.onend = () => { if(streaming) rec.start(); };
    rec.start();
}

// --- VISIÓN (COCO-SSD) ---
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
            hablar(`Sistemas de visión V${VERSION_ROBOT} activos.`);
            predict();
        };
    } catch (e) {
        hablar("Error de cámara.");
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

// --- ARRANQUE ---
(async () => {
    try {
        statusElem.textContent = `Cargando V${VERSION_ROBOT}...`;
        model = await cocoSsd.load();
        statusElem.textContent = `V${VERSION_ROBOT} ONLINE.`;
        hablar(`Robot Laynatech Versión ${VERSION_ROBOT} en línea. Toca e inicia.`);
    } catch (e) {
        statusElem.textContent = "Error fatal.";
    }
})();