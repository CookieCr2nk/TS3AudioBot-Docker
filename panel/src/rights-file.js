import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const START = "# BEGIN ts3panel bot admins";
const END = "# END ts3panel bot admins";

export function renderAdminBlock(groups) {
  const lines = [START, "# Written by the panel. Full command rights for these TeamSpeak UIDs on one bot."];
  for (const group of groups) {
    if (!group.template || !group.uids?.length) continue;
    lines.push("[[rule]]");
    lines.push(`bot = ["${group.template}"]`);
    lines.push("[[rule.rule]]");
    lines.push(`useruid = [${group.uids.map((uid) => `"${uid}"`).join(", ")}]`);
    lines.push(`"+" = "*"`);
  }
  lines.push(END);
  return `${lines.join("\n")}\n`;
}

export function upsertAdminBlock(text, block) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (start >= 0 && end > start) {
    const after = end + END.length;
    return `${text.slice(0, start)}${block}${text.slice(after).replace(/^\r?\n/, "")}`;
  }
  return `${text.replace(/\s*$/, "\n\n")}${block}`;
}

export function rightsPath() {
  const root = process.env.BOT_DATA_DIR || "";
  if (!root) return "";
  return path.join(root, "rights.toml");
}

export async function writeAdminBlock(groups) {
  const file = rightsPath();
  if (!file) {
    const error = new Error("missing-volume");
    error.code = "missing-volume";
    throw error;
  }
  const current = await readFile(file, "utf8");
  const next = upsertAdminBlock(current, renderAdminBlock(groups));
  const temporary = `${file}.panel-tmp`;
  await writeFile(temporary, next, "utf8");
  await rename(temporary, file);
}
