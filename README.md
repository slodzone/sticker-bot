import { NextRequest, NextResponse } from "next/server";
import { getPack, updatePackStickers, updatePackTitle } from "@/lib/packs";
import { addStickerToSet, deleteStickerFromSet, setStickerSetTitle, setStickerPositionInSet } from "@/lib/telegram";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { packId, pin, action } = body;

  if (!packId || !pin || !action) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const pack = await getPack(packId);
  if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  if (pack.pin !== pin) return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });

  try {
    if (action === "rename") {
      const { title } = body;
      await setStickerSetTitle(pack.telegramPackName, title);
      await updatePackTitle(packId, title);
      return NextResponse.json({ ok: true });
    }

    if (action === "delete") {
      const { fileUniqueId } = body;
      const sticker = pack.stickers.find((s) => s.fileUniqueId === fileUniqueId);
      if (!sticker) return NextResponse.json({ error: "Sticker not found" }, { status: 404 });
      await deleteStickerFromSet(sticker.fileId);
      const updated = pack.stickers.filter((s) => s.fileUniqueId !== fileUniqueId);
      await updatePackStickers(packId, updated);
      return NextResponse.json({ ok: true });
    }

    if (action === "reorder") {
      const { stickers } = body; // new ordered array of { fileId, fileUniqueId, emoji }
      for (let i = 0; i < stickers.length; i++) {
        await setStickerPositionInSet(stickers[i].fileId, i);
      }
      await updatePackStickers(packId, stickers);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Telegram API error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const packId = searchParams.get("packId");
  const pin = searchParams.get("pin");

  if (!packId || !pin) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  const pack = await getPack(packId);
  if (!pack) return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  if (pack.pin !== pin) return NextResponse.json({ error: "Invalid PIN" }, { status: 403 });

  return NextResponse.json({
    packId: pack.packId,
    title: pack.title,
    telegramPackName: pack.telegramPackName,
    stickers: pack.stickers,
  });
}
