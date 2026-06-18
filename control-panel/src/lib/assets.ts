import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import AdmZip from "adm-zip";
import { config } from "./config";

export type AssetKind = "mods" | "tilesets";

export type Asset = {
  name: string;
  kind: AssetKind;
  sizeBytes: number;
  modifiedAt: number;
};

function kindDir(kind: AssetKind): string {
  return path.join(config.dataRoot, kind);
}

const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63}$/;

export async function listAssets(kind: AssetKind): Promise<Asset[]> {
  const dir = kindDir(kind);
  await fs.mkdir(dir, { recursive: true });
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const assets: Asset[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(dir, e.name);
    const st = await fs.stat(full);
    assets.push({
      name: e.name,
      kind,
      sizeBytes: await dirSize(full),
      modifiedAt: st.mtimeMs,
    });
  }
  return assets.sort((a, b) => a.name.localeCompare(b.name));
}

async function dirSize(dir: string): Promise<number> {
  let total = 0;
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) total += await dirSize(full);
    else total += (await fs.stat(full)).size;
  }
  return total;
}

// Store an uploaded asset. A .zip is extracted into a folder named after the
// upload (or the provided name); a single folder upload is stored as-is.
export async function saveZipAsset(
  kind: AssetKind,
  fileName: string,
  data: Buffer,
  displayName?: string,
): Promise<Asset> {
  const base = (displayName || fileName.replace(/\.zip$/i, "")).trim();
  if (!SAFE_NAME.test(base)) {
    throw new Error(
      "Asset name must be 1-64 chars of letters, digits, space, '.', '_' or '-'.",
    );
  }
  const dir = kindDir(kind);
  const dest = path.join(dir, base);
  await fs.mkdir(dir, { recursive: true });
  // Replace any prior asset of the same name.
  await fs.rm(dest, { recursive: true, force: true });
  await fs.mkdir(dest, { recursive: true });

  if (/\.zip$/i.test(fileName)) {
    const zip = new AdmZip(data);
    // Guard against zip-slip: every entry must resolve inside dest.
    for (const entry of zip.getEntries()) {
      const target = path.resolve(dest, entry.entryName);
      if (!target.startsWith(path.resolve(dest) + path.sep) && target !== path.resolve(dest)) {
        throw new Error(`Unsafe zip entry: ${entry.entryName}`);
      }
    }
    zip.extractAllTo(dest, true);
  } else {
    // Non-zip single file: drop it in the folder verbatim.
    await fs.writeFile(path.join(dest, path.basename(fileName)), data);
  }

  const st = await fs.stat(dest);
  return { name: base, kind, sizeBytes: await dirSize(dest), modifiedAt: st.mtimeMs };
}

export async function deleteAsset(kind: AssetKind, name: string): Promise<void> {
  const safe = path.basename(name);
  if (!SAFE_NAME.test(safe)) throw new Error("Invalid asset name.");
  await fs.rm(path.join(kindDir(kind), safe), { recursive: true, force: true });
}
