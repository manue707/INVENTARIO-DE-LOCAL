// Local Inventory Management Logic with IndexedDB (Dexie.js)

// --- Database Setup ---
const db = new Dexie("InventoryDB");
db.version(1).stores({
    products: 'name, price, total_sold', // Primary key: name
    sales: '++id, product_name, quantity, price_at_sale, total, timestamp' // Auto-increment ID
});

// --- DOM Elements ---
const inputField = document.getElementById('venta-input');
const sendBtn = document.getElementById('btn-enviar');
const voiceBtn = document.getElementById('btn-voz');
const msgDisplay = document.getElementById('status-msg');
const statsContainer = document.getElementById('stats-container');
const resetBtn = document.getElementById('btn-reset');
const totalRevenueEl = document.getElementById('total-revenue');
const salesLogEl = document.getElementById('sales-log');

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

function formatCurrency(amount) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount);
}

// --- Migration Logic ---
async function migrateFromLocalStorage() {
    const localData = localStorage.getItem('myInventory');
    if (localData) {
        try {
            const oldInventory = JSON.parse(localData);
            const products = Object.keys(oldInventory);

            if (products.length > 0) {
                console.log("Migrating legacy data...", products);
                await db.transaction('rw', db.products, async () => {
                    for (const name of products) {
                        const count = oldInventory[name];
                        // check if exists
                        const existing = await db.products.get(name);
                        if (!existing) {
                            await db.products.add({ name: name, price: 0, total_sold: count });
                        }
                    }
                });
                showStatus("Datos migrados a la nueva base de datos", "success");
            }
            // Clear old data to prevent re-migration
            localStorage.removeItem('myInventory');
        } catch (e) {
            console.error("Migration failed", e);
        }
    }
}

// --- Core Logic: Text Parser ---
function parseCommand(text) {
    text = text.toLowerCase();

    // 1. Detect explicit price first (e.g., "a 5000", "por 5000")
    let explicitPrice = null;
    const priceMatch = text.match(/(?:a|por|valen|cuestan)\s*\$?(\d+)/);

    if (priceMatch) {
        explicitPrice = parseInt(priceMatch[1]);
        // Remove the price part from text to avoid confusion with quantity
        text = text.replace(priceMatch[0], '');
    }

    // 2. Detect Quantity
    let quantity = 1; // Default to 1 if no number found
    const quantityMatch = text.match(/(\d+)/);

    if (quantityMatch) {
        quantity = parseInt(quantityMatch[0]);
        text = text.replace(quantityMatch[0], ''); // Remove quantity
    }

    // 3. Cleanup to get Product Name
    let cleanText = text
        .replace(/vend[ií]/g, '')
        .replace('venta', '')
        .replace(' de ', '')
        .replace(/\s+/g, ' ') // Collapse multiple spaces
        .trim();

    if (cleanText.length < 2) return null;

    let product = cleanText;
    if (product.endsWith('s')) product = product.slice(0, -1);
    if (product.endsWith('es')) product = product.slice(0, -2);

    return { product, quantity, explicitPrice };
}

// --- Action: Register Sale ---
async function registerSale(text) {
    const result = parseCommand(text);

    if (!result) {
        showStatus("No entendí. Intenta: 'Vendí 2 gorras' o '1 gorra a 5000'", "error");
        return;
    }

    const { product, quantity, explicitPrice } = result;

    try {
        await db.transaction('rw', db.products, db.sales, async () => {
            // 1. Get or Create Product
            let item = await db.products.get(product);

            // Determine price to use
            let currentPrice = 0;
            if (item) {
                currentPrice = item.price;
            }

            // If user said a price, UPDATE/SET it immediately
            if (explicitPrice !== null) {
                currentPrice = explicitPrice;
                // Save this new price for the future
                if (item) {
                    await db.products.update(product, { price: explicitPrice });
                }
            }

            if (!item) {
                // New product
                item = { name: product, price: currentPrice, total_sold: 0 };
                await db.products.add(item);
                if (currentPrice === 0) {
                    showStatus(`Nuevo: "${product}". Toca la tarjeta para poner precio.`, "info");
                }
            }

            // 2. Calculate Total
            const saleTotal = currentPrice * quantity;

            // 3. Add to Sales History
            await db.sales.add({
                product_name: product,
                quantity: quantity,
                price_at_sale: currentPrice,
                total: saleTotal,
                timestamp: new Date()
            });

            // 4. Update Product Stock/Sold Count
            await db.products.update(product, {
                total_sold: item.total_sold + quantity
            });
        });

        // 5. Update UI
        showStatus(`Venta: ${quantity} ${product} (${formatCurrency(explicitPrice || 0)})`, "success");
        inputField.value = '';
        renderDashboard();
        renderHistory();

    } catch (err) {
        console.error(err);
        showStatus("Error al guardar venta", "error");
    }
}

// --- Update Price Action ---
async function updatePrice(productName) {
    const item = await db.products.get(productName);
    if (!item) return;

    const newPrice = prompt(`Precio para "${productName}" (actual: ${formatCurrency(item.price)}):`, item.price);

    if (newPrice !== null && !isNaN(newPrice)) {
        const priceVal = parseFloat(newPrice);

        await db.transaction('rw', db.products, db.sales, async () => {
            // 1. Update Product Price
            await db.products.update(productName, { price: priceVal });

            // 2. Update TODAY'S sales for this product to reflect new price
            const now = new Date();
            now.setHours(0, 0, 0, 0);

            const todaysSales = await db.sales
                .where('timestamp').above(now)
                .filter(sale => sale.product_name === productName)
                .toArray();

            for (const sale of todaysSales) {
                const newTotal = sale.quantity * priceVal;
                await db.sales.update(sale.id, {
                    price_at_sale: priceVal,
                    total: newTotal
                });
            }
        });

        showStatus(`Precio actualizado a ${formatCurrency(priceVal)}`, "success");
        renderDashboard();
        renderHistory();
    }
}

// --- UI: Render Dashboard ---
async function renderDashboard() {
    statsContainer.innerHTML = '';

    // Get all products, sort by total_sold desc
    const items = await db.products.orderBy('total_sold').reverse().toArray();

    if (items.length === 0) {
        statsContainer.innerHTML = '<div class="empty-state">No hay productos registrados.</div>';
        return;
    }

    items.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'stat-card';
        card.onclick = () => updatePrice(item.name); // Click to edit price
        card.style.cursor = 'pointer';
        card.title = "Toca para editar precio";

        const rank = index === 0 ? '#' : `#${index + 1}`;
        const priceDisplay = item.price === 0 ? '<span style="color:red;font-size:0.8em;">(Sin precio)</span>' : Object(formatCurrency(item.price));

        card.innerHTML = `
            <div class="stat-info">
                <span class="stat-rank">${rank}</span>
                <div style="display:flex; flex-direction:column;">
                    <span class="stat-name">${capitalize(item.name)}</span>
                    <span style="font-size: 0.8em; color: #888;">${priceDisplay} c/u</span>
                </div>
            </div>
            <span class="stat-count">${item.total_sold}</span>
        `;
        statsContainer.appendChild(card);
    });
}

// --- UI: Render History & Revenue ---
async function renderHistory() {
    // Get start of today
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Query sales from today
    const todaysSales = await db.sales.where('timestamp').above(now).reverse().toArray();

    // Calculate Total
    const totalToday = todaysSales.reduce((sum, sale) => sum + sale.total, 0);
    totalRevenueEl.textContent = formatCurrency(totalToday);

    // List Sales
    salesLogEl.innerHTML = '';
    if (todaysSales.length === 0) {
        salesLogEl.innerHTML = '<li class="empty-log">Nada vendido hoy aún.</li>';
        return;
    }

    todaysSales.forEach(sale => {
        const li = document.createElement('li');
        const time = sale.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        li.innerHTML = `
            <span>${time} - <b>${sale.quantity} ${capitalize(sale.product_name)}</b></span>
            <span>+${formatCurrency(sale.total)}</span>
        `;
        salesLogEl.appendChild(li);
    });
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

resetBtn.addEventListener('click', async () => {
    if (confirm("¿BORRAR TODO? Esto eliminará historial y productos.")) {
        await db.delete();
        window.location.reload();
    }
});

// --- Initialization ---
(async function init() {
    await migrateFromLocalStorage();
    await renderDashboard();
    await renderHistory();
})();

// --- Voice Logic ---
const sr = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
sr.lang = 'es-ES';

voiceBtn.onclick = () => {
    try {
        sr.start();
        voiceBtn.classList.add('active');
        showStatus("Escuchando...", "info");
    } catch (e) {
        console.error(e);
        showStatus("Error micrófono", "error");
    }
};

sr.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    inputField.value = transcript;
    voiceBtn.classList.remove('active');
    setTimeout(() => registerSale(transcript), 500);
};

sr.onend = () => {
    voiceBtn.classList.remove('active');
};