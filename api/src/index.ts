import { createApp } from "./app.js";
import { config } from "./config.js";
import { pool } from "./db.js";
import { seed } from "./seed.js";

async function main() {
  if (process.env.AUTO_SEED !== "0") {
    await seed();
  }
  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`kpop_c API http://localhost:${config.port}`);
  });
  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
