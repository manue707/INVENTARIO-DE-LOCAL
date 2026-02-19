// Initial Data Structure
const initialData = {
    cashBase: 0,
    platforms: [
        { id: 1, name: 'PTM', balance: 0 },
        { id: 2, name: 'Platika', balance: 0 },
        { id: 3, name: 'Punto Red', balance: 0 },
        { id: 4, name: 'TuLlave', balance: 0 }
    ],
    transactions: []
};

// Global State
let data = JSON.parse(localStorage.getItem('corresponsalData')) || JSON.parse(JSON.stringify(initialData));

// Integrity check for TuLlave platform if it doesn't exist in saved data
if (data.platforms && !data.platforms.find(p => p.name === 'TuLlave')) {
    data.platforms.push({ id: 4, name: 'TuLlave', balance: 0 });
}
let isBatchEditing = false; // Persistent state for "Save All" mode
let editingTransactionId = null; // Track if we are editing a transaction

// Robust Number Parsing (Handles commas and dots)
function parseMoneyInput(val) {
    if (typeof val !== 'string') return parseFloat(val) || 0;
    // Remove currency symbols and spaces, replace comma with dot
    const clean = val.replace(/[$\s]/g, '').replace(',', '.');
    return parseFloat(clean) || 0;
}

// Format Money
function formatMoney(amount) {
    return '$' + amount.toFixed(2).replace(/\d(?=(\d{3})+\.)/g, '$&,');
}

// Update Persistence and Refresh UI
function updateData() {
    // Data Integrity Check
    if (!data.platforms || !Array.isArray(data.platforms)) data.platforms = JSON.parse(JSON.stringify(initialData)).platforms;
    if (!data.transactions || !Array.isArray(data.transactions)) data.transactions = [];
    if (typeof data.cashBase !== 'number') data.cashBase = 0;

    localStorage.setItem('corresponsalData', JSON.stringify(data));

    // Only refresh elements, don't trigger a full init if it resets editing state
    const cashBaseEl = document.getElementById('cash-base');
    const platformsTotalEl = document.getElementById('platforms-total');
    const grandTotalEl = document.getElementById('grand-total');

    if (cashBaseEl) cashBaseEl.innerText = formatMoney(data.cashBase);

    const platformsTotal = data.platforms.reduce((acc, p) => acc + p.balance, 0);
    if (platformsTotalEl) platformsTotalEl.innerText = formatMoney(platformsTotal);

    const grandTotal = data.cashBase + platformsTotal;
    if (grandTotalEl) grandTotalEl.innerText = formatMoney(grandTotal);

    renderPlatformOptions(); // Keep the dropdown sinked
    renderHistory();
}

// Render Platform Options
function renderPlatformOptions() {
    const platformSelect = document.getElementById('platform-select');
    if (!platformSelect) return;
    const currentVal = platformSelect.value;
    platformSelect.innerHTML = '';
    data.platforms.forEach(platform => {
        const option = document.createElement('option');
        option.value = platform.id;
        option.innerText = platform.name;
        platformSelect.appendChild(option);
    });
    if (currentVal && data.platforms.find(p => p.id == currentVal)) {
        platformSelect.value = currentVal;
    } else if (data.platforms.length > 0) {
        platformSelect.value = data.platforms[0].id;
    }
}

// Render History
function renderHistory() {
    const listRetiros = document.getElementById('list-retiros');
    const listEnvios = document.getElementById('list-envios');
    const listPagos = document.getElementById('list-pagos');

    if (!listRetiros || !listEnvios || !listPagos) return;

    listRetiros.innerHTML = '';
    listEnvios.innerHTML = '';
    listPagos.innerHTML = '';

    [...data.transactions].reverse().forEach(t => {
        const platform = data.platforms.find(pl => pl.id == t.platformId);
        let pName = platform ? platform.name : 'Unknown';

        // Clearer name for special transactions
        if (t.type === 'compra_tullave') {
            const tuLlave = data.platforms.find(p => p.id === 4 || p.name === 'TuLlave');
            pName = `${pName} ➡️ ${tuLlave ? tuLlave.name : 'TuLlave'}`;
        } else if (t.type === 'base_ingreso') {
            pName = `📥 Base (Ingreso)`;
        } else if (t.type === 'base_retiro') {
            pName = `📤 Base (Retiro)`;
        }

        const li = document.createElement('li');
        li.innerHTML = `
            <div style="flex: 1;">
                <strong>${pName}</strong>${t.text ? ' - ' + t.text : ''}
                <br><small>${new Date(t.date).toLocaleTimeString()}</small>
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="${t.amount > 0 ? 'amount-plus' : 'amount-minus'}">${formatMoney(Math.abs(t.amount))}</span>
                <div class="trans-actions">
                    <button class="btn-icon btn-edit-trans" onclick="editTransaction(${t.id})">✏️</button>
                    <button class="btn-icon btn-delete-trans" onclick="deleteTransaction(${t.id})">🗑️</button>
                </div>
            </div>
        `;
        if (t.type === 'retiro' || t.type === 'base_retiro') listRetiros.appendChild(li);
        else if (t.type === 'envio' || t.type === 'base_ingreso') listEnvios.appendChild(li);
        else if (t.type === 'pago' || t.type === 'recarga' || t.type === 'recarga_tullave' || t.type === 'compra_tullave') listPagos.appendChild(li);
    });
}

// Transaction Actions
window.deleteTransaction = (id) => {
    if (!confirm('¿Seguro que quieres eliminar esta transacción? Se revertirán los saldos.')) return;

    const index = data.transactions.findIndex(t => t.id === id);
    if (index === -1) return;

    const t = data.transactions[index];
    const platform = data.platforms.find(p => p.id === t.platformId);

    // REVERSE THE MATH
    if (t.type === 'retiro') {
        // Original: Platform +, Cash -
        if (platform) platform.balance -= t.amount;
        data.cashBase += t.amount;
    } else if (['envio', 'pago', 'recarga', 'recarga_tullave'].includes(t.type)) {
        // Original: Platform -, Cash +
        if (platform) platform.balance += t.amount;
        data.cashBase -= t.amount;
    } else if (t.type === 'compra_tullave') {
        // Original: Platika -, TL +
        if (platform) platform.balance += t.amount;
        const tuLlave = data.platforms.find(p => p.id === 4 || p.name === 'TuLlave');
        if (tuLlave) tuLlave.balance -= t.amount;
    } else if (t.type === 'base_ingreso') {
        data.cashBase -= t.amount;
    } else if (t.type === 'base_retiro') {
        data.cashBase += t.amount;
    }

    data.transactions.splice(index, 1);
    updateData();
    renderPlatforms();
};

// Edit Transaction
window.editTransaction = (id) => {
    const t = data.transactions.find(trans => trans.id === id);
    if (!t) return;

    editingTransactionId = id;

    // Fill the form
    document.getElementById('trans-type').value = t.type;
    document.getElementById('platform-select').value = t.platformId;
    document.getElementById('amount').value = t.amount;
    document.getElementById('text').value = t.text;

    // Change button text
    const submitBtn = document.querySelector('#form button[type="submit"]');
    if (submitBtn) {
        submitBtn.innerText = "Guardar Cambios";
        submitBtn.style.backgroundColor = "#27ae60";
    }

    // Scroll to form
    document.getElementById('form').scrollIntoView({ behavior: 'smooth' });
};

// Main Render Platforms Grid
function renderPlatforms(editId = null) {
    const platformsContainer = document.getElementById('platforms-container');
    if (!platformsContainer) return;

    platformsContainer.innerHTML = '';
    const isEditingAll = editId === 'all' || isBatchEditing;

    data.platforms.forEach(platform => {
        const div = document.createElement('div');
        div.classList.add('platform-card');

        const isEditingThis = platform.id === editId || isEditingAll;

        div.innerHTML = `
            <h4>${platform.name}</h4>
            ${isEditingThis ?
                `<input type="text" class="inline-edit-input platform-input" 
                    value="${platform.balance.toFixed(2)}" 
                    id="edit-input-${platform.id}" 
                    data-id="${platform.id}"
                    inputmode="decimal" style="width: 100%; font-size: 1.5rem; text-align: center; margin-bottom: 5px;">` :
                `<div class="p-balance">${formatMoney(platform.balance)}</div>`
            }
            <div class="card-actions">
                ${isEditingThis && !isEditingAll ?
                `<button class="btn-icon btn-save" onclick="saveBalance(${platform.id})">✅</button>
                     <button class="btn-icon btn-cancel" onclick="renderPlatforms()">❌</button>` :
                (!isEditingThis ?
                    `<button class="btn-icon btn-edit" onclick="editBalance(${platform.id})">✏️</button>
                         <button class="btn-icon btn-delete" onclick="deletePlatform(${platform.id})">🗑️</button>` :
                    '')
            }
            </div>
        `;
        platformsContainer.appendChild(div);

        if (isEditingThis) {
            const input = document.getElementById(`edit-input-${platform.id}`);
            setTimeout(() => { if (input) { input.focus(); input.select(); } }, 50);

            input.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') {
                    if (isEditingAll) {
                        const nextIndex = data.platforms.indexOf(platform) + 1;
                        if (nextIndex < data.platforms.length) {
                            const nextId = data.platforms[nextIndex].id;
                            const nextInput = document.getElementById(`edit-input-${nextId}`);
                            if (nextInput) { nextInput.focus(); nextInput.select(); }
                        } else {
                            saveAllBalances();
                        }
                    } else {
                        saveBalance(platform.id);
                    }
                }
                if (e.key === 'Escape') {
                    isBatchEditing = false;
                    renderPlatforms();
                }
            });
        }
    });
}

// Platform Actions (Exposed to Window)
window.editBalance = (id) => renderPlatforms(id);
window.deletePlatform = (id) => {
    if (confirm('¿Seguro que quieres eliminar esta plataforma?')) {
        data.platforms = data.platforms.filter(p => p.id !== id);
        updateData();
        renderPlatforms();
    }
};
window.saveBalance = (id) => {
    const input = document.getElementById(`edit-input-${id}`);
    const platform = data.platforms.find(p => p.id === id);
    if (platform && input) {
        platform.balance = parseMoneyInput(input.value);
    }
    updateData();
    renderPlatforms();
};

function saveAllBalances() {
    const inputs = document.querySelectorAll('.platform-input');
    inputs.forEach(input => {
        const id = parseInt(input.dataset.id);
        const p = data.platforms.find(pl => pl.id === id);
        if (p) p.balance = parseMoneyInput(input.value);
    });
    isBatchEditing = false;
    const btnSync = document.getElementById('btn-sync-balances');
    if (btnSync) {
        btnSync.innerText = "Sincronizar Saldos";
        btnSync.style.backgroundColor = "";
    }
    updateData();
    renderPlatforms();
    alert("¡Saldos actualizados!");
}

// Logic Initialization
document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form');
    const btnClear = document.getElementById('btn-clear');
    const btnSyncBalances = document.getElementById('btn-sync-balances');
    const btnEditBase = document.getElementById('btn-edit-base');
    const btnAddPlatform = document.getElementById('btn-add-platform');

    // Init App
    updateData();
    renderPlatforms();

    // Auto-select platform for TuLlave
    const transTypeSelect = document.getElementById('trans-type');
    const platformSelect = document.getElementById('platform-select');
    if (transTypeSelect && platformSelect) {
        transTypeSelect.addEventListener('change', () => {
            if (transTypeSelect.value === 'recarga_tullave') {
                const tuLlave = data.platforms.find(p => p.name === 'TuLlave');
                if (tuLlave) platformSelect.value = tuLlave.id;
            } else if (transTypeSelect.value === 'compra_tullave') {
                const puntoPago = data.platforms.find(p => p.name.toLowerCase().includes('platika'));
                if (puntoPago) platformSelect.value = puntoPago.id;
            }
        });
    }

    // Add Transaction
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const type = document.getElementById('trans-type').value;
            const pId = parseInt(document.getElementById('platform-select').value);
            const amountVal = parseMoneyInput(document.getElementById('amount').value);
            const desc = document.getElementById('text').value;

            if (!amountVal || !desc) return alert("Ingrese monto y descripción");

            // IF EDITING, REVERSE OLD IMPACT FIRST
            if (editingTransactionId) {
                const oldIndex = data.transactions.findIndex(t => t.id === editingTransactionId);
                if (oldIndex !== -1) {
                    const t = data.transactions[oldIndex];
                    const platform = data.platforms.find(p => p.id === t.platformId);

                    if (t.type === 'retiro') {
                        if (platform) platform.balance -= t.amount;
                        data.cashBase += t.amount;
                    } else if (['envio', 'pago', 'recarga', 'recarga_tullave'].includes(t.type)) {
                        if (platform) platform.balance += t.amount;
                        data.cashBase -= t.amount;
                    } else if (t.type === 'compra_tullave') {
                        if (platform) platform.balance += t.amount;
                        const tuLlave = data.platforms.find(p => p.name === 'TuLlave');
                        if (tuLlave) tuLlave.balance -= t.amount;
                    } else if (t.type === 'base_ingreso') {
                        data.cashBase -= t.amount;
                    } else if (t.type === 'base_retiro') {
                        data.cashBase += t.amount;
                    }
                    data.transactions.splice(oldIndex, 1);
                }
            }

            const platform = data.platforms.find(p => p.id === pId);

            if (type === 'retiro') {
                if (platform) platform.balance += amountVal;
                data.cashBase -= amountVal;
            } else if (['envio', 'pago', 'recarga', 'recarga_tullave'].includes(type)) {
                if (platform) platform.balance -= amountVal;
                data.cashBase += amountVal;
            } else if (type === 'compra_tullave') {
                // Platika (Selected) - , TuLlave +
                if (platform) platform.balance -= amountVal;
                const tuLlave = data.platforms.find(p => p.id === 4 || p.name === 'TuLlave');
                if (tuLlave) tuLlave.balance += amountVal;
            } else if (type === 'base_ingreso') {
                data.cashBase += amountVal;
            } else if (type === 'base_retiro') {
                data.cashBase -= amountVal;
            }

            data.transactions.push({ id: editingTransactionId || Date.now(), date: Date.now(), type, platformId: pId, amount: amountVal, text: desc });

            // Reset editing state
            editingTransactionId = null;
            const submitBtn = document.querySelector('#form button[type="submit"]');
            if (submitBtn) {
                submitBtn.innerText = "Registrar Transacción";
                submitBtn.style.backgroundColor = "";
            }

            updateData();
            renderPlatforms();
            document.getElementById('amount').value = '';
            document.getElementById('text').value = '';
        });
    }

    // Sync Button
    if (btnSyncBalances) {
        btnSyncBalances.addEventListener('click', () => {
            if (!isBatchEditing) {
                isBatchEditing = true;
                btnSyncBalances.innerText = "💾 GUARDAR TODO";
                btnSyncBalances.style.backgroundColor = "#27ae60";
                renderPlatforms('all');
            } else {
                saveAllBalances();
            }
        });
    }

    // Clear Data / New Day
    let clearConfirmMode = false;
    let clearTimer = null;
    if (btnClear) {
        btnClear.addEventListener('click', () => {
            if (!clearConfirmMode) {
                clearConfirmMode = true;
                btnClear.innerText = "⚠️ ¿ESTÁS SEGURO? CLIC PARA CONFIRMAR ⚠️";
                btnClear.style.backgroundColor = "#ff4d4d";
                clearTimer = setTimeout(() => {
                    clearConfirmMode = false;
                    btnClear.innerText = "Iniciar Nuevo Día (Borrar Historial)";
                    btnClear.style.backgroundColor = "";
                }, 5000);
                return;
            }
            clearConfirmMode = false;
            if (clearTimer) clearTimeout(clearTimer);
            btnClear.innerText = "Iniciar Nuevo Día (Borrar Historial)";
            btnClear.style.backgroundColor = "";

            data.transactions = [];
            data.cashBase = 0;
            data.platforms.forEach(p => p.balance = 0);
            updateData();

            setTimeout(() => {
                alert("✅ Día Reiniciado.\n\nEscribe los saldos iniciales y pulsa 'GUARDAR TODO'.");
                isBatchEditing = true;
                if (btnSyncBalances) {
                    btnSyncBalances.innerText = "💾 GUARDAR TODO";
                    btnSyncBalances.style.backgroundColor = "#27ae60";
                }
                renderPlatforms('all');
            }, 100);
        });
    }

    // Edit Base
    if (btnEditBase) {
        btnEditBase.addEventListener('click', () => {
            const cashBaseEl = document.getElementById('cash-base');
            const currentVal = data.cashBase;
            cashBaseEl.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <input type="text" class="inline-edit-input" value="${currentVal.toFixed(2)}" id="base-input" inputmode="decimal" style="font-size: 2.5rem; max-width: 250px;">
                    <button class="btn-icon" id="btn-save-base">✅</button>
                    <button class="btn-icon" id="btn-cancel-base">❌</button>
                </div>
            `;
            btnEditBase.style.display = 'none';
            const input = document.getElementById('base-input');
            input.focus();
            input.select();

            document.getElementById('btn-save-base').onclick = () => {
                data.cashBase = parseMoneyInput(input.value);
                updateData();
                btnEditBase.style.display = 'inline-block';
            };
            document.getElementById('btn-cancel-base').onclick = () => {
                updateData();
                btnEditBase.style.display = 'inline-block';
            };
            input.onkeyup = (e) => {
                if (e.key === 'Enter') document.getElementById('btn-save-base').click();
                if (e.key === 'Escape') document.getElementById('btn-cancel-base').click();
            };
        });
    }

    // New Platform
    if (btnAddPlatform) {
        btnAddPlatform.onclick = () => {
            const name = prompt("Nombre de la nueva plataforma:");
            if (name) {
                const bal = parseMoneyInput(prompt("Saldo inicial de " + name + ":", "0"));
                data.platforms.push({ id: Date.now(), name, balance: bal });
                updateData();
                renderPlatforms();
            }
        };
    }
});
