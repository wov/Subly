"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function logout() {
    setBusy(true);
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <button
      onClick={logout}
      disabled={busy}
      className="rounded-md px-3 py-1.5 text-sm text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-200"
    >
      退出
    </button>
  );
}
