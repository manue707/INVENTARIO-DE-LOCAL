// Local Inventory Management Logic

// Initialize inventory from localStorage or empty object
let inventory = JSON.parse(localStorage.getItem('myInventory')) || {};

// DOM Elements
const inputField = document.getElementById('venta-input');
const sendBtn = document.getElementById('btn-enviar');
const voiceBtn = document.getElementById('btn-voz');
const msgDisplay = document.getElementById('status-msg');
const statsContainer = document.getElementById('stats-container');
const resetBtn = document.getElementById('btn-reset');

// --- Core Logic: Text Parser ---
function parseCommand(text) {
    text = text.toLowerCase();

    // Check if it's a sale command
    // Patterns: "vendí 2 buzos", "venta de 1 gorra", "2 zapatillas"
    // We look for numbers and then strings.

    const numberMatch = text.match(/(\d+)/);
    if (!numberMatch) return null; // No quantity found

    const quantity = parseInt(numberMatch[0]);

    // Remove the number and common words to isolate the product name
    let cleanText = text.replace(quantity, '').replace('vendí', '').replace('vendi', '').replace('venta', '').replace('de', '').trim();

    // If text is empty/too short, ignore
    if (cleanText.length < 2) return null;

    // Simple singularization (naive approach for Spanish)
    // "buzos" -> "buzo", "zapatillas" -> "zapatilla"
    // This is optional but helps group items.
    let product = cleanText;
    if (product.endsWith('s')) product = product.slice(0, -1);
    if (product.endsWith('es')) product = product.slice(0, -2); // for cases like 'televisores' -> 'televisor'

    return { product: cleanText, quantity };
}

// --- Action: Register Sale ---
function registerSale(text) {
    const result = parseCommand(text);

    if (!result) {
        showStatus("⚠️ No entendí qué vendiste. Intenta: 'Vendí 2 gorras'", "error");
        return;
    }

    const { product, quantity } = result;

    // Update Inventory
    if (!inventory[product]) {
        inventory[product] = 0;
    }
    inventory[product] += quantity;

    // Save
    localStorage.setItem('myInventory', JSON.stringify(inventory));

    // Feedback
    showStatus(`✅ Registrado: ${quantity} ${product}`, "success");
    inputField.value = '';

    renderDashboard();
}

// --- UI: Render Dashboard ---
function renderDashboard() {
    statsContainer.innerHTML = '';

    // Convert object to array and sort by quantity (descending)
    const items = Object.keys(inventory).map(key => ({
        name: key,
        count: inventory[key]
    })).sort((a, b) => b.count - a.count);

    if (items.length === 0) {
        statsContainer.innerHTML = '<div class="empty-state">No hay ventas registradas.</div>';
        return;
    }

    items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        // Add a trophy for #1
        const rank = index === 0 ? '👑' : `#${index + 1}`;

        card.innerHTML = `
            <div class="stat-info">
                <span class="stat-rank">${rank}</span>
                <span class="stat-name">${capitalize(item.name)}</span>
            </div>
            <span class="stat-count">${item.count}</span>
        `;
        statsContainer.appendChild(card);
    });
}

// --- Helper Utilities ---
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function showStatus(msg, type) {
    msgDisplay.textContent = msg;
    msgDisplay.className = `status-msg ${type}`;
    setTimeout(() => {
        msgDisplay.textContent = '';
        msgDisplay.className = 'status-msg';
    }, 3000);
}

// --- Event Listeners ---
sendBtn.addEventListener('click', () => {
    if (inputField.value.trim()) {
        registerSale(inputField.value);
    }
});

inputField.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        registerSale(inputField.value);
    }
});

resetBtn.addEventListener('click', () => {
    if (confirm("¿Estás seguro de borrar todo el inventario?")) {
        inventory = {};
        localStorage.removeItem('myInventory');
        renderDashboard();
        showStatus("🗑️ Inventario borrado", "success");
    }
});

// --- Initial Render ---
renderDashboard();

// --- Voice Logic (Preserving User's idea) ---
const sr = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
sr.lang = 'es-ES'; // Set language to Spanish

voiceBtn.onclick = () => {
    try {
        sr.start();
        voiceBtn.classList.add('active');
        showStatus("🎤 Escuchando...", "info");
    } catch (e) {
        console.error(e);
        showStatus("⚠️ Error al activar micrófono", "error");
    }
};

sr.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    inputField.value = transcript;
    voiceBtn.classList.remove('active');

    // Auto-submit after voice
    setTimeout(() => registerSale(transcript), 500);
};

sr.onend = () => {
    voiceBtn.classList.remove('active');
    if (!inputField.value) showStatus("", "info"); // clear listening msg
};