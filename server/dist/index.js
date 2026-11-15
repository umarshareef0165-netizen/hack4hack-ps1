"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("./db");
const app_1 = require("./app");
const PORT = Number(process.env.PORT ?? 4000);
async function main() {
    await (0, db_1.connectDb)();
    const app = (0, app_1.createApp)();
    app.listen(PORT, () => {
        console.log(`[server] hack4hack-ps1 API listening on http://localhost:${PORT}`);
        console.log(`[server] health: http://localhost:${PORT}/health`);
    });
}
main().catch((err) => {
    console.error('[server] fatal', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map