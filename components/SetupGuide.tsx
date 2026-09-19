/** 数据库不可用时的引导页（替代直接抛 500） */
export default function SetupGuide({
  configured,
  error,
}: {
  configured: boolean;
  error?: string;
}) {
  return (
    <div className="mx-auto mt-12 max-w-xl rounded-xl border border-amber-300/60 bg-amber-50 p-6 dark:border-amber-700/50 dark:bg-amber-950/30">
      <h1 className="text-lg font-bold text-amber-900 dark:text-amber-200">
        {configured ? "数据库连接失败" : "数据库还未配置"}
      </h1>
      {error ? (
        <p className="mt-2 rounded-lg bg-amber-100/70 px-3 py-2 font-mono text-xs break-all text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          {error}
        </p>
      ) : null}
      {configured ? (
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-amber-900/90 dark:text-amber-200/90">
          <li>确认 Vercel 控制台 Storage 里的 Postgres 状态为 Active，且已 Connect 到本项目</li>
          <li>Connect / 修改环境变量后需要 <strong>Redeploy</strong> 一次才会生效</li>
          <li>若使用自带数据库，检查 DATABASE_URL 是否正确、是否允许 Vercel 服务器访问</li>
        </ol>
      ) : (
        <ol className="mt-4 list-decimal space-y-1.5 pl-5 text-sm text-amber-900/90 dark:text-amber-200/90">
          <li>打开 Vercel 控制台，进入本项目的 <strong>Storage</strong> 标签页</li>
          <li>点击 <strong>Create Database</strong>，选择 <strong>Postgres (Neon)</strong> 创建</li>
          <li>创建后点 <strong>Connect to Project</strong>，环境变量会自动注入</li>
          <li>回到 <strong>Deployments</strong>，对最新部署点 <strong>⋯ → Redeploy</strong></li>
        </ol>
      )}
      <p className="mt-4 text-xs text-amber-700 dark:text-amber-400">
        配置完成后刷新本页即可，数据表会自动创建。诊断端点：/api/health
      </p>
    </div>
  );
}
