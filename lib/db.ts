import postgres from "postgres";

// 连接串优先级：DATABASE_URL（自带数据库） > Vercel Postgres 注入的各变量
function connectionUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (process.env.POSTGRES_URL) return process.env.POSTGRES_URL;
  if (process.env.POSTGRES_URL_UNPOOLED) return process.env.POSTGRES_URL_UNPOOLED;
  const { POSTGRES_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DATABASE } = process.env;
  if (POSTGRES_HOST && POSTGRES_USER && POSTGRES_PASSWORD && POSTGRES_DATABASE) {
    return `postgres://${encodeURIComponent(POSTGRES_USER)}:${encodeURIComponent(
      POSTGRES_PASSWORD
    )}@${POSTGRES_HOST}/${POSTGRES_DATABASE}`;
  }
  throw new Error(
    "未配置数据库连接：请在 Vercel 控制台创建 Postgres 并关联项目，或设置 DATABASE_URL"
  );
}

// prepare:false 兼容 Neon/Serverless 的事务级连接池
// 用 Proxy 懒初始化：构建期（无数据库环境变量）import 本模块不报错
let client: ReturnType<typeof postgres> | null = null;

function getClient(): ReturnType<typeof postgres> {
  if (!client) {
    client = postgres(connectionUrl(), {
      prepare: false,
      idle_timeout: 5,
      connect_timeout: 10,
      max: 3,
    });
  }
  return client;
}

export const sql = new Proxy(postgres, {
  apply(_target, _thisArg, args: Parameters<typeof postgres>) {
    return (getClient() as unknown as (...a: unknown[]) => unknown)(...args);
  },
  get(_target, prop, receiver) {
    const c = getClient() as unknown as Record<string | symbol, unknown>;
    const value = c[prop as string | symbol];
    return typeof value === "function" ? value.bind(c) : value;
  },
}) as unknown as ReturnType<typeof postgres>;

let schemaReady: Promise<void> | null = null;

/** 首次查询前自动建表（幂等），实现零迁移部署 */
export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = sql`
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        platform TEXT NOT NULL,
        platform_id TEXT NOT NULL,
        name TEXT NOT NULL,
        avatar_url TEXT,
        url TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_fetched_at TIMESTAMPTZ,
        UNIQUE (platform, platform_id)
      )
    `.then(() =>
      sql`
        CREATE TABLE IF NOT EXISTS videos (
          id SERIAL PRIMARY KEY,
          channel_id INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
          video_id TEXT NOT NULL,
          title TEXT NOT NULL,
          url TEXT NOT NULL,
          thumbnail_url TEXT,
          description TEXT,
          published_at TIMESTAMPTZ NOT NULL,
          watched BOOLEAN NOT NULL DEFAULT false,
          watched_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (channel_id, video_id)
        )
      `.then(() =>
        sql`CREATE INDEX IF NOT EXISTS idx_videos_watched ON videos (watched, published_at DESC)`
      ).then(() => undefined)
    ).catch((err) => {
      schemaReady = null; // 允许下次重试
      throw err;
    });
  }
  return schemaReady;
}

/** postgres.js 返回 RowList，统一转为具体行类型 */
export function typed<T>(rows: unknown): T[] {
  return rows as T[];
}

export type Channel = {
  id: number;
  platform: "youtube" | "bilibili";
  platform_id: string;
  name: string;
  avatar_url: string | null;
  url: string;
  created_at: Date;
  last_fetched_at: Date | null;
};

export type Video = {
  id: number;
  channel_id: number;
  channel_name?: string;
  channel_avatar?: string | null;
  channel_platform?: Channel["platform"];
  video_id: string;
  title: string;
  url: string;
  thumbnail_url: string | null;
  description: string | null;
  published_at: Date;
  watched: boolean;
  watched_at: Date | null;
};
