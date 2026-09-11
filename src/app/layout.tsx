import type { Metadata } from "next";
import "./globals.css";
import "../../dark-mode.css";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ThemeInitScript } from "@/components/ThemeInitScript";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: {
    default: "NovaCart | Smart Shopping. Delivered.",
    template: "%s | NovaCart",
  },
  description: "A focused collection of products worth buying, beautifully presented and simply priced.",
  icons: { icon: "/novacart-mark.png", apple: "/novacart-mark.png" },
  openGraph: {
    title: "NovaCart | Smart Shopping. Delivered.",
    description: "A focused collection of products worth buying, beautifully presented and simply priced.",
    type: "website",
  },
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const currentUser = await getCurrentUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased flex min-h-screen flex-col">
        <ThemeInitScript />
        <Navbar
          user={
            currentUser
              ? { id: currentUser.id, name: currentUser.name, email: currentUser.email, phone: currentUser.phone }
              : null
          }
        />
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
