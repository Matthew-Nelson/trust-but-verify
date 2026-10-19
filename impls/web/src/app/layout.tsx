import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shortlink",
  description: "Create and inspect short links",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="mx-auto max-w-4xl px-4 py-8">
        <main>{children}</main>
      </body>
    </html>
  );
}
