export function toFormBody(body = {}) {
  const out = { ...body };
  if (body.enabled === true || body.enabled === "1" || body.enabled === "on") out.enabled = "on";
  else delete out.enabled;
  if (body.clearToken === true || body.clearToken === "on") out.clearToken = "on";
  else delete out.clearToken;
  if (body.shared === true || body.shared === "1" || body.shared === "on") out.shared = "on";
  else delete out.shared;
  if (body.confirm === true || body.confirm === "on") out.confirm = "on";
  if (Array.isArray(body.grants)) {
    for (const grant of body.grants) {
      if (!grant || grant.userId == null) continue;
      out[`grant_${grant.userId}`] = "on";
      if (grant.canControl) out[`control_${grant.userId}`] = "on";
    }
  }
  return out;
}
