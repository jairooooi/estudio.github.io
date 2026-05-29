// Importar Firebase Modular SDK
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDocs, 
    deleteDoc, 
    onSnapshot
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

// ============ CONFIGURACIÓN DE FIREBASE ============
const firebaseConfig = {
    apiKey: "AIzaSyCpEC9VpbKrn56iYVbLDn7TdB6KIW3060o",
    authDomain: "estudio-890ee.firebaseapp.com",
    projectId: "estudio-890ee",
    storageBucket: "estudio-890ee.firebasestorage.app",
    messagingSenderId: "296063325492",
    appId: "1:296063325492:web:e63b0f9bef22a47123c161"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============ VARIABLES GLOBALES ============
let libraries = [];
let flashcards = [];
let currentLibrary = localStorage.getItem('badboys_currentLibrary') || 'all';
let currentStudyIndex = 0;
let studyCards = [];
let currentCSVData = [];
let currentTXTData = [];
let currentWORDData = [];
let currentPasteData = [];

// ============ ESCUCHAR CAMBIOS EN TIEMPO REAL ============
function setupListeners() {
    onSnapshot(collection(db, 'libraries'), () => {
        updateFromFirebase();
    });

    onSnapshot(collection(db, 'flashcards'), () => {
        updateFromFirebase();
    });
}

// ============ FUNCIÓN PARA ACTUALIZAR UI DESDE FIREBASE ============
async function updateFromFirebase() {
    const statusEl = document.getElementById('syncStatus');
    try {
        const libsSnapshot = await getDocs(collection(db, 'libraries'));
        libraries = [];
        libsSnapshot.forEach((doc) => {
            libraries.push({ id: doc.id, ...doc.data() });
        });
        
        const cardsSnapshot = await getDocs(collection(db, 'flashcards'));
        flashcards = [];
        cardsSnapshot.forEach((doc) => {
            flashcards.push({ id: doc.id, ...doc.data() });
        });
        
        localStorage.setItem('badboys_libraries', JSON.stringify(libraries));
        localStorage.setItem('badboys_flashcards', JSON.stringify(flashcards));
        
        if (statusEl) {
            statusEl.textContent = 'conectado';
            statusEl.className = 'sync-status connected';
        }
        updateUI();
    } catch (error) {
        console.error("Error cargando datos:", error);
        if (statusEl) statusEl.textContent = 'error de conexión';
        libraries = JSON.parse(localStorage.getItem('badboys_libraries')) || [];
        flashcards = JSON.parse(localStorage.getItem('badboys_flashcards')) || [];
        updateUI();
    }
}

// ============ OBTENER CONSEJO DEL DIA (ADVICE SLIP API) ============
window.fetchDailyQuote = async function() {
    const textEl = document.getElementById('quoteText');
    const authorEl = document.getElementById('quoteAuthor');
    
    textEl.textContent = "Buscando un consejo útil...";
    authorEl.textContent = "";

    try {
        // La API de Advice Slip no requiere API Key y es muy estable
        // Usamos un timestamp para evitar el cache del navegador y obtener uno nuevo
        const response = await fetch(`https://api.adviceslip.com/advice?t=${Date.now()}`);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        if (data && data.slip && data.slip.advice) {
            textEl.textContent = `"${data.slip.advice}"`;
            authorEl.textContent = "— Advice Slip";
        } else {
            throw new Error('Formato de datos inválido');
        }
    } catch (error) {
        console.error('Error fetching advice:', error);
        textEl.textContent = 'No se pudo cargar el consejo. Inténtalo de nuevo.';
        authorEl.textContent = '';
    }
};

window.createLibrary = async function() {
    const name = document.getElementById('newLibraryName').value.trim();
    if (!name) return alert('ingresa un nombre');
    const id = Date.now().toString();
    try {
        await setDoc(doc(db, "libraries", id), { name: name });
        document.getElementById('newLibraryName').value = '';
    } catch (e) { alert('error al guardar'); }
};

window.deleteLibrary = async function(id, event) {
    event.stopPropagation();
    if (confirm('¿eliminar biblioteca y sus cartas?')) {
        try {
            await deleteDoc(doc(db, "libraries", id));
            flashcards.filter(c => c.libraryId === id).forEach(async c => {
                await deleteDoc(doc(db, "flashcards", c.id));
            });
            if (currentLibrary === id) selectLibrary('all');
        } catch (e) { alert('error al eliminar'); }
    }
};

window.addFlashcard = async function() {
    const libId = document.getElementById('librarySelect').value;
    const term = document.getElementById('termInput').value.trim();
    const def = document.getElementById('definitionInput').value.trim();
    if (!libId || !term || !def) return alert('completa todos los campos');
    const id = Date.now().toString();
    try {
        await setDoc(doc(db, "flashcards", id), { libraryId: libId, term: term, definition: def });
        document.getElementById('termInput').value = '';
        document.getElementById('definitionInput').value = '';
    } catch (e) { alert('error al guardar'); }
};

window.deleteFlashcard = async function(id, event) {
    event.stopPropagation();
    if (confirm('¿eliminar esta flashcard?')) {
        try { await deleteDoc(doc(db, "flashcards", id)); } catch (e) { alert('error'); }
    }
};

// ============ FUNCIONES DE ESTUDIO ============
window.selectLibrary = function(id) {
    currentLibrary = id;
    currentStudyIndex = 0;
    const selectEl = document.getElementById('activeLibrarySelect');
    if (selectEl) selectEl.value = id;
    localStorage.setItem('badboys_currentLibrary', id);
    updateUI();
};

window.shuffleCurrentLibrary = function() {
    studyCards = studyCards.sort(() => Math.random() - 0.5);
    currentStudyIndex = 0;
    document.getElementById('studyCard').classList.remove('flipped');
    updateStudyCard();
};

window.flipStudyCard = function() {
    document.getElementById('studyCard').classList.toggle('flipped');
};

window.nextCard = function() {
    if (currentStudyIndex < studyCards.length - 1) {
        currentStudyIndex++;
        document.getElementById('studyCard').classList.remove('flipped');
        updateStudyCard();
    }
};

window.previousCard = function() {
    if (currentStudyIndex > 0) {
        currentStudyIndex--;
        document.getElementById('studyCard').classList.remove('flipped');
        updateStudyCard();
    }
};

window.scrollToSection = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

window.toggleMenu = function() {
    document.getElementById('sideMenu').classList.toggle('open');
    document.getElementById('hamburgerMenu').classList.toggle('open');
    document.getElementById('menuOverlay').classList.toggle('open');
};

window.navigateAndClose = function(id) {
    window.scrollToSection(id);
    window.toggleMenu();
};

window.toggleMiniFlashcards = function() {
    const grid = document.getElementById('miniFlashcardsGrid');
    if (grid.style.display === 'none') {
        grid.style.display = 'grid';
    } else {
        grid.style.display = 'none';
    }
};

function updateStudyCard() {
    if (studyCards.length > 0) {
        const card = studyCards[currentStudyIndex];
        document.getElementById('studyTerm').textContent = card.term;
        document.getElementById('studyDefinition').textContent = card.definition;
        document.getElementById('studyProgress').textContent = `${currentStudyIndex + 1}/${studyCards.length}`;
        document.getElementById('prevButton').disabled = currentStudyIndex === 0;
        document.getElementById('nextButton').disabled = currentStudyIndex === studyCards.length - 1;
        updateMiniFlashcards();
    }
}

function updateMiniFlashcards() {
    const container = document.getElementById('miniFlashcardsGrid');
    if (!container) return;
    container.innerHTML = '';
    studyCards.forEach((card, index) => {
        const mini = document.createElement('div');
        mini.className = `mini-flashcard ${index === currentStudyIndex ? 'active' : ''}`;
        mini.onclick = () => { currentStudyIndex = index; updateStudyCard(); };
        mini.innerHTML = `<div>${card.term.substring(0, 15)}...</div>
            <button class="delete-btn" onclick="deleteFlashcard('${card.id}', event)">×</button>`;
        container.appendChild(mini);
    });
}

// ============ CARGA MASIVA ============
function parseLine(line) {
    const seps = [/\s*\|\s*/, /\s*→\s*/, /\s*:\s*/, /\s*,\s*/];
    for (let s of seps) {
        const p = line.split(s);
        if (p.length >= 2) return { term: p[0].trim(), definition: p[1].trim() };
    }
    return null;
}

window.previewPastedText = function() {
    const lines = document.getElementById('pasteTextarea').value.split('\n');
    currentPasteData = lines.map(parseLine).filter(x => x);
    const preview = document.getElementById('pastePreview');
    preview.style.display = 'block';
    preview.innerHTML = currentPasteData.map(d => `<div class="preview-item">📌 ${d.term} → ${d.definition}</div>`).join('');
    document.getElementById('importPasteBtn').disabled = currentPasteData.length === 0;
};

window.importPastedText = async function() {
    const libId = document.getElementById('pasteLibrarySelect').value;
    if (!libId) return alert('selecciona biblioteca');
    for (let d of currentPasteData) {
        await setDoc(doc(db, "flashcards", (Date.now() + Math.random()).toString()), { ...d, libraryId: libId });
    }
    alert('importado');
    document.getElementById('pasteTextarea').value = '';
    document.getElementById('pastePreview').style.display = 'none';
};

window.previewCSV = function(input) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const lines = e.target.result.split('\n');
        currentCSVData = lines.map(parseLine).filter(x => x);
        document.getElementById('csvPreview').style.display = 'block';
        document.getElementById('csvPreview').innerHTML = currentCSVData.map(d => `<div class="preview-item">📌 ${d.term}</div>`).join('');
        document.getElementById('importCSVBtn').disabled = false;
    };
    reader.readAsText(input.files[0]);
};

window.importCSV = async function() {
    const libId = document.getElementById('csvLibrarySelect').value;
    for (let d of currentCSVData) await setDoc(doc(db, "flashcards", (Date.now() + Math.random()).toString()), { ...d, libraryId: libId });
    alert('csv importado');
};

window.previewTXT = function(input) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const lines = e.target.result.split('\n');
        currentTXTData = lines.map(parseLine).filter(x => x);
        document.getElementById('txtPreview').style.display = 'block';
        document.getElementById('txtPreview').innerHTML = currentTXTData.map(d => `<div class="preview-item">📌 ${d.term}</div>`).join('');
        document.getElementById('importTXTBtn').disabled = false;
    };
    reader.readAsText(input.files[0]);
};

window.importTXT = async function() {
    const libId = document.getElementById('txtLibrarySelect').value;
    for (let d of currentTXTData) await setDoc(doc(db, "flashcards", (Date.now() + Math.random()).toString()), { ...d, libraryId: libId });
    alert('txt importado');
};

window.previewWORD = function(input) {
    const reader = new FileReader();
    reader.onload = (e) => {
        mammoth.extractRawText({ arrayBuffer: e.target.result }).then(res => {
            currentWORDData = res.value.split('\n').map(parseLine).filter(x => x);
            document.getElementById('wordPreview').style.display = 'block';
            document.getElementById('wordPreview').innerHTML = currentWORDData.map(d => `<div class="preview-item">📌 ${d.term}</div>`).join('');
            document.getElementById('importWORDBtn').disabled = false;
        });
    };
    reader.readAsArrayBuffer(input.files[0]);
};

window.importWORD = async function() {
    const libId = document.getElementById('wordLibrarySelect').value;
    for (let d of currentWORDData) await setDoc(doc(db, "flashcards", (Date.now() + Math.random()).toString()), { ...d, libraryId: libId });
    alert('word importado');
};

// ============ UI UPDATE ============
function updateUI() {
    const selects = ['librarySelect', 'activeLibrarySelect', 'csvLibrarySelect', 'txtLibrarySelect', 'wordLibrarySelect', 'pasteLibrarySelect'];
    selects.forEach(s => {
        const el = document.getElementById(s);
        if (!el) return;
        const val = el.value;
        el.innerHTML = s === 'activeLibrarySelect' ? '<option value="all">todas</option>' : '<option value="">selecciona</option>';
        libraries.forEach(l => el.innerHTML += `<option value="${l.id}">${l.name}</option>`);
        if (val) el.value = val;
    });

    const container = document.getElementById('librariesContainer');
    if (container) {
        container.innerHTML = '';
        libraries.forEach(l => {
            const div = document.createElement('div');
            div.className = `library-item ${currentLibrary === l.id ? 'active' : ''}`;
            div.onclick = () => selectLibrary(l.id);
            div.innerHTML = `<span>${l.name}</span><button class="delete-btn" onclick="deleteLibrary('${l.id}', event)">×</button>`;
            container.appendChild(div);
        });
    }

    const studyMode = document.getElementById('studyMode');
    if (studyMode) {
        if (currentLibrary !== 'all' && currentLibrary !== '') {
            studyMode.style.display = 'block';
            studyCards = flashcards.filter(c => c.libraryId === currentLibrary);
            const lib = libraries.find(l => l.id === currentLibrary);
            document.getElementById('currentLibraryTitle').textContent = lib ? lib.name : 'biblioteca';
            updateStudyCard();
        } else {
            studyMode.style.display = 'none';
        }
    }
}

// ============ WORD OF THE DAY API (ROBUSTA) ============
async function fetchWordOfTheDay() {
    const wordEl = document.getElementById('wordMain');
    try {
        // Usamos una API de diccionario gratuita y muy estable para obtener una palabra aleatoria cada día
        // Esta API no falla y no necesita KEY
        const response = await fetch('https://wordoftheday.freeapi.me/');
        const data = await response.json();
        
        if (data && data[0]) {
            wordEl.textContent = data[0].toUpperCase();
        } else {
            wordEl.textContent = "NEBULA";
        }
    } catch (e) { 
        console.error("Error en API de palabra:", e);
        // Fallback local por si el servidor falla por completo
        const fallbacks = ["INNOVATION", "SUCCESS", "LEARNING", "FUTURE", "FOCUS"];
        wordEl.textContent = fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
}

// INICIO
document.addEventListener('DOMContentLoaded', () => {
    setupListeners();
    updateFromFirebase();
    fetchWordOfTheDay();
});
