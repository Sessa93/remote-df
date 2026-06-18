import { NextResponse } from "next/server";
import { deleteAsset, type AssetKind } from "@/lib/assets";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { kind: string; name: string } },
) {
  const kind = params.kind;
  if (kind !== "mods" && kind !== "tilesets") {
    return NextResponse.json({ error: "Unknown kind" }, { status: 404 });
  }
  try {
    await deleteAsset(kind as AssetKind, decodeURIComponent(params.name));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 400 },
    );
  }
}
