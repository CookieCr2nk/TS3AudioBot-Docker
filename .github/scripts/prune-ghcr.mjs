import { pathToFileURL } from "node:url";

const PROTECTED_TAG = /^(?:main|develop|master|latest)$|^v?[0-9]+\.[0-9]+\.[0-9]+$/;
const SHA_TAG = /^sha-[0-9a-f]{7,}$/;
const SIGNATURE_TAG = /^sha256-([0-9a-f]+)\.(?:sig|att)$/;

export function planRetention(versions, { keepSha = 3, childDigests = new Set(), untaggedSafe = true } = {}) {
  const kept = new Set();
  const shaOnly = [];

  for (const version of versions) {
    const tags = version.tags ?? [];
    if (tags.some((tag) => PROTECTED_TAG.test(tag))) kept.add(version.id);
    else if (tags.length > 0 && tags.every((tag) => SHA_TAG.test(tag))) shaOnly.push(version);
  }

  shaOnly.sort((left, right) => {
    const byTime = Date.parse(right.createdAt) - Date.parse(left.createdAt);
    if (byTime !== 0 && Number.isFinite(byTime)) return byTime;
    return right.id - left.id;
  });
  for (const version of shaOnly.slice(0, keepSha)) kept.add(version.id);

  const keptDigests = new Set(childDigests);
  for (const version of versions) {
    if (kept.has(version.id) && String(version.name).startsWith("sha256:")) keptDigests.add(version.name);
  }

  const deleteIds = [];
  for (const version of versions) {
    if (kept.has(version.id)) continue;
    if (String(version.name).startsWith("sha256:") && keptDigests.has(version.name)) continue;
    const tags = version.tags ?? [];
    if (tags.length === 0) {
      if (untaggedSafe) deleteIds.push(version.id);
      continue;
    }
    if (!tags.every((tag) => SHA_TAG.test(tag) || SIGNATURE_TAG.test(tag))) continue;
    const signatures = tags.map((tag) => tag.match(SIGNATURE_TAG)).filter(Boolean);
    if (signatures.length === tags.length) {
      const stillNeeded = signatures.some((match) => keptDigests.has(`sha256:${match[1]}`));
      if (!stillNeeded) deleteIds.push(version.id);
      continue;
    }
    deleteIds.push(version.id);
  }

  return deleteIds;
}

function nextLink(header) {
  if (!header) return null;
  for (const part of header.split(",")) {
    const match = part.match(/<([^>]+)>;\s*rel="next"/);
    if (match) return match[1];
  }
  return null;
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "ts3audiobot-prune",
  };
}

export async function listVersions(owner, image, token, fetchImpl = fetch) {
  const versions = [];
  let url = `https://api.github.com/users/${owner}/packages/container/${encodeURIComponent(image)}/versions?per_page=100`;
  while (url) {
    const response = await fetchImpl(url, { headers: githubHeaders(token) });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`listing ${image} failed with HTTP ${response.status}`);
    const page = await response.json();
    for (const item of page) {
      versions.push({
        id: item.id,
        name: item.name,
        tags: item.metadata?.container?.tags ?? [],
        createdAt: item.created_at,
      });
    }
    url = nextLink(response.headers.get("link"));
  }
  return versions;
}

async function registryToken(owner, image, token, fetchImpl) {
  const scope = `repository:${owner.toLowerCase()}/${image}:pull`;
  const url = `https://ghcr.io/token?service=ghcr.io&scope=${encodeURIComponent(scope)}`;
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return null;
  const body = await response.json();
  return body.token || null;
}

export async function manifestDigests(owner, image, reference, token, fetchImpl = fetch) {
  const url = `https://ghcr.io/v2/${owner.toLowerCase()}/${image}/manifests/${reference}`;
  const accept = [
    "application/vnd.oci.image.index.v1+json",
    "application/vnd.docker.distribution.manifest.list.v2+json",
    "application/vnd.oci.image.manifest.v1+json",
    "application/vnd.docker.distribution.manifest.v2+json",
  ].join(", ");
  let response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: accept } });
  if (response.status === 401 || response.status === 403) {
    const registry = await registryToken(owner, image, token, fetchImpl);
    if (!registry) return null;
    response = await fetchImpl(url, { headers: { Authorization: `Bearer ${registry}`, Accept: accept } });
  }
  if (!response.ok) return null;
  const body = await response.json();
  // A platform manifest has no child list. Returning null keeps every untagged
  // version, so a multi-arch image is not broken by a partial read.
  if (!Array.isArray(body.manifests)) return null;
  return body.manifests.map((manifest) => manifest.digest).filter((digest) => typeof digest === "string");
}

export async function pruneImages({ owner, images, token, keepSha = 3, fetchImpl = fetch, dryRun = false }) {
  const deleted = [];
  for (const image of images) {
    const versions = await listVersions(owner, image, token, fetchImpl);
    if (!versions) {
      console.log(`skip ${image}: package not found`);
      continue;
    }
    const childDigests = new Set();
    let untaggedSafe = true;
    const preview = planRetention(versions, { keepSha, untaggedSafe: true });
    const kept = new Set(versions.map((version) => version.id).filter((id) => !preview.includes(id)));
    for (const version of versions) {
      if (!kept.has(version.id)) continue;
      const tags = version.tags ?? [];
      if (!tags.some((tag) => PROTECTED_TAG.test(tag) || SHA_TAG.test(tag))) continue;
      const reference = tags.find((tag) => PROTECTED_TAG.test(tag) || SHA_TAG.test(tag));
      if (!reference) continue;
      const digests = await manifestDigests(owner, image, reference, token, fetchImpl);
      if (!digests) {
        untaggedSafe = false;
        console.log(`keep untagged ${image}: manifest ${reference} could not be read`);
        break;
      }
      for (const digest of digests) childDigests.add(digest);
    }
    const deleteIds = planRetention(versions, { keepSha, childDigests, untaggedSafe });
    for (const id of deleteIds) {
      const version = versions.find((item) => item.id === id);
      const label = version?.tags?.length ? version.tags.join(",") : "(untagged)";
      console.log(`${dryRun ? "would delete" : "delete"} ${image} ${id} ${label}`);
      if (!dryRun) {
        const response = await fetchImpl(
          `https://api.github.com/users/${owner}/packages/container/${encodeURIComponent(image)}/versions/${id}`,
          { method: "DELETE", headers: githubHeaders(token) },
        );
        if (!response.ok && response.status !== 404) {
          throw new Error(`deleting ${image} version ${id} failed with HTTP ${response.status}`);
        }
      }
      deleted.push(`${image}:${id}`);
    }
  }
  return deleted;
}

function imagesFromEnv() {
  if (process.env.IMAGE_NAMES) return process.env.IMAGE_NAMES.split(/\s+/).filter(Boolean);
  const repo = (process.env.GITHUB_REPOSITORY || "").split("/")[1] || "";
  const name = repo.toLowerCase();
  if (!name) throw new Error("GITHUB_REPOSITORY or IMAGE_NAMES is required");
  return [name, `${name}-panel`];
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  if (!token || !owner) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY_OWNER are required");
  const keepSha = Number(process.env.KEEP_SHA ?? 3);
  if (!Number.isInteger(keepSha) || keepSha < 0 || keepSha > 20) throw new Error("KEEP_SHA must be an integer from 0 to 20");
  const deleted = await pruneImages({
    owner,
    images: imagesFromEnv(),
    token,
    keepSha,
    dryRun: process.env.DRY_RUN === "1",
  });
  console.log(`removed ${deleted.length} package version(s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
