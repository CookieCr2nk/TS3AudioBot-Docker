import { randomBytes } from "node:crypto";
import { sha256 } from "./crypto.js";
import { HttpError, ValidationError } from "./errors.js";
import { parseBotLimit, parsePassword, parseUsername } from "./validate.js";

// 32 random bytes in base64url are 43 characters without padding.
export const INVITE_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_INVITE_DAYS = 7;

export function hashInviteToken(token) {
  return sha256(String(token));
}

export function newInviteToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashInviteToken(token) };
}

// Accepts the bare token or a pasted registration link.
export function parseInviteToken(value) {
  let text = String(value ?? "").trim();
  const fromLink = text.match(/[?&]token=([^&#\s]+)/);
  if (fromLink) {
    try {
      text = decodeURIComponent(fromLink[1]);
    } catch {
      text = "";
    }
  }
  if (!INVITE_TOKEN_RE.test(text)) throw new HttpError("This invite token is not valid.", 400);
  return text;
}

// revoked > used > expired > unusable (no instance left) > active
export function inviteState(invite, now = Date.now()) {
  if (invite.revokedAt) return "revoked";
  if (Number(invite.useCount) >= Number(invite.maxUses)) return "used";
  if (invite.expiresAt && new Date(invite.expiresAt).getTime() <= now) return "expired";
  if (!invite.instanceIds || invite.instanceIds.length === 0) return "unusable";
  return "active";
}

function truthy(value) {
  return value === true || value === "on" || value === "1" || value === "yes";
}

export function parseInviteLabel(value) {
  const label = String(value ?? "").trim();
  if (!label) return null;
  if (/[\r\n\0]/.test(label)) throw new ValidationError("{label} is invalid", { label: "Label" });
  if (label.length > 120) throw new ValidationError("Label is too long");
  return label;
}

export function parseInviteForm(body, knownInstanceIds, now = Date.now()) {
  const source = body || {};
  const label = parseInviteLabel(source.label);
  const instanceIds = [];
  for (const raw of Array.isArray(source.instanceIds) ? source.instanceIds : []) {
    const id = Number(raw);
    if (Number.isInteger(id) && id > 0 && knownInstanceIds.has(id) && !instanceIds.includes(id)) instanceIds.push(id);
  }
  if (!instanceIds.length) throw new ValidationError("Assign at least one instance");
  const daysText = String(source.expiresDays ?? "").trim();
  let expiresAt = null;
  if (daysText !== "never") {
    const days = daysText ? Number(daysText) : DEFAULT_INVITE_DAYS;
    if ((daysText && !/^\d+$/.test(daysText)) || days < 1 || days > 365) {
      throw new ValidationError("Expiry must be between 1 and 365 days");
    }
    expiresAt = new Date(now + days * DAY_MS);
  }
  const usesText = String(source.maxUses ?? "").trim();
  const maxUses = usesText ? Number(usesText) : 1;
  if ((usesText && !/^\d+$/.test(usesText)) || maxUses < 1 || maxUses > 1000) {
    throw new ValidationError("Uses must be between 1 and 1000");
  }
  return {
    label,
    instanceIds,
    expiresAt,
    maxUses,
    canCreateBots: truthy(source.canCreateBots),
    botLimit: parseBotLimit(source.botLimit),
  };
}

// The token is checked first, so a request without a valid token learns nothing about usernames.
export function parseRegistration(body) {
  const source = body || {};
  const token = parseInviteToken(source.token);
  const username = parseUsername(source.username);
  const password = parsePassword(source.password);
  if (password !== String(source.confirm ?? "")) throw new HttpError("The confirmation does not match.", 400);
  return { token, username, password };
}

// Picks fields explicitly. The hash never leaves the server.
export function presentInvite(invite, now = Date.now()) {
  return {
    id: invite.id,
    label: invite.label || "",
    createdByName: invite.createdByName || "",
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt || null,
    maxUses: Number(invite.maxUses),
    useCount: Number(invite.useCount),
    canCreateBots: Boolean(invite.canCreateBots),
    botLimit: invite.botLimit == null ? null : Number(invite.botLimit),
    instanceIds: [...(invite.instanceIds || [])],
    state: inviteState(invite, now),
  };
}

export function inviteAuditLabel({ id, label }) {
  return label ? `#${id} (${label})` : `#${id}`;
}
