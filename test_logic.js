// Test Script for Correspondent Logic
let data = {
    cashBase: 1000000, // Initial Cash Base
    platforms: [
        { id: 1, name: 'Nequi', balance: 500000 },
        { id: 2, name: 'Daviplata', balance: 200000 }
    ],
    transactions: []
};

function processTransaction(type, pId, amount) {
    const platform = data.platforms.find(p => p.id === pId);
    if (!platform) return;

    if (type === 'retiro') {
        // Retiro: Client sends money to Platform (+), We give Cash (-)
        platform.balance += amount;
        data.cashBase -= amount;
    } else if (type === 'envio' || type === 'pago') {
        // Envio/Pago: Client gives Cash (+), We send from Platform (-)
        platform.balance -= amount;
        data.cashBase += amount;
    }
}

console.log("Initial State:", JSON.stringify(data));

// Test 1: Retiro from Nequi (Client takes 50k cash)
console.log("Test 1: Retiro $50,000 from Nequi");
processTransaction('retiro', 1, 50000);
// Expect: Nequi = 550,000, Base = 950,000
if (data.platforms[0].balance === 550000 && data.cashBase === 950000) {
    console.log("PASS");
} else {
    console.error("FAIL", data);
}

// Test 2: Envio from Daviplata (Client gives 20k cash)
console.log("Test 2: Envio $20,000 from Daviplata");
processTransaction('envio', 2, 20000);
// Expect: Daviplata = 180,000, Base = 970,000
if (data.platforms[1].balance === 180000 && data.cashBase === 970000) {
    console.log("PASS");
} else {
    console.error("FAIL", data);
}

// Test 3: Pago Recibo from Nequi (Client gives 100k cash)
console.log("Test 3: Pago $100,000 from Nequi");
processTransaction('pago', 1, 100000);
// Expect: Nequi = 450,000, Base = 1,070,000
if (data.platforms[0].balance === 450000 && data.cashBase === 1070000) {
    console.log("PASS");
} else {
    console.error("FAIL", data);
}
