import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "UCost · 日常有数",
  description: "记下收支、愿望与每一次省下的钱。",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
