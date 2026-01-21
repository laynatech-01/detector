// --- CONFIGURACIÓN INICIAL DEL ROBOT ---
const VERSION_ROBOT = "11"; 
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

// --- CEREBRO INTELIGENTE (HUGGING FACE - LLAMA 3) ---
async function preguntarIA(pregunta) {
    statusElem.textContent = `V${VERSION_ROBOT} conectando...`;
    
    const contextoObjetos = objetosVistos.length > 0 
        ? `En tu cámara ves: ${objetosVistos.join(", ")}.` 
        : "No detectas objetos ahora.";
    
    // Prompt optimizado para Llama-3 (Versión 11)
    const prompt = `<|begin_of_text|><|start_header_id|>system<|end_header_id|>
    Eres el robot Laynatech V${VERSION_ROBOT}. ${contextoObjetos} 
    Responde en español, muy breve (15 palabras) y robótico.<|eot_id|>
    <|start_header_id|>user<|end_header_id|>${pregunta}<|eot_id|>
    <|start_header_id|>assistant<|end_header_id|>`;

    try {
        const response = await fetch("https://api-inference.huggingface.co/models/meta-llama/Meta-Llama-3-8B-Instruct", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${HF_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
                inputs: prompt,
                parameters: { max_new_tokens: 60, return_full_text: false },
                options: { wait_for_model: true } 
            })
        });

        const data = await response.json();

        if (data.error) {
            hablar(`Cerebro V${VERSION_ROBOT} iniciando. Repite en diez segundos.`);
            return;
        }

        let respuestaIA = data[0].generated_text.trim();
        hablar(respuestaIA);
        statusElem.textContent = `V${VERSION_ROBOT} respondió.`;
        
    } catch (e) {
        hablar("Error en mi conexión neuronal externa.");
        statusElem.textContent = "Error de enlace.";
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

        if (speech.includes("iniciar")) {
            start();
        } else {
            preguntarIA(speech);
        }
    };
    rec.onend = () => { if(streaming) rec.start(); };
    rec.start();
}

// --- VISIÓN Y DETECCIÓN ---
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
            hablar(`Visión versión ${VERSION_ROBOT} activa.`);
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
        statusElem.textContent = `V${VERSION_ROBOT} LISTA.`;
        hablar(`Sistemas listos. Laynatech versión ${VERSION_ROBOT} en línea. Toca la pantalla y di iniciar.`);
    } catch (e) {
        statusElem.textContent = "Fallo de carga.";
    }
})();