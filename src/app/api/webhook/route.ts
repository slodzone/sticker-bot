import { NextRequest, NextResponse } from "next/server";
import { sendMessage, createNewStickerSet, addStickerToSet, deleteStickerFromSet, setStickerSetTitle } from "@/lib/telegram";
import { createPack, getPack, getPackByOwner, updatePackStickers, updatePackTitle, generatePackId, generatePin } from "@/lib/packs";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL!;
const BOT_USERNAME = process.env.BOT_USERNAME!;

const awaitingTitle: Record<number, boolean> = {};
const awaitingSticker: Record<number, string> = {};
const awaitingEmoji: Record<number, string> = {};
const awaitingDeleteChoice: Record<number, string> = {};
const awaitingRename: Record<number, string> = {};
const awaitingJoinPin: Record<number, boolean> = {};
const awaitingJoinPackId: Record<number, string> = {}; // userId → packId after pin check

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  if (secret !== process.env.WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const update = await req.json();
  const msg = update.message;
  if (!msg) return NextResponse.json({ ok: true });

  const chatId: number = msg.chat.id;
  const userId: number = msg.from.id;
  const text: string = msg.text || "";

  try {
    if (text === "/start") {
      await sendMessage(chatId,
        `👋 <b>Welcome to StickerCollab Bot!</b>\n\n` +
        `Here's what I can do:\n` +
        `/newpack — Create a new sticker pack\n` +
        `/mypacks — List your packs\n` +
        `/addsticker — Add a sticker to your pack\n` +
        `/deletesticker — Remove a sticker\n` +
        `/renamepack — Rename your pack\n` +
        `/sharepack — Get the collaboration link\n` +
        `/join — Join someone's pack with a link + PIN\n\n` +
        `Start with /newpack 🎨`
      );
      return NextResponse.json({ ok: true });
    }

    // ── /join ─────────────────────────────────────────────────────────────────
    if (text.startsWith("/join")) {
      // Support both "/join" and "/join_<packId>"
      const parts = text.split("_");
      if (parts.length > 1) {
        const packId = parts.slice(1).join("_");
        const pack = await getPack(packId);
        if (!pack) { await sendMessage(chatId, "Pack not found. Check the link."); return NextResponse.json({ ok: true }); }
        awaitingJoinPin[userId] = true;
        awaitingJoinPackId[userId] = packId;
        await sendMessage(chatId, `🔐 Send me the 4-digit PIN to join "<b>${pack.title}</b>":`);
      } else {
        await sendMessage(chatId, `To join a pack, use the link shared with you.\n\nIt looks like:\n${BASE_URL}/pack/XXXXXXXX\n\nOr ask the owner to share /join_PACKID and the PIN.`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── Awaiting join PIN ─────────────────────────────────────────────────────
    if (awaitingJoinPin[userId] && !text.startsWith("/")) {
      const packId = awaitingJoinPackId[userId];
      const pack = await getPack(packId);
      if (!pack) { await sendMessage(chatId, "Pack not found."); delete awaitingJoinPin[userId]; return NextResponse.json({ ok: true }); }

      if (pack.pin !== text.trim()) {
        await sendMessage(chatId, "❌ Wrong PIN. Try again or use /join again.");
        delete awaitingJoinPin[userId];
        return NextResponse.json({ ok: true });
      }

      delete awaitingJoinPin[userId];
      // Store that this user can add to this pack
      awaitingSticker[userId] = JSON.stringify({ packId: pack.packId, packName: pack.telegramPackName, isNew: false, ownerId: pack.ownerId });
      await sendMessage(chatId,
        `✅ PIN correct! You joined "<b>${pack.title}</b>"!\n\n` +
        `📎 Send me a sticker image to add it to the pack:`
      );
      return NextResponse.json({ ok: true });
    }

    // ── /newpack ──────────────────────────────────────────────────────────────
    if (text === "/newpack") {
      awaitingTitle[userId] = true;
      await sendMessage(chatId, "📝 What should the sticker pack be called? Send me the title:");
      return NextResponse.json({ ok: true });
    }

    if (awaitingTitle[userId] && !text.startsWith("/")) {
      delete awaitingTitle[userId];
      const title = text.trim().slice(0, 64);
      const packId = generatePackId();
      const pin = generatePin();
      const packName = `pack_${packId}_by_${BOT_USERNAME}`;
      await sendMessage(chatId, `⏳ Creating your sticker pack "<b>${title}</b>"...\n\nSend me the <b>first sticker</b> image (PNG or WebP):`);
      awaitingSticker[userId] = JSON.stringify({ packId, packName, title, pin, isNew: true, ownerId: userId });
      return NextResponse.json({ ok: true });
    }

    // ── /addsticker ───────────────────────────────────────────────────────────
    if (text === "/addsticker") {
      const packs = await getPackByOwner(userId);
      if (packs.length === 0) {
        await sendMessage(chatId, "You have no packs yet.\n\nUse /newpack to create one, or /join to join someone else's pack.");
        return NextResponse.json({ ok: true });
      }
      if (packs.length === 1) {
        awaitingSticker[userId] = JSON.stringify({ packId: packs[0].packId, packName: packs[0].telegramPackName, isNew: false, ownerId: userId });
        await sendMessage(chatId, `📎 Send me the sticker image to add to "<b>${packs[0].title}</b>":`);
      } else {
        const list = packs.map((p, i) => `${i + 1}. ${p.title} — /addto_${p.packId}`).join("\n");
        await sendMessage(chatId, `Which pack?\n\n${list}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/addto_")) {
      const packId = text.replace("/addto_", "").trim();
      const pack = await getPack(packId);
      if (!pack || pack.ownerId !== userId) { await sendMessage(chatId, "Pack not found."); return NextResponse.json({ ok: true }); }
      awaitingSticker[userId] = JSON.stringify({ packId: pack.packId, packName: pack.telegramPackName, isNew: false, ownerId: userId });
      await sendMessage(chatId, `📎 Send me the sticker image to add to "<b>${pack.title}</b>":`);
      return NextResponse.json({ ok: true });
    }

    // ── Received sticker image ────────────────────────────────────────────────
    if (awaitingSticker[userId] && (msg.photo || msg.document || msg.sticker)) {
      const ctx = JSON.parse(awaitingSticker[userId]);
      delete awaitingSticker[userId];

      let fileId: string;
      let fileUniqueId: string;

      if (msg.sticker) {
        fileId = msg.sticker.file_id;
        fileUniqueId = msg.sticker.file_unique_id;
      } else if (msg.document) {
        fileId = msg.document.file_id;
        fileUniqueId = msg.document.file_unique_id;
      } else {
        const largest = msg.photo[msg.photo.length - 1];
        fileId = largest.file_id;
        fileUniqueId = largest.file_unique_id;
      }

      awaitingEmoji[userId] = JSON.stringify({ ...ctx, fileId, fileUniqueId });
      await sendMessage(chatId, "Which emoji should represent this sticker? Send one emoji 👇");
      return NextResponse.json({ ok: true });
    }

    // ── Received emoji ────────────────────────────────────────────────────────
    if (awaitingEmoji[userId] && !text.startsWith("/")) {
      const ctx = JSON.parse(awaitingEmoji[userId]);
      delete awaitingEmoji[userId];

      const emoji = text.trim();
      const stickerObj = { sticker: ctx.fileId, emoji_list: [emoji] };

      if (ctx.isNew) {
        await createNewStickerSet(ctx.ownerId, ctx.packName, ctx.title, stickerObj);
        await createPack({
          packId: ctx.packId,
          telegramPackName: ctx.packName,
          title: ctx.title,
          ownerId: ctx.ownerId,
          pin: ctx.pin,
          stickers: [{ fileId: ctx.fileId, fileUniqueId: ctx.fileUniqueId, emoji }],
        });
        await sendMessage(chatId,
          `✅ Pack "<b>${ctx.title}</b>" created!\n\n` +
          `🔗 Share link: ${BASE_URL}/pack/${ctx.packId}\n` +
          `🔑 PIN: <b>${ctx.pin}</b>\n\n` +
          `Share the link + PIN with collaborators!\n\n` +
          `View your pack: t.me/addstickers/${ctx.packName}`
        );
      } else {
        const pack = await getPack(ctx.packId);
        if (!pack) { await sendMessage(chatId, "Pack not found."); return NextResponse.json({ ok: true }); }
        // Use ownerId for Telegram API (pack belongs to owner)
        await addStickerToSet(pack.ownerId, ctx.packName, stickerObj);
        const updated = [...pack.stickers, { fileId: ctx.fileId, fileUniqueId: ctx.fileUniqueId, emoji }];
        await updatePackStickers(ctx.packId, updated);
        await sendMessage(chatId, `✅ Sticker added to "<b>${pack.title}</b>"!`);
      }
      return NextResponse.json({ ok: true });
    }

    // ── /deletesticker ────────────────────────────────────────────────────────
    if (text === "/deletesticker") {
      const packs = await getPackByOwner(userId);
      if (packs.length === 0) { await sendMessage(chatId, "You have no packs."); return NextResponse.json({ ok: true }); }
      if (packs.length === 1) {
        awaitingDeleteChoice[userId] = packs[0].packId;
        const list = packs[0].stickers.map((s, i) => `${i + 1}. ${s.emoji} — /del_${s.fileUniqueId}`).join("\n");
        await sendMessage(chatId, `Which sticker to delete from "<b>${packs[0].title}</b>"?\n\n${list || "No stickers yet."}`);
      } else {
        const list = packs.map((p, i) => `${i + 1}. ${p.title} — /deletefrom_${p.packId}`).join("\n");
        await sendMessage(chatId, `Which pack?\n\n${list}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/deletefrom_")) {
      const packId = text.replace("/deletefrom_", "").trim();
      const pack = await getPack(packId);
      if (!pack || pack.ownerId !== userId) { await sendMessage(chatId, "Pack not found."); return NextResponse.json({ ok: true }); }
      awaitingDeleteChoice[userId] = packId;
      const list = pack.stickers.map((s, i) => `${i + 1}. ${s.emoji} — /del_${s.fileUniqueId}`).join("\n");
      await sendMessage(chatId, `Which sticker to delete?\n\n${list || "No stickers yet."}`);
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/del_")) {
      const fileUniqueId = text.replace("/del_", "").trim();
      const packId = awaitingDeleteChoice[userId];
      if (!packId) { await sendMessage(chatId, "Please use /deletesticker first."); return NextResponse.json({ ok: true }); }
      delete awaitingDeleteChoice[userId];
      const pack = await getPack(packId);
      if (!pack) { await sendMessage(chatId, "Pack not found."); return NextResponse.json({ ok: true }); }
      const sticker = pack.stickers.find((s) => s.fileUniqueId === fileUniqueId);
      if (!sticker) { await sendMessage(chatId, "Sticker not found."); return NextResponse.json({ ok: true }); }
      await deleteStickerFromSet(sticker.fileId);
      const updated = pack.stickers.filter((s) => s.fileUniqueId !== fileUniqueId);
      await updatePackStickers(packId, updated);
      await sendMessage(chatId, "🗑️ Sticker deleted!");
      return NextResponse.json({ ok: true });
    }

    // ── /renamepack ───────────────────────────────────────────────────────────
    if (text === "/renamepack") {
      const packs = await getPackByOwner(userId);
      if (packs.length === 0) { await sendMessage(chatId, "You have no packs."); return NextResponse.json({ ok: true }); }
      if (packs.length === 1) {
        awaitingRename[userId] = packs[0].packId;
        await sendMessage(chatId, `✏️ Send me the new name for "<b>${packs[0].title}</b>":`);
      } else {
        const list = packs.map((p, i) => `${i + 1}. ${p.title} — /renamethis_${p.packId}`).join("\n");
        await sendMessage(chatId, `Which pack to rename?\n\n${list}`);
      }
      return NextResponse.json({ ok: true });
    }

    if (text.startsWith("/renamethis_")) {
      const packId = text.replace("/renamethis_", "").trim();
      const pack = await getPack(packId);
      if (!pack || pack.ownerId !== userId) { await sendMessage(chatId, "Pack not found."); return NextResponse.json({ ok: true }); }
      awaitingRename[userId] = packId;
      await sendMessage(chatId, `✏️ Send me the new name for "<b>${pack.title}</b>":`);
      return NextResponse.json({ ok: true });
    }

    if (awaitingRename[userId] && !text.startsWith("/")) {
      const packId = awaitingRename[userId];
      delete awaitingRename[userId];
      const newTitle = text.trim().slice(0, 64);
      const pack = await getPack(packId);
      if (!pack) { await sendMessage(chatId, "Pack not found."); return NextResponse.json({ ok: true }); }
      await setStickerSetTitle(pack.telegramPackName, newTitle);
      await updatePackTitle(packId, newTitle);
      await sendMessage(chatId, `✅ Pack renamed to "<b>${newTitle}</b>"!`);
      return NextResponse.json({ ok: true });
    }

    // ── /mypacks ──────────────────────────────────────────────────────────────
    if (text === "/mypacks") {
      const packs = await getPackByOwner(userId);
      if (packs.length === 0) { await sendMessage(chatId, "You have no packs yet. Use /newpack!"); return NextResponse.json({ ok: true }); }
      const list = packs.map((p) =>
        `📦 <b>${p.title}</b>\n🔗 ${BASE_URL}/pack/${p.packId}\n🔑 PIN: ${p.pin}\n👁 t.me/addstickers/${p.telegramPackName}`
      ).join("\n\n");
      await sendMessage(chatId, `Your packs:\n\n${list}`);
      return NextResponse.json({ ok: true });
    }

    // ── /sharepack ────────────────────────────────────────────────────────────
    if (text === "/sharepack") {
      const packs = await getPackByOwner(userId);
      if (packs.length === 0) { await sendMessage(chatId, "You have no packs yet."); return NextResponse.json({ ok: true }); }
      const list = packs.map((p) =>
        `📦 <b>${p.title}</b>\n🔗 ${BASE_URL}/pack/${p.packId}\n🔑 PIN: <b>${p.pin}</b>\n\nCollaborators can join via bot: /join_${p.packId}`
      ).join("\n\n");
      await sendMessage(chatId, `Share these with collaborators:\n\n${list}`);
      return NextResponse.json({ ok: true });
    }

  } catch (err) {
    console.error(err);
    await sendMessage(chatId, "❌ Something went wrong. Please try again.");
  }

  return NextResponse.json({ ok: true });
}
