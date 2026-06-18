import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "remote-df control panel",
  description: "Spawn Dwarf Fortress instances, manage mods/tilesets, and tunnel in.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <span className="brand">⛏ remote-df</span>
          <span className="subtitle">control panel</span>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
