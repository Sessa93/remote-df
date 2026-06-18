import { NextResponse } from "next/server";
import { startInstance, stopInstance, instanceLogs } from "@/lib/docker";

export const dynamic = "force-dynamic";

// POST /api/instances/:id/start | /stop ; GET .../logs
export async function POST(
  _req: Request,
  { params }: { params: { id: string; action: string } },
) {
  try {
    if (params.action === "start") await startInstance(params.id);
    else if (params.action === "stop") await stopInstance(params.id);
    else return NextResponse.json({ error: "Unknown action" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 400 });
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string; action: string } },
) {
  if (params.action !== "logs") {
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  }
  try {
    const text = await instanceLogs(params.id);
    return new NextResponse(text, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 400 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
