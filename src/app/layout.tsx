import type { Metadata } from "next";
// @ts-expect-error CSS side-effect imports are handled by Next.js.
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyMate",
  description: "Turn your notes into flashcards you'll actually remember.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body">{children}</body>
    </html>
  );
}
