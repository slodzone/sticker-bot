"use client";
import { useState } from "react";

interface Sticker {
  fileId: string;
  fileUniqueId: string;
  emoji: string;
}

interface PackData {
  packId: string;
  title: string;
  telegramPackName: string;
  stickers: Sticker[];
}

export default function PackPage({ params }: { params: { packId: string } }) {
  const { packId } = params;
  const [pin, setPin] = useState("");
  const [pinInput, setPinInput] = useState("");
  const [pack, setPack] = useState<PackData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);

  const status = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(""), 3000);
  };

  async function api(body: object) {
    const res = await fetch("/api/pack", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packId, pin, ...body }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    return res.json();
  }

  async function loadPack(pinToUse: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/pack?packId=${packId}&pin=${pinToUse}`);
      if (!res.ok) {
        const d = await res.json();
        setError(d.error === "Invalid PIN" ? "❌ Wrong PIN, try again." : "Pack not found.");
        setLoading(false);
        return;
      }
      const data = await res.json();
      setPack(data);
      setNewTitle(data.title);
      setPin(pinToUse);
    } catch {
      setError("Something went wrong.");
    }
    setLoading(false);
  }

  async function handleRename() {
    if (!newTitle.trim() || newTitle === pack?.title) return;
    try {
      await api({ action: "rename", title: newTitle.trim() });
      setPack((p) => p ? { ...p, title: newTitle.trim() } : p);
      status("✅ Pack renamed!");
    } catch (e: unknown) {
      status("❌ " + (e instanceof Error ? e.message : "Error"));
    }
  }

  async function handleDelete(fileUniqueId: string) {
    if (!confirm("Delete this sticker?")) return;
    try {
      await api({ action: "delete", fileUniqueId });
      setPack((p) => p ? { ...p, stickers: p.stickers.filter((s) => s.fileUniqueId !== fileUniqueId) } : p);
      status("🗑️ Sticker deleted!");
    } catch (e: unknown) {
      status("❌ " + (e instanceof Error ? e.message : "Error"));
    }
  }

  async function handleReorder(from: number, to: number) {
    if (!pack) return;
    const updated = [...pack.stickers];
    const [moved] = updated.splice(from, 1);
    updated.splice(to, 0, moved);
    setPack({ ...pack, stickers: updated });
    try {
      await api({ action: "reorder", stickers: updated });
      status("↕️ Order saved!");
    } catch (e: unknown) {
      status("❌ " + (e instanceof Error ? e.message : "Error"));
    }
  }

  if (!pin) {
    return (
      <div style={styles.center}>
        <div style={styles.card}>
          <h1 style={styles.h1}>🔐 Enter PIN</h1>
          <p style={styles.sub}>Enter the PIN you received to access this sticker pack.</p>
          <input
            style={styles.input}
            type="text"
            inputMode="numeric"
            maxLength={4}
            placeholder="4-digit PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && loadPack(pinInput)}
          />
          {error && <p style={styles.error}>{error}</p>}
          <button style={styles.btn} onClick={() => loadPack(pinInput)} disabled={loading || pinInput.length !== 4}>
            {loading ? "Checking..." : "Open Pack"}
          </button>
        </div>
      </div>
    );
  }

  if (!pack) return <div style={styles.center}><p>Loading...</p></div>;

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <h1 style={styles.h1}>🎨 {pack.title}</h1>
        <a href={`https://t.me/addstickers/${pack.telegramPackName}`} target="_blank" rel="noreferrer" style={styles.viewLink}>
          View in Telegram ↗
        </a>
      </div>
      {statusMsg && <div style={styles.toast}>{statusMsg}</div>}
      <div style={styles.section}>
        <label style={styles.label}>Pack name</label>
        <div style={styles.row}>
          <input style={{ ...styles.input, flex: 1 }} value={newTitle} onChange={(e) => setNewTitle(e.target.value)} maxLength={64} />
          <button style={styles.btn} onClick={handleRename}>Rename</button>
        </div>
      </div>
      <div style={styles.section}>
        <label style={styles.label}>Stickers ({pack.stickers.length})</label>
        <p style={styles.hint}>Drag to reorder · Click ✕ to delete</p>
        {pack.stickers.length === 0 && <p style={styles.sub}>No stickers yet. Add them via Telegram.</p>}
        <div style={styles.grid}>
          {pack.stickers.map((s, i) => (
            <div
              key={s.fileUniqueId}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragging !== null && dragging !== i) handleReorder(dragging, i); setDragging(null); }}
              style={{ ...styles.stickerCard, opacity: dragging === i ? 0.4 : 1 }}
            >
              <button style={styles.deleteBtn} onClick={() => handleDelete(s.fileUniqueId)}>✕</button>
              <div style={styles.stickerEmoji}>{s.emoji}</div>
              <div style={styles.stickerIndex}>#{i + 1}</div>
            </div>
          ))}
        </div>
      </div>
      <p style={styles.footer}>Add new stickers via the Telegram bot.</p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { maxWidth: 680, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif" },
  center: { display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", background: "#f5f5f5" },
  card: { background: "#fff", borderRadius: 16, padding: 32, maxWidth: 360, width: "100%", boxShadow: "0 2px 16px rgba(0,0,0,0.08)" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap", gap: 8 },
  h1: { fontSize: 24, fontWeight: 700, margin: "0 0 8px" },
  sub: { color: "#666", fontSize: 14, margin: "0 0 16px" },
  hint: { color: "#999", fontSize: 13, margin: "4px 0 12px" },
  label: { display: "block", fontWeight: 600, fontSize: 14, marginBottom: 8, color: "#333" },
  input: { display: "block", width: "100%", padding: "10px 14px", border: "1px solid #ddd", borderRadius: 8, fontSize: 16, boxSizing: "border-box" as const },
  btn: { display: "inline-block", padding: "10px 20px", background: "#2AABEE", color: "#fff", border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" as const },
  row: { display: "flex", gap: 8, alignItems: "center" },
  section: { background: "#fff", borderRadius: 12, padding: 20, marginBottom: 16, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 12 },
  stickerCard: { position: "relative" as const, background: "#f9f9f9", border: "1px solid #eee", borderRadius: 10, padding: 12, textAlign: "center" as const, cursor: "grab", userSelect: "none" as const },
  stickerEmoji: { fontSize: 32, lineHeight: 1 },
  stickerIndex: { fontSize: 11, color: "#aaa", marginTop: 4 },
  deleteBtn: { position: "absolute" as const, top: 4, right: 4, background: "#ff4444", color: "#fff", border: "none", borderRadius: "50%", width: 18, height: 18, fontSize: 10, cursor: "pointer" },
  error: { color: "#e53e3e", fontSize: 14, margin: "8px 0" },
  toast: { background: "#333", color: "#fff", padding: "10px 16px", borderRadius: 8, marginBottom: 16, fontSize: 14 },
  viewLink: { color: "#2AABEE", textDecoration: "none", fontSize: 14, fontWeight: 500 },
  footer: { color: "#aaa", fontSize: 13, textAlign: "center" as const, marginTop: 24 },
};
