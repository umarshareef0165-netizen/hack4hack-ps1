"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addClient = addClient;
exports.removeClient = removeClient;
exports.broadcast = broadcast;
exports.clientCount = clientCount;
const clients = new Set();
function addClient(res) {
    clients.add(res);
}
function removeClient(res) {
    clients.delete(res);
}
function broadcast(event) {
    const payload = JSON.stringify({ ...event, at: new Date().toISOString() });
    for (const res of clients) {
        res.write(`data: ${payload}\n\n`);
    }
}
function clientCount() {
    return clients.size;
}
//# sourceMappingURL=events.js.map