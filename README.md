# Subly · 视频订阅器

像 RSS 一样订阅 **YouTube 频道** 和 **B 站 UP 主**：新视频自动出现在信息流里，点开看过就自动消失，不再打扰。

![Next.js](https://img.shields.io/badge/Next.js-15-black) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-38bdf8) ![Postgres](https://img.shields.io/badge/Postgres-Neon-336791)

## 功能

- 📺 **双平台订阅**：YouTube 频道 + B 站 UP 主，粘贴任意频道/空间/视频链接即可订阅
- 👀 **看过的自动消失**：点开视频即标记已看，信息流永远只剩没看过的（和 RSS 阅读器一个体验）
- ↩️ **已看记录**：随时翻看历史，支持恢复未看
- 🔄 **自动更新**：每天定时拉取新视频（Vercel Cron）；打开页面时若超过 15 分钟未刷新也会自动更新
- 👤 **多用户**：注册/登录（用户名 + 密码），每人有独立的订阅与已看状态；频道数据全局共享不重复抓取
- 🌗 自动适配深色模式，无需任何 API Key

## 一键部署到 Vercel

**第 1 步：部署**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/wov/Subly&project-name=subly&repository-name=Subly)

**第 2 步：创建数据库**

部署完成后，在 Vercel 控制台进入你的项目：

1. 打开 **Storage** 标签页 → **Create Database** → 选择 **Postgres (Neon)**
2. 创建完成后点击 **Connect to Project**，环境变量会自动注入（无需手动复制）

**第 3 步（可选）：限制注册**

默认开放注册。如只想让朋友注册，在 **Settings → Environment Variables** 设置：

| 变量 | 说明 |
| --- | --- |
| `REGISTER_CODE` | 注册邀请码，设置后注册需填写；不设置则开放注册 |

添加后 **Redeploy** 一次使其生效。

**完成！** 打开网站 → 注册账号 → 「订阅」页粘贴频道链接即可开始使用。数据表会在首次访问时自动创建，无需手动执行迁移。

> 从单密码版本升级：**第一个注册的账号会自动继承**原有的订阅和已看数据；旧的 `AUTH_PASSCODE` 不再使用，可删除。

> 💡 Cron 定时刷新已在 `vercel.json` 中配置（每天一次——Hobby 免费计划的频率上限；Pro 计划可自行改成每小时）。Vercel 会自动注入 `CRON_SECRET` 用于鉴权，无需额外配置。

## 本地开发

```bash
npm install
cp .env.example .env   # 填入 DATABASE_URL（本地 Postgres 或云端）和 AUTH_PASSCODE（可选）
npm run dev
```

## 支持的订阅链接形式

**YouTube**（自动识别，任选其一）

- `https://www.youtube.com/@handle`
- `https://www.youtube.com/channel/UCxxxxxxxx`
- `https://www.youtube.com/watch?v=xxxxxxxxxxx`（自动识别所属频道）
- 直接粘贴频道 ID（`UC` 开头的 22 位字符串）

**Bilibili**（自动识别，任选其一）

- `https://space.bilibili.com/12345678`
- `https://www.bilibili.com/video/BVxxxxxxxx`（自动识别 UP 主）
- `https://b23.tv/xxxxx`（短链）
- 直接粘贴 UID 数字

## 工作原理

| 平台 | 数据来源 | 说明 |
| --- | --- | --- |
| YouTube | 官方频道 RSS（无需 Key） | RSS 故障时自动回退到频道页解析 |
| Bilibili | Web 端公开接口（WBI 签名） | 游客 Cookie + WBI 签名 + dm 风控参数 + 空间页预热，无需账号 |

- 每次拉取只新增视频，不会覆盖「已看」状态
- 已看 / 未看数据存在 Postgres 中，换设备登录状态一致

## 环境变量

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `DATABASE_URL` 或 Vercel Postgres 自动注入的 `POSTGRES_URL` 等 | ✅ | 数据库连接（Vercel 上创建 Storage 后自动注入） |
| `REGISTER_CODE` | 可选 | 注册邀请码（不设置则开放注册） |
| `BILIBILI_COOKIE` | 可选 | B 站登录 Cookie 兜底。服务器部署在海外时可能被 B 站风控拦截（HTTP 412）：浏览器登录 B 站 → F12 → 网络 → 任意请求 → 复制完整 Cookie 值填入即可（含 `SESSDATA` 生效最稳） |
| `CRON_SECRET` | 自动 | Vercel Cron 鉴权（平台自动注入，无需手动设置） |

## License

MIT
