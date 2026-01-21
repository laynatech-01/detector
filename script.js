const video = document.getElementById('webcam');
const canvas = document.getElementById('outputCanvas');
const ctx = canvas.getContext('2d');
const statusElem = document.getElementById('status');

// --- REEMPLAZA ESTO CON TU CLAVE REAL DE GOOGLE AI STUDIO (EMPIEZA CON AIza) ---
const GEMINI_API_KEY = "AIzaSyCXMm3O7qFoTmiugBfdu3J6QStoIOwrEyE"; 

let model, streaming = false, objetosVistos = [];

// --- SISTEMA DE VOZ ---
function hablar(texto) {
    // Cancela cualquier voz pendiente para que no se amontone
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance(texto);
    msg.lang = 'es-ES';
    msg.rate = 1.0;
    window.speechSynthesis.speak(msg);
}

// --- CEREBRO INTELIGENTE (GEMINI) ---
async function preguntarIA(pregunta) {
    if (objetosVistos.length === 0) {
        hablar("Soy Laynatech 01. No detecto objetos claros en mi campo de visión para analizar.");
        return;
    }

    statusElem.textContent = "Laynatech 01 pensando...";
    const listaObjetos = objetosVistos.join(", ");
    
    // Configuramos la personalidad del robot
    const prompt = `Actúa como el cerebro del robot Laynatech 01. 
    En tu cámara ves estos objetos: ${listaObjetos}. 
    Responde de forma muy breve (máximo 15 palabras), inteligente y robótica a la pregunta: ${pregunta}`;

    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        });
        
        const data = await response.json();
        const respuesta = data.candidates[0].content.parts[0].text;
        hablar(respuesta);
        statusElem.textContent = "Respuesta enviada.";
    } catch (e) {
        console.error("Error de API:", e);
        hablar("Error en mi conexión neuronal. Revisa la clave API.");
    }
}

// --- RECONOCIMIENTO DE COMANDOS DE VOZ ---
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) {
    alert("Tu navegador no soporta reconocimiento de voz. Usa Chrome.");
} else {
    const rec = new Recognition();
    rec.lang = 'es-ES';
    rec.continuous = true;
    rec.interimResults = false;

    rec.onresult = (event) => {
        const speech = event.results[event.results.length - 1][0].transcript.toLowerCase();
        statusElem.textContent = `Escuché: ${speech}`;
        
        // Comandos de Identidad
        if (speech.includes("quién eres") || speech.includes("quien eres") || speech.includes("qué eres")) {
            hablar("Soy el cerebro del robot Laynatech 01, un sistema de inteligencia artificial avanzado.");
        } 
        // Comandos de Análisis (Gemini)
        else if (speech.includes("qué ves") || speech.includes("analiza") || speech.includes("que es esto")) {
            preguntarIA(speech);
        }
        // Comandos de Control
        else if (speech.includes("iniciar") || speech.includes("activar cámara")) {
            start();
        }
    };

    rec.onstart = () => { console.log("Micrófono activo"); };
    rec.onend = () => rec.start(); // Mantiene el micrófono siempre encendido
    
    // Iniciar el reconocimiento de voz al cargar
    rec.start();
}

// --- INICIO DE LA CÁMARA (VISIÓN) ---
async function start() {
    if (streaming) return;
    try {
        const constraints = { 
            video: { facingMode: "environment" } // Usa la cámara trasera en el celular
        };
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            streaming = true;
            hablar("Visión iniciada. Mis sensores están activos.");
            predict();
        };
    } catch (e) {
        statusElem.textContent = "Error: Permite el acceso a la cámara.";
        hablar("No puedo activar mi visión sin permisos de cámara.");
    }
}

// --- BUCLE DE DETECCIÓN DE OBJETOS ---
async function predict() {
    if (!streaming) return;
    
    const predictions = await model.detect(video);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Actualizar lista global de objetos para Gemini
    objetosVistos = predictions.filter(p => p.score > 0.6).map(p => p.class);

    predictions.forEach(p => {
        if (p.score > 0.6) {
            const [x, y, w, h] = p.bbox;
            // Dibujar recuadro estilo robot
            ctx.strokeStyle = "#00ff00";
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, w, h);
            
            // Dibujar etiqueta
            ctx.fillStyle = "#00ff00";
            ctx.font = "18px Arial";
            ctx.fillText(p.class.toUpperCase(), x, y > 20 ? y - 10 : 20);
        }
    });
    
    requestAnimationFrame(predict);
}

// --- CARGA INICIAL DEL SISTEMA ---
(async () => {
    try {
        statusElem.textContent = "Cargando cerebro...";
        model = await cocoSsd.load();
        statusElem.textContent = "Laynatech 01 listo.";
        // El robot se presenta al cargar la web
        hablar("Cerebro de Laynatech 01 cargado. Estoy listo para procesar datos. Di iniciar para activar mi visión.");
    } catch (error) {
        statusElem.textContent = "Fallo en el arranque del sistema.";
        console.error(error);
    }
})();