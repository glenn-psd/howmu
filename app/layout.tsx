import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

const themeScript = `(()=>{try{const saved=localStorage.getItem("howmu:theme");const theme=saved==="light"||saved==="dark"?saved:"dark";document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme}catch{}})()`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https";
  const origin = `${protocol}://${host}`;

  return {
    title: "HOWMU 하무",
    description: "결제하기 전에, 얼마인지부터.",
    applicationName: "HOWMU",
    manifest: "/manifest.webmanifest",
    appleWebApp: { capable: true, statusBarStyle: "default", title: "HOWMU" },
    icons: { icon: "/icon-192.png", apple: "/icon-192.png" },
    openGraph: {
      title: "HOWMU 하무",
      description: "결제하기 전에, 얼마인지부터.",
      type: "website",
      images: [{ url: `${origin}/og.png`, width: 1734, height: 907, alt: "howmu? Know before you pay." }],
    },
    twitter: {
      card: "summary_large_image",
      title: "HOWMU 하무",
      description: "결제하기 전에, 얼마인지부터.",
      images: [`${origin}/og.png`],
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#050608",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
