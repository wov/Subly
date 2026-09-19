import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import LogoutButton from "@/components/LogoutButton";
import { authEnabled } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Subly · 视频订阅",
  description: "订阅 YouTube 与 B 站 UP 主，看过的自动消失，像 RSS 一样清爽",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        {/* B 站图床防盗链：无 Referer 请求 */}
        <meta name="referrer" content="no-referrer" />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased dark:bg-gray-950 dark:text-gray-100">
        <header className="sticky top-0 z-10 border-b border-gray-200 bg-white/80 backdrop-blur dark:border-gray-800 dark:bg-gray-950/80">
          <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-4">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-600 text-sm text-white">
                S
              </span>
              Subly
            </Link>
            <nav className="flex items-center gap-1 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                未看
              </Link>
              <Link
                href="/watched"
                className="rounded-md px-3 py-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                已看
              </Link>
              <Link
                href="/channels"
                className="rounded-md px-3 py-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
              >
                订阅
              </Link>
            </nav>
            <div className="ml-auto">{authEnabled() ? <LogoutButton /> : null}</div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
