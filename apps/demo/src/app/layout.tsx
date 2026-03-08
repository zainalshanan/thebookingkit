import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fade & Shave Barbershop — Book Online | SlotKit Demo",
  description:
    "Demo barber shop booking site powered by SlotKit scheduling toolkit.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
