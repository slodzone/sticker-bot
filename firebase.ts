const BASE = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

async function call(method: string, body: object) {
  const res = await fetch(`${BASE}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram error: ${JSON.stringify(data)}`);
  return data.result;
}

export async function sendMessage(chatId: number, text: string) {
  return call("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

export async function createNewStickerSet(
  userId: number,
  name: string,
  title: string,
  sticker: { sticker: string; emoji_list: string[] }
) {
  return call("createNewStickerSet", {
    user_id: userId,
    name,
    title,
    stickers: [sticker],
    sticker_format: "static",
  });
}

export async function addStickerToSet(
  userId: number,
  name: string,
  sticker: { sticker: string; emoji_list: string[] }
) {
  return call("addStickerToSet", { user_id: userId, name, sticker });
}

export async function deleteStickerFromSet(fileUniqueId: string) {
  return call("deleteStickerFromSet", { sticker: fileUniqueId });
}

export async function setStickerSetTitle(name: string, title: string) {
  return call("setStickerSetTitle", { name, title });
}

export async function setStickerPositionInSet(sticker: string, position: number) {
  return call("setStickerPositionInSet", { sticker, position });
}

export async function getStickerSet(name: string) {
  return call("getStickerSet", { name });
}
