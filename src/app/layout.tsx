import type { Metadata, Viewport } from "next";
import { Black_Han_Sans, Noto_Sans_KR } from "next/font/google";
import "./globals.css";

const display = Black_Han_Sans({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = Noto_Sans_KR({ weight: ["400", "700", "800"], subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Fornace Pizza — 485°C 장작 화덕 피자",
  description: "72시간 숙성 반죽과 장작 화덕으로 90초 만에 구워내는 나폴리 피자, Fornace Pizza.",
};

export const viewport: Viewport = {
  themeColor: "#110907",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
