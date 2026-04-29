import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "StickerCollab",
  description: "Collaborative Telegram sticker pack editor",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#f0f2f5", minHeight: "100vh" }}>
        {children}
      </body>
    </html>
  );
}
