import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Middagsplan",
  description: "Ukesmeny og handleliste for husstanden",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="no">
      <body>{children}</body>
    </html>
  );
}
