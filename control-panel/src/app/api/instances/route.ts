import { NextResponse } from "next/server";
import { listInstances, spawnInstance } from "@/lib/docker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json({ instances: await listInstances() });
  } catch (err) {
    return NextResponse.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const instance = await spawnInstance({
      name: String(body.name || ""),
      edition: body.edition,
      geom: body.geom,
      mods: Array.isArray(body.mods) ? body.mods : [],
      tilesets: Array.isArray(body.tilesets) ? body.tilesets : [],
      autopause: body.autopause,
    });
    return NextResponse.json({ instance }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: errMsg(err) }, { status: 400 });
  }
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
