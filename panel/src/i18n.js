import de from "./locales/de.js";

// English is the source language and has no catalog.
// A new translation is a file in locales/ plus one entry in `languages` and `catalogs`.
export const SOURCE_LANG = "en";
export const LANG_COOKIE = "ts3panel-lang";

export const catalogs = {
  de,
};

export const languages = [
  { id: "en", name: "English", locale: "en-GB" },
  { id: "de", name: "Deutsch", locale: "de-DE" },
];

export function applyParams(message, params) {
  const text = String(message ?? "");
  if (!params) return text;
  return text.replace(/\{([A-Za-z0-9_]+)\}/g, (match, key) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function matchLanguage(tag) {
  const value = String(tag || "").trim().toLowerCase();
  if (!value || value === "*") return null;
  if (value === SOURCE_LANG || value.startsWith(`${SOURCE_LANG}-`)) return SOURCE_LANG;
  if (Object.prototype.hasOwnProperty.call(catalogs, value)) return value;
  const base = value.split("-")[0];
  if (Object.prototype.hasOwnProperty.call(catalogs, base)) return base;
  return null;
}

export function languageChoice(raw) {
  const value = String(raw || "").trim().toLowerCase();
  if (!value || value === "auto") return "auto";
  return matchLanguage(value) || "auto";
}

export function languageFromHeader(header) {
  let bestLang = SOURCE_LANG;
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
    const lang = matchLanguage(tag);
    if (!lang) continue;
    sawLanguage = true;
    if (q > bestQ) {
      bestLang = lang;
      bestQ = q;
    }
  }
  return sawLanguage ? bestLang : SOURCE_LANG;
}

export function resolveLanguage(header, choice) {
  const picked = languageChoice(choice);
  if (picked !== "auto") return picked;
  return languageFromHeader(header);
}

export function phrasesFor(lang) {
  return catalogs[lang] || {};
}

function localizedParams(lang, params) {
  const catalog = catalogs[lang];
  if (!catalog || !params || params.label == null) return params;
  const label = String(params.label);
  if (!Object.prototype.hasOwnProperty.call(catalog, label)) return params;
  return { ...params, label: catalog[label] };
}

export function translate(lang, message, params) {
  const text = String(message ?? "");
  const catalog = catalogs[lang];
  const template = catalog && Object.prototype.hasOwnProperty.call(catalog, text) ? catalog[text] : text;
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

export function applyRequestLanguage(req, res) {
  const choice = languageChoice(req.cookies?.[LANG_COOKIE]);
  req.langChoice = choice;
  req.lang = resolveLanguage(req.get("accept-language"), choice);
  req.t = translator(req.lang);
  if (res) res.set("Vary", "Accept-Language, Cookie");
}

export { de };
