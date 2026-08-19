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
    icon: { url: "/favicon.png", type: "image/png", sizes: "105x105" },
    shortcut: "/favicon.png",
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
        <link rel="preconnect" href="https://rsms.me" />
        <link rel="stylesheet" href="https://rsms.me/inter/inter.css" />
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
