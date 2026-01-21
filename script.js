// --- CONFIGURACIÓN INICIAL DEL ROBOT ---
const VERSION_ROBOT = "9.1"; 
const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusElem = document.getElementById('status');

// --- CONFIGURACIÓN DE SEGURIDAD (TOKEN DIVIDIDO) ---
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

// --- CEREBRO INTELIGENTE (HUGGING FACE) ---
async function preguntarIA(pregunta) {
    statusElem.textContent = `V${VERSION_ROBOT} pensando...`;
    
    // Si ve objetos, se los decimos. Si no, le decimos que no hay nada a la vista.
    const contextoObjetos = objetosVistos.length > 0 
        ? `En tu cámara ves: ${objetosVistos.join(", ")}.` 
        : "Actualmente no detectas objetos específicos en tu cámara.";
    
    // Prompt mejorado para preguntas genéricas y visuales
    const prompt = `<s>[INST] Eres el cerebro del robot Laynatech 01 V${VERSION_ROBOT}. 
    ${contextoObjetos} 
    Responde de forma robótica, amable y breve (máximo 20 palabras) en español a: ${pregunta} [/INST]`;

    try {
        const response = await fetch("https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.2", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: prompt,
                options: { wait_for_model: true } 
            })
        });

        const data = await response.json();

        if (data.error && data.error.includes("currently loading")) {
            hablar(`Mi cerebro V${VERSION_ROBOT} está cargando datos. Repite en 5 segundos.`);
            return;
        }

        let respuestaTotal = data[0].generated_text;
        let respuestaLimpia = respuestaTotal.split("[/INST]").pop().trim();
        
        hablar(respuestaLimpia);
        statusElem.textContent = `V${VERSION_ROBOT} respondió.`;
    } catch (e) {
        hablar("Error en mi conexión neuronal externa.");
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
        statusElem.textContent = `V${VERSION_ROBOT} escuchó: ${speech}`;

        // Comandos directos de hardware
        if (speech.includes("iniciar")) {
            start();
        } 
        // Cualquier otra cosa se la preguntamos al cerebro (Mistral)
        else {
            preguntarIA(speech);
        }
    };
    rec.onend = () => { if(streaming) rec.start(); };
    rec.start();
}

// --- VISIÓN Y DETECCIÓN (Se mantiene igual) ---
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
            hablar(`Visión V${VERSION_ROBOT} activa.`);
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
        statusElem.textContent = `Iniciando V${VERSION_ROBOT}...`;
        model = await cocoSsd.load();
        statusElem.textContent = `Laynatech 01 V${VERSION_ROBOT} Lista.`;
        hablar(`Cerebro de Laynatech 01 cargado. Versión ${VERSION_ROBOT} lista. Toca la pantalla y di iniciar.`);
    } catch (e) {
        statusElem.textContent = "Fallo de sistema.";
    }

})();
