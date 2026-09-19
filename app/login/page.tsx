import LoginForm from "@/components/LoginForm";

export default function LoginPage() {
  return (
    <div className="mx-auto mt-20 max-w-sm">
      <div className="mb-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-xl font-bold text-white">
          S
        </span>
        <h1 className="mt-3 text-xl font-bold">Subly</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">输入访问密码进入</p>
      </div>
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <LoginForm />
      </div>
    </div>
  );
}
