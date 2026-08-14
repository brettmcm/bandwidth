import type { Metadata } from "next";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: "Bandwidth",
  description: "A private planning field for official requests and the work behind them.",
  openGraph: {
    title: "Bandwidth",
    description: "Official requests, prep windows, and landing dates in one quiet field.",
    images: ["/og.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "Bandwidth",
    description: "Official requests, prep windows, and landing dates in one quiet field.",
    images: ["/og.png"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://use.typekit.net" />
        <link rel="stylesheet" href="https://use.typekit.net/shq4xoc.css" />
      </head>
      <body>
        {children}
        <Toaster
          closeButton
          position="bottom-left"
          theme="system"
          toastOptions={{
            classNames: {
              toast: "app-toast",
              title: "app-toast-title",
              description: "app-toast-description",
            },
          }}
        />
      </body>
    </html>
  );
}
