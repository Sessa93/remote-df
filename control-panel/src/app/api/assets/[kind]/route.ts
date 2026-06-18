import { NextResponse } from "next/server";
import { listAssets, saveZipAsset, type AssetKind } from "@/lib/assets";

export const dynamic = "force-dynamic";
// Mod/tileset archives can be large; allow generous body parsing.
export const maxDuration = 60;

function asKind(k: string): AssetKind | null {
  return k === "mods" || k === "tilesets" ? k : null;
}

export async function GET(
  _req: Request,
  { params }: { params: { kind: string } },
) {
  const kind = asKind(params.kind);
  if (!kind) return NextResponse.json({ error: "Unknown kind" }, { status: 404 });
  try {
    return NextResponse.json({ assets: await listAssets(kind) });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: { kind: string } },
) {
  const kind = asKind(params.kind);
  if (!kind) return NextResponse.json({ error: "Unknown kind" }, { status: 404 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }
    const displayName = (form.get("name") as string | null) || undefined;
    const data = Buffer.from(await file.arrayBuffer());
    const asset = await saveZipAsset(kind, file.name, data, displayName);
    return NextResponse.json({ asset }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 400 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
