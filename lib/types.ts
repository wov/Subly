export type Platform = "youtube" | "bilibili";

export type FetchedChannel = {
  platform: Platform;
  platformId: string;
  name: string;
  avatarUrl: string | null;
  url: string;
};

export type FetchedVideo = {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  description: string | null;
  publishedAt: Date;
};

export interface PlatformAdapter {
  /** 识别用户输入（频道/空间/视频链接或 ID），返回频道信息 */
  resolve(input: string): Promise<FetchedChannel>;
  /** 拉取频道最新视频列表 */
  fetchVideos(platformId: string): Promise<FetchedVideo[]>;
  /** 可选：拉取视频时顺便校正频道名/头像 */
  fetchChannelMeta?(platformId: string): Promise<{ name?: string; avatarUrl?: string | null }>;
}
