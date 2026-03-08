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
    url: "https://thebookingkit.dev",
    siteName: "TheBookingKit",
  },
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
    ],
    shortcut: "/favicon.ico",
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
        {/* Favicon — SVG for modern browsers, ICO fallback for legacy */}
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="shortcut icon" href="/favicon.ico" />
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
