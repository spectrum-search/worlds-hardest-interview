import type { Metadata } from "next";
import { Rubik, Inter } from "next/font/google";
import "./globals.css";

const rubik = Rubik({
  variable: "--font-rubik",
  subsets: ["latin"],
  weight: ["400", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "The World's Hardest Job Interview | Taluna",
  description:
    "Think you can survive an interview with R.J. Carrington III? Upload your CV and face the world's most demanding boss.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${rubik.variable} ${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
