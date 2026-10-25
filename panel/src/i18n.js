import de from "./locales/de.js";

const CLIENT_MESSAGES = [
  "Action failed",
  "Nothing is playing.",
  "Paused",
  "Playing",
  "Empty",
  "Session expired",
  "Status unavailable",
  "Status unreachable",
  "Resume",
  "Pause",
];

export function applyParams(message, params) {
  const text = String(message ?? "");
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

function localizedParams(lang, params) {
  if (lang !== "de" || !params || params.label == null) return params;
  const label = String(params.label);
  if (!Object.prototype.hasOwnProperty.call(de, label)) return params;
  return { ...params, label: de[label] };
}

export function translate(lang, message, params) {
  const text = String(message ?? "");
  const template = lang === "de" && Object.prototype.hasOwnProperty.call(de, text) ? de[text] : text;
  return applyParams(template, localizedParams(lang, params));
}

export function translator(lang) {
  return (message, params) => translate(lang, message, params);
}

export function errorText(err, t) {
  const say = t || applyParams;
  if (!err) return say("Internal error");
  return say(err.message || "Internal error", err.params);
}

export function languageFromHeader(header) {
  let bestLang = "en";
  let bestQ = 0;
  let sawLanguage = false;
  for (const part of String(header || "").split(",")) {
    const [rawTag, ...rawParams] = part.trim().split(";");
    const tag = rawTag.trim().toLowerCase();
    if (!tag) continue;
    let q = 1;
    for (const raw of rawParams) {
      const [name, value] = raw.trim().split("=");
      if (name.trim() === "q") q = Number(value);
    }
    if (!Number.isFinite(q) || q <= 0) continue;
    const lang = tag === "de" || tag.startsWith("de-") ? "de" : tag === "en" || tag.startsWith("en-") ? "en" : null;
    if (!lang) continue;
    sawLanguage = true;
    if (q > bestQ) {
      bestLang = lang;
      bestQ = q;
    }
  }
  return sawLanguage ? bestLang : "en";
}

export function clientJson(lang) {
  const phrases = {};
  for (const message of CLIENT_MESSAGES) phrases[message] = translate(lang, message);
  return JSON.stringify(phrases).replace(/</g, "\\u003c");
}

export { de };
