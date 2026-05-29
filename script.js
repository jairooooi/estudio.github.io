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
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

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

// ============ FUNCIÓN PARA ACTUALIZAR UI DESDE FIREBASE ============
function updateFromFirebase() {
    console.log('Actualizando desde Firebase...');
    
    // Cargar bibliotecas
    db.collection('libraries').get().then((libsSnapshot) => {
        libraries = [];
        libsSnapshot.forEach((doc) => {
            libraries.push({ id: doc.id, ...doc.data() });
        });
        
        // Cargar flashcards
        db.collection('flashcards').get().then((cardsSnapshot) => {
            flashcards = [];
            cardsSnapshot.forEach((doc) => {
                flashcards.push({ id: doc.id, ...doc.data() });
            });
            
            // Backup en localStorage
            localStorage.setItem('badboys_libraries', JSON.stringify(libraries));
            localStorage.setItem('badboys_flashcards', JSON.stringify(flashcards));
            
            document.getElementById('syncStatus').textContent = 'conectado';
            document.getElementById('syncStatus').className = 'sync-status connected';
            
            updateUI();
        }).catch((error) => {
            console.error("Error cargando flashcards:", error);
        });
    }).catch((error) => {
        console.error("Error cargando bibliotecas:", error);
        document.getElementById('syncStatus').textContent = 'error de conexión';
        
        // Fallback a localStorage
        libraries = JSON.parse(localStorage.getItem('badboys_libraries')) || [];
        flashcards = JSON.parse(localStorage.getItem('badboys_flashcards')) || [];
        updateUI();
    });
}

// ============ ESCUCHAR CAMBIOS EN TIEMPO REAL ============
// Escuchar cambios en bibliotecas
db.collection('libraries').onSnapshot((snapshot) => {
    console.log('Cambios detectados en bibliotecas!');
    updateFromFirebase();
}, (error) => {
    console.error("Error en snapshot de bibliotecas:", error);
});

// Escuchar cambios en flashcards
db.collection('flashcards').onSnapshot((snapshot) => {
    console.log('Cambios detectados en flashcards!');
    updateFromFirebase();
}, (error) => {
    console.error("Error en snapshot de flashcards:", error);
});

// ============ FUNCIONES PRINCIPALES ============
window.createLibrary = async function() {
    const name = document.getElementById('newLibraryName').value.trim();
    if (!name) {
        alert('ingresa un nombre para la biblioteca');
        return;
    }

    const newLibrary = {
        id: Date.now().toString(),
        name: name
    };

    try {
        await db.collection('libraries').doc(newLibrary.id).set({
            name: newLibrary.name
        });
        document.getElementById('newLibraryName').value = '';
    } catch (error) {
        console.error("Error guardando en Firebase:", error);
        alert('error al guardar. verifica tu conexión.');
    }
};

window.deleteLibrary = async function(id, event) {
    event.stopPropagation();
    if (confirm('¿eliminar esta biblioteca? también se eliminarán sus flashcards.')) {
        
        try {
            await db.collection('libraries').doc(id).delete();
            
            const cardsToDelete = flashcards.filter(c => c.libraryId === id);
            for (const card of cardsToDelete) {
                await db.collection('flashcards').doc(card.id).delete();
            }
            
            if (currentLibrary === id) {
                currentLibrary = 'all';
                localStorage.setItem('badboys_currentLibrary', 'all');
            }
        } catch (error) {
            console.error("Error eliminando de Firebase:", error);
            alert('error al eliminar. verifica tu conexión.');
        }
    }
};

window.addFlashcard = async function() {
    const libraryId = document.getElementById('librarySelect').value;
    const term = document.getElementById('termInput').value.trim();
    const definition = document.getElementById('definitionInput').value.trim();

    if (!libraryId) {
        alert('selecciona una biblioteca');
        return;
    }

    if (!term || !definition) {
        alert('completa término y definición');
        return;
    }

    const newCard = {
        id: Date.now().toString(),
        libraryId: libraryId,
        term: term,
        definition: definition
    };

    try {
        await db.collection('flashcards').doc(newCard.id).set({
            libraryId: libraryId,
            term: term,
            definition: definition
        });
        
        document.getElementById('termInput').value = '';
        document.getElementById('definitionInput').value = '';
    } catch (error) {
        console.error("Error guardando en Firebase:", error);
        alert('error al guardar. verifica tu conexión.');
    }
};

window.deleteFlashcard = async function(id, event) {
    event.stopPropagation();
    if (confirm('¿eliminar esta flashcard?')) {
        try {
            await db.collection('flashcards').doc(id).delete();
        } catch (error) {
            console.error("Error eliminando de Firebase:", error);
            alert('error al eliminar. verifica tu conexión.');
        }
    }
};

// ============ FUNCIÓN DE PARSEO ============
function parseLineToFlashcard(line) {
    line = line.trim();
    if (!line) return null;

    const separators = [
        { pattern: /\s*\|\s*/, name: 'pipe' },
        { pattern: /\s*→\s*/, name: 'arrow' },
        { pattern: /\s*:\s*/, name: 'colon' },
        { pattern: /\s*;\s*/, name: 'semicolon' },
        { pattern: /\s*,\s*/, name: 'comma' }
    ];

    for (let sep of separators) {
        if (line.match(sep.pattern)) {
            const parts = line.split(sep.pattern);
            if (parts.length >= 2) {
                return {
                    term: parts[0].trim().replace(/^["']|["']$/g, ''),
                    definition: parts.slice(1).join(sep.pattern).trim().replace(/^["']|["']$/g, '')
                };
            }
        }
    }

    if (line.includes('¿') && line.includes('?')) {
        const questionMatch = line.match(/^(.*?[?])\s+(.*)$/);
        if (questionMatch) {
            return {
                term: questionMatch[1].trim(),
                definition: questionMatch[2].trim()
            };
        }
    }

    return null;
}

// ============ FUNCIONES DE PEGADO DIRECTO ============
window.previewPastedText = function() {
    const text = document.getElementById('pasteTextarea').value;
    if (!text.trim()) {
        alert('pega algún texto primero');
        return;
    }

    const lines = text.split('\n');
    const previewLines = [];
    currentPasteData = [];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line) {
            const parsed = parseLineToFlashcard(line);
            if (parsed) {
                previewLines.push(`📌 ${parsed.term.substring(0, 50)}${parsed.term.length > 50 ? '...' : ''} → ${parsed.definition.substring(0, 50)}${parsed.definition.length > 50 ? '...' : ''}`);
                currentPasteData.push(parsed);
            } else {
                previewLines.push(`⚠️ no se pudo parsear: ${line.substring(0, 50)}...`);
            }
        }
    }

    const preview = document.getElementById('pastePreview');
    preview.style.display = 'block';
    preview.innerHTML = previewLines.map(l => `<div class="preview-item">${l}</div>`).join('');
    
    document.getElementById('importPasteBtn').disabled = currentPasteData.length === 0;
    
    if (currentPasteData.length > 0) {
        showMessage(`se detectaron ${currentPasteData.length} flashcards`, 'success');
    } else {
        showMessage('no se detectaron flashcards válidas', 'error');
    }
};

window.importPastedText = async function() {
    const libraryId = document.getElementById('pasteLibrarySelect').value;
    if (!libraryId) {
        alert('selecciona una biblioteca destino');
        return;
    }

    if (currentPasteData.length === 0) {
        alert('no hay datos para importar');
        return;
    }

    let imported = 0;
    for (let item of currentPasteData) {
        if (item.term && item.definition) {
            const newCard = {
                id: Date.now() + Math.random().toString(),
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            };
            
            await db.collection('flashcards').doc(newCard.id).set({
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            });
            imported++;
        }
    }

    showMessage(`${imported} flashcards importadas`, 'success');
    
    document.getElementById('pasteTextarea').value = '';
    document.getElementById('pastePreview').style.display = 'none';
    document.getElementById('importPasteBtn').disabled = true;
    currentPasteData = [];
};

// ============ FUNCIONES DE CARGA DE ARCHIVOS ============
window.previewCSV = function(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split('\n');
        const previewLines = [];
        currentCSVData = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const separator = line.includes(';') ? ';' : ',';
                const parts = line.split(separator).map(p => p.replace(/^["']|["']$/g, '').trim());
                
                if (parts.length >= 2) {
                    if (i === 0 && (parts[0].toLowerCase().includes('término') || parts[0].toLowerCase().includes('pregunta'))) {
                        continue;
                    }
                    previewLines.push(`📌 ${parts[0].substring(0, 50)} → ${parts[1].substring(0, 50)}`);
                    currentCSVData.push({
                        term: parts[0],
                        definition: parts[1]
                    });
                }
            }
        }

        const preview = document.getElementById('csvPreview');
        preview.style.display = 'block';
        preview.innerHTML = previewLines.map(l => `<div class="preview-item">${l}</div>`).join('');
        
        document.getElementById('importCSVBtn').disabled = currentCSVData.length === 0;
        showMessage(`se detectaron ${currentCSVData.length} flashcards`, 'success');
    };
    reader.readAsText(file);
};

window.importCSV = async function() {
    const libraryId = document.getElementById('csvLibrarySelect').value;
    if (!libraryId) {
        alert('selecciona una biblioteca destino');
        return;
    }

    if (currentCSVData.length === 0) {
        alert('no hay datos para importar');
        return;
    }

    let imported = 0;
    for (let item of currentCSVData) {
        if (item.term && item.definition) {
            const newCard = {
                id: Date.now() + Math.random().toString(),
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            };
            
            await db.collection('flashcards').doc(newCard.id).set({
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            });
            imported++;
        }
    }

    showMessage(`${imported} flashcards importadas`, 'success');
    
    document.getElementById('csvFile').value = '';
    document.getElementById('csvPreview').style.display = 'none';
    document.getElementById('importCSVBtn').disabled = true;
    currentCSVData = [];
};

window.previewTXT = function(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const content = e.target.result;
        const lines = content.split('\n');
        const previewLines = [];
        currentTXTData = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const parsed = parseLineToFlashcard(line);
                if (parsed) {
                    previewLines.push(`📌 ${parsed.term.substring(0, 50)} → ${parsed.definition.substring(0, 50)}`);
                    currentTXTData.push(parsed);
                }
            }
        }

        const preview = document.getElementById('txtPreview');
        preview.style.display = 'block';
        preview.innerHTML = previewLines.map(l => `<div class="preview-item">${l}</div>`).join('');
        
        document.getElementById('importTXTBtn').disabled = currentTXTData.length === 0;
        showMessage(`se detectaron ${currentTXTData.length} flashcards`, 'success');
    };
    reader.readAsText(file);
};

window.importTXT = async function() {
    const libraryId = document.getElementById('txtLibrarySelect').value;
    if (!libraryId) {
        alert('selecciona una biblioteca destino');
        return;
    }

    if (currentTXTData.length === 0) {
        alert('no hay datos para importar');
        return;
    }

    let imported = 0;
    for (let item of currentTXTData) {
        if (item.term && item.definition) {
            const newCard = {
                id: Date.now() + Math.random().toString(),
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            };
            
            await db.collection('flashcards').doc(newCard.id).set({
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            });
            imported++;
        }
    }

    showMessage(`${imported} flashcards importadas`, 'success');
    
    document.getElementById('txtFile').value = '';
    document.getElementById('txtPreview').style.display = 'none';
    document.getElementById('importTXTBtn').disabled = true;
    currentTXTData = [];
};

window.previewWORD = function(input) {
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        
        mammoth.extractRawText({ arrayBuffer: arrayBuffer })
            .then(function(result) {
                const text = result.value;
                const lines = text.split('\n');
                const previewLines = [];
                currentWORDData = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (line) {
                        const parsed = parseLineToFlashcard(line);
                        if (parsed) {
                            previewLines.push(`📌 ${parsed.term.substring(0, 50)} → ${parsed.definition.substring(0, 50)}`);
                            currentWORDData.push(parsed);
                        }
                    }
                }

                const preview = document.getElementById('wordPreview');
                preview.style.display = 'block';
                preview.innerHTML = previewLines.length > 0 
                    ? previewLines.map(l => `<div class="preview-item">${l}</div>`).join('')
                    : '<div class="preview-item">⚠️ no se detectaron flashcards</div>';
                
                document.getElementById('importWORDBtn').disabled = currentWORDData.length === 0;
                showMessage(`se detectaron ${currentWORDData.length} flashcards`, 'success');
            })
            .catch(function(error) {
                console.error(error);
                alert('error al leer el archivo word');
            });
    };
    reader.readAsArrayBuffer(file);
};

window.importWORD = async function() {
    const libraryId = document.getElementById('wordLibrarySelect').value;
    if (!libraryId) {
        alert('selecciona una biblioteca destino');
        return;
    }

    if (currentWORDData.length === 0) {
        alert('no hay datos para importar');
        return;
    }

    let imported = 0;
    for (let item of currentWORDData) {
        if (item.term && item.definition) {
            const newCard = {
                id: Date.now() + Math.random().toString(),
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            };
            
            await db.collection('flashcards').doc(newCard.id).set({
                libraryId: libraryId,
                term: item.term,
                definition: item.definition
            });
            imported++;
        }
    }

    showMessage(`${imported} flashcards importadas`, 'success');
    
    document.getElementById('wordFile').value = '';
    document.getElementById('wordPreview').style.display = 'none';
    document.getElementById('importWORDBtn').disabled = true;
    currentWORDData = [];
};

function showMessage(text, type) {
    const msg = document.getElementById('uploadMessage');
    msg.style.display = 'block';
    msg.textContent = text;
    msg.style.background = type === 'success' ? 'rgba(0, 0, 0, 0.6)' : 'rgba(255, 0, 0, 0.1)';
    msg.style.borderColor = type === 'success' ? '#00ffcc' : '#ff4444';
    msg.style.color = type === 'success' ? '#00ffcc' : '#ff4444';
    
    setTimeout(() => {
        msg.style.display = 'none';
    }, 5000);
}

// ============ FUNCIONES DE ESTUDIO ============
window.selectLibrary = function(id) {
    currentLibrary = id;
    currentStudyIndex = 0;
    document.getElementById('activeLibrarySelect').value = id;
    localStorage.setItem('badboys_currentLibrary', id);
    
    if (id !== 'all' && id !== '') {
        document.getElementById('studyMode').style.display = 'block';
        updateStudyMode();
    } else {
        document.getElementById('studyMode').style.display = 'none';
    }
};

function updateStudyMode() {
    studyCards = flashcards.filter(card => card.libraryId === currentLibrary);
    shuffleArray(studyCards);
    
    const library = libraries.find(l => l.id === currentLibrary);
    if (library) {
        document.getElementById('currentLibraryTitle').textContent = library.name.toLowerCase();
    }
    
    updateStudyCard();
    updateMiniFlashcards();
    updateNavigationButtons();
}

function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

window.shuffleCurrentLibrary = function() {
    shuffleArray(studyCards);
    currentStudyIndex = 0;
    document.getElementById('studyCard').classList.remove('flipped');
    updateStudyCard();
    updateMiniFlashcards();
    updateNavigationButtons();
};

function updateStudyCard() {
    if (studyCards.length > 0 && currentStudyIndex < studyCards.length) {
        const card = studyCards[currentStudyIndex];
        document.getElementById('studyTerm').textContent = card.term;
        document.getElementById('studyDefinition').textContent = card.definition;
        document.getElementById('studyProgress').textContent = 
            `${currentStudyIndex + 1}/${studyCards.length}`;
        
        document.querySelectorAll('.mini-flashcard').forEach((el, index) => {
            if (index === currentStudyIndex) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
    } else {
        document.getElementById('studyTerm').textContent = 'vacío';
        document.getElementById('studyDefinition').textContent = 'agrega flashcards';
        document.getElementById('studyProgress').textContent = '0/0';
    }
}

function updateMiniFlashcards() {
    const container = document.getElementById('miniFlashcardsGrid');
    container.innerHTML = '';
    
    studyCards.forEach((card, index) => {
        const miniCard = document.createElement('div');
        miniCard.className = `mini-flashcard ${index === currentStudyIndex ? 'active' : ''}`;
        miniCard.onclick = () => goToCard(index);
        miniCard.innerHTML = `
            <div>${card.term.substring(0, 20)}${card.term.length > 20 ? '...' : ''}</div>
            <button class="delete-btn" onclick="deleteFlashcard('${card.id}', event)">×</button>
        `;
        container.appendChild(miniCard);
    });
}

function goToCard(index) {
    currentStudyIndex = index;
    document.getElementById('studyCard').classList.remove('flipped');
    updateStudyCard();
    updateNavigationButtons();
}

window.nextCard = function() {
    if (currentStudyIndex < studyCards.length - 1) {
        currentStudyIndex++;
        document.getElementById('studyCard').classList.remove('flipped');
        updateStudyCard();
        updateNavigationButtons();
    }
};

window.previousCard = function() {
    if (currentStudyIndex > 0) {
        currentStudyIndex--;
        document.getElementById('studyCard').classList.remove('flipped');
        updateStudyCard();
        updateNavigationButtons();
    }
};

window.flipStudyCard = function() {
    document.getElementById('studyCard').classList.toggle('flipped');
};

function updateNavigationButtons() {
    document.getElementById('prevButton').disabled = currentStudyIndex === 0;
    document.getElementById('nextButton').disabled = currentStudyIndex === studyCards.length - 1;
}

// ============ FUNCIÓN DE ACTUALIZACIÓN UI ============
function updateUI() {
    // Actualizar selects de bibliotecas
    const selects = ['librarySelect', 'activeLibrarySelect', 'csvLibrarySelect', 'txtLibrarySelect', 'wordLibrarySelect', 'pasteLibrarySelect'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = selectId === 'activeLibrarySelect' 
                ? '<option value="all">todas las bibliotecas</option>'
                : '<option value="">selecciona una biblioteca</option>';

            libraries.forEach(lib => {
                const option = document.createElement('option');
                option.value = lib.id;
                option.textContent = lib.name;
                select.appendChild(option);
            });

            if (currentValue && Array.from(select.options).some(opt => opt.value === currentValue)) {
                select.value = currentValue;
            }
        }
    });

    // Mostrar grid de bibliotecas
    const librariesContainer = document.getElementById('librariesContainer');
    librariesContainer.innerHTML = '';
    
    libraries.forEach(lib => {
        const cardCount = flashcards.filter(f => f.libraryId === lib.id).length;
        const div = document.createElement('div');
        div.className = `library-item ${currentLibrary === lib.id ? 'active' : ''}`;
        div.onclick = () => selectLibrary(lib.id);
        div.innerHTML = `
            <span class="library-name">${lib.name}</span>
            <span class="library-count">${cardCount}</span>
            <button class="delete-btn" onclick="deleteLibrary('${lib.id}', event)">×</button>
        `;
        librariesContainer.appendChild(div);
    });

    // Actualizar modo estudio
    if (currentLibrary !== 'all' && currentLibrary !== '') {
        document.getElementById('studyMode').style.display = 'block';
        updateStudyMode();
    } else {
        document.getElementById('studyMode').style.display = 'none';
    }
}

// ============ WORD OF THE DAY API ============
async function fetchWordOfTheDay() {
    try {
        // Usamos la nueva API proporcionada
        const response = await fetch('https://api.wotd.site/query');
        const data = await response.json();
        
        // Estructura esperada según APIs similares: { word: "...", definition: "...", etc }
        // Si la API tiene una estructura diferente, ajustamos aquí:
        if (data && data.word) {
            document.getElementById('wordMain').textContent = data.word.toLowerCase();
            
            // La API wotd.site suele devolver 'meaning' o 'definition'
            const meaning = data.meaning || data.definition || "Significado no disponible";
            document.getElementById('wordMeaning').textContent = meaning;
            
            // Ejemplo de uso
            const example = data.example || "";
            document.getElementById('wordExample').textContent = example ? `"${example}"` : "";
        } else {
            document.getElementById('wordMain').textContent = 'Nebula';
            document.getElementById('wordMeaning').textContent = 'Sigue aprendiendo cada día';
        }
    } catch (error) {
        console.error('Error fetching word of the day:', error);
        document.getElementById('wordMain').textContent = 'Keep Going';
        document.getElementById('wordMeaning').textContent = 'Conexión limitada para palabra del día';
    }
}

// Cargar datos iniciales
document.addEventListener('DOMContentLoaded', () => {
    updateFromFirebase();
    fetchWordOfTheDay();
});
