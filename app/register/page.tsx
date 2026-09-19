import { redirect } from "next/navigation";
import RegisterForm from "@/components/RegisterForm";
import SetupGuide from "@/components/SetupGuide";
import { getCurrentUser, inviteCodeEnabled } from "@/lib/auth";
import { dbConfigured } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function RegisterPage() {
  try {
    if (await getCurrentUser()) redirect("/");
  } catch (err) {
    return (
      <SetupGuide
        configured={dbConfigured()}
        error={err instanceof Error ? err.message : String(err)}
      />
    );
  }

  return (
    <div className="mx-auto mt-20 max-w-sm">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-xl font-bold text-white">
          S
        </span>
        <h1 className="mt-3 text-xl font-bold">注册 Subly 账号</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          注册后即可订阅 YouTube 频道与 B 站 UP 主
        </p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <RegisterForm needInvite={inviteCodeEnabled()} />
      </div>
    </div>
  );
}
