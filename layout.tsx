import { db } from "./firebase";

export interface StickerPack {
  packId: string;
  telegramPackName: string;
  title: string;
  ownerId: number;
  pin: string;
  stickers: { fileId: string; fileUniqueId: string; emoji: string }[];
  createdAt: number;
}

export async function createPack(data: Omit<StickerPack, "createdAt">) {
  await db
    .collection("packs")
    .doc(data.packId)
    .set({ ...data, createdAt: Date.now() });
}

export async function getPack(packId: string): Promise<StickerPack | null> {
  const doc = await db.collection("packs").doc(packId).get();
  if (!doc.exists) return null;
  return doc.data() as StickerPack;
}

export async function getPackByOwner(ownerId: number): Promise<StickerPack[]> {
  const snap = await db
    .collection("packs")
    .where("ownerId", "==", ownerId)
    .get();
  return snap.docs.map((d) => d.data() as StickerPack);
}

export async function updatePackStickers(
  packId: string,
  stickers: StickerPack["stickers"]
) {
  await db.collection("packs").doc(packId).update({ stickers });
}

export async function updatePackTitle(packId: string, title: string) {
  await db.collection("packs").doc(packId).update({ title });
}

export function generatePackId() {
  return Math.random().toString(36).slice(2, 10);
}

export function generatePin() {
  return Math.floor(1000 + Math.random() * 9000).toString();
}
