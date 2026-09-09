import { hashPassword } from "../src/opsAuth.js";

const password = process.argv[2];
if (!password) {
  console.error("usage: npx tsx scripts/hash-ops-password.ts <password>");
  process.exit(1);
}
const hash = await hashPassword(password);
console.log(hash);
