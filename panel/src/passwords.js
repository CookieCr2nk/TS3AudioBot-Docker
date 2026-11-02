import bcrypt from "bcryptjs";

const ROUNDS = 12;
const MAX_PASSWORD = 200;
let dummyHash = null;
let dummyTask = null;

function dummy() {
  if (!dummyTask) {
    dummyTask = bcrypt.hash("ts3panel-dummy-password", ROUNDS).then((hash) => {
      dummyHash = hash;
      return hash;
    }).catch((error) => {
      dummyTask = null;
      throw error;
    });
  }
  return dummyHash ? Promise.resolve(dummyHash) : dummyTask;
}

void dummy();

export async function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password, hash) {
  const text = String(password);
  const usable = Boolean(hash) && text.length <= MAX_PASSWORD;
  const known = usable ? hash : await dummy();
  const ok = await bcrypt.compare(text.length > MAX_PASSWORD ? text.slice(0, 72) : text, known);
  return usable && ok;
}
