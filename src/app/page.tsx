export default function Home() {
  return (
    <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center", padding: 32 }}>
        <h1 style={{ fontSize: 48, margin: "0 0 16px" }}>🎨</h1>
        <h2 style={{ fontSize: 24, margin: "0 0 8px" }}>StickerCollab Bot</h2>
        <p style={{ color: "#666" }}>Open your sticker pack link to start editing.</p>
      </div>
    </main>
  );
}
