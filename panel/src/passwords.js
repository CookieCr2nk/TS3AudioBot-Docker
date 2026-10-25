import bcrypt from "bcryptjs";

const ROUNDS = 12;
let dummyHash = null;

export async function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password, hash) {
  if (!dummyHash) dummyHash = await bcrypt.hash("ts3panel-dummy-password", ROUNDS);
  if (!hash) {
    await bcrypt.compare(String(password), dummyHash);
    return false;
  }
  return bcrypt.compare(String(password), hash);
}
