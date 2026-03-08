import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SlotKit — The Headless Booking Primitive | Live Demo",
  description:
    "Interactive demo of SlotKit: open-source scheduling toolkit for developers. Live booking flow powered by @thebookingkit/core pure functions.",
  openGraph: {
    title: "SlotKit — The Headless Booking Primitive",
    description:
      "Production-grade scheduling infrastructure. Slot engine, Drizzle schema, and copy-paste React components.",
    url: "https://demo.thebookingkit.dev",
    siteName: "TheBookingKit",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
