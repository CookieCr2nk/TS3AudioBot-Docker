import bcrypt from "bcryptjs";

const ROUNDS = 12;
const MAX_PASSWORD_BYTES = 72;
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
  const usable = Boolean(hash) && Buffer.byteLength(text) <= MAX_PASSWORD_BYTES;
  const known = usable ? hash : await dummy();
  // A longer password must not be compared. bcrypt would ignore everything after 72 bytes.
  const ok = await bcrypt.compare(usable ? text : "ts3panel-dummy-password", known);
  return usable && ok;
}
