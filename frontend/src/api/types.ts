export type Sentiment = "POSITIVE" | "NEGATIVE" | "NEUTRAL";
export type ProcessingStatus = "RECEIVED" | "PROCESSING" | "ANALYZED" | "FAILED";

// ---------------------------------------------------------------- Auth / tenancy

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: "owner" | "member" | string;
  createdAt: string;
  hasPassword?: boolean;
  googleLinked?: boolean;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  brandName: string;
  alertEmails: string[];
  plan: string;
  trialEndsAt?: string | null;
  currentPeriodEnd?: string | null;
  /** Effective state resolved by the server against the clock. */
  subscriptionState?: SubscriptionState;
  createdAt?: string;
}

export type SubscriptionState = "trialing" | "active" | "past_due" | "expired" | "canceled";
export type BillingInterval = "monthly" | "yearly";
export type PaidPlanId = "starter" | "growth" | "scale";

export interface PlanLimits {
  mentionsPerMonth: number;
  keywords: number;
  competitors: number;
  alertRecipients: number;
  searchScanning: boolean;
  exports: boolean;
}

export interface Entitlements {
  plan: "trial" | PaidPlanId;
  planName: string;
  state: SubscriptionState;
  usable: boolean;
  interval: BillingInterval | null;
  trialEndsAt: string | null;
  trialDaysLeft: number | null;
  currentPeriodEnd: string | null;
  cancelsAtPeriodEnd: boolean;
  managedByStripe: boolean;
  limits: PlanLimits;
  usage: { mentionsThisMonth: number; keywords: number; competitors: number; alertRecipients: number };
}

export interface BillingPlan {
  id: PaidPlanId;
  name: string;
  description: string;
  priceMonthly: number;
  priceYearly: number;
  limits: PlanLimits;
  features: string[];
}

export interface BillingResponse {
  entitlements: Entitlements;
  plans: BillingPlan[];
  trialDays: number;
  checkout: "stripe" | "request";
}

export interface AuthResponse {
  user: AuthUser;
  organization: Organization;
  /** True when "Continue with Google" just created the account. */
  created?: boolean;
}

export interface PlatformStatus {
  aiConfigured: boolean;
  searchConfigured: boolean;
  smtpConfigured: boolean;
  apifyConfigured: boolean;
}

export interface OrgSettingsResponse {
  organization: Organization;
  platform: PlatformStatus;
}

// ---------------------------------------------------------------- Dashboard

export interface Overview {
  totalPosts: number;
  totalComments: number;
  totalMentions: number;
  /** Where the mentions came from. Both are already included in totalMentions. */
  bySource?: { scraper: number; google: number };
  /** Week-over-week momentum by publish date, independent of the selected range. */
  trend?: OverviewTrend;
  byPlatform?: Record<string, number>;
  totalAnalyzed: number;
  positive: number;
  negative: number;
  neutral: number;
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  /** Negative mentions not yet marked handled. */
  openAlerts?: number;
  /** Negative-mention emails sent in the last 24 hours. */
  alertsSent24h?: number;
}

export interface TrendBucket {
  total: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface TrendChange {
  abs: number;
  /** null when the previous window was empty, so there is no meaningful percentage. */
  pct: number | null;
}

export interface OverviewTrend {
  windowDays: number;
  current: TrendBucket;
  previous: TrendBucket;
  change: { total: TrendChange; positive: TrendChange; negative: TrendChange; neutral: TrendChange };
}

export interface KeywordSummary {
  id: string;
  term: string;
  createdAt: string;
  _count: { posts: number; comments: number };
}

export interface BaseItem {
  id: string;
  sourceKey: string;
  keyword: string;
  text: string | null;
  url: string | null;
  author: string | null;
  authorUrl: string | null;
  publishedAt: string | null;
  sentiment: Sentiment | null;
  confidence: number | null;
  status: ProcessingStatus;
  processingError: string | null;
  platform?: string | null;
  alertSent?: boolean;
  analyzedAt?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
}

export interface PostItem extends BaseItem {
  type: "post";
  platform: string | null;
  likes: number | null;
  shares: number | null;
  commentsCount: number | null;
}

export interface CommentItem extends BaseItem {
  type: "comment";
  postId: string | null;
  likes: number | null;
  post?: { url: string | null; text: string | null } | null;
  /** Reply threading: top-level comments are depth 0 with no parent. */
  parentCommentId?: string | null;
  depth?: number;
}

export type FeedItem = PostItem | CommentItem;

export interface ItemsResponse {
  items: FeedItem[];
  pagination: { page: number; pageSize: number; totalPosts?: number; totalComments?: number; total: number };
}

export interface ItemFiltersQuery {
  keyword?: string;
  sentiment?: Sentiment;
  type?: "post" | "comment" | "both";
  platform?: string;
  source?: "scraper" | "google";
  dateFrom?: string;
  dateTo?: string;
  author?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface SentimentByKeywordRow extends Overview {
  keyword: string;
}

export interface SentimentByPlatformRow extends Overview {
  platform: string;
}

export interface SentimentOverTimeRow {
  date: string;
  POSITIVE: number;
  NEGATIVE: number;
  NEUTRAL: number;
}

export interface ScrapeResult {
  keyword: string;
  scrapeRunId: string;
  itemsReceived: number;
  postsCreated: number;
  commentsCreated: number;
  postsSkippedExisting: number;
  commentsSkippedExisting: number;
  analyzed: number;
  failed: number;
  warnings: string[];
}

export interface SearchResponse {
  posts: (PostItem & { keyword: string })[];
  comments: (CommentItem & { keyword: string })[];
  keywords: { id: string; term: string }[];
}

export interface ManualScrapePayload {
  keyword: string;
  url?: string;
  limit?: number;
  platform?: "reddit" | "quora" | "teamblind" | "trustpilot" | "linkedin" | "all";
}

export interface ManualScrapeResult {
  ok: boolean;
  keyword: string;
  scrapeRunId?: string;
  itemsReceived: number;
  postsCreated: number;
  commentsCreated: number;
  postsSkippedExisting?: number;
  commentsSkippedExisting?: number;
  analyzed: number;
  failed: number;
  warnings?: string[];
  message?: string;
  posts?: PostItem[];
  comments?: CommentItem[];
}

export interface CardStats {
  mentions: number;
  positive: number;
  negative: number;
  neutral: number;
}

export interface PlatformKeywordCard {
  id: string;
  platform: string;
  keyword: string;
  searchUrl?: string | null;
  enabled: boolean;
  lastRunAt?: string | null;
  stats?: CardStats;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorCard {
  id: string;
  platform: string;
  keyword: string;
  searchUrl?: string | null;
  enabled: boolean;
  lastRunAt?: string | null;
  stats?: CardStats;
  createdAt: string;
  updatedAt: string;
}

export interface CompetitorOverview {
  totalMentions: number;
  totalPosts: number;
  totalComments: number;
  activeCardsCount: number;
  totalCardsCount: number;
  positive?: number;
  negative?: number;
  neutral?: number;
  competitors?: ({ keyword: string } & CardStats)[];
}

export interface CronLogItem {
  timestamp: string;
  platform: string;
  keyword: string;
  status: "SUCCESS" | "FAILED";
  newItems: number;
  message: string;
}

export interface CronStatus {
  isRunning: boolean;
  cronEnabled: boolean;
  lastCronRunAt?: string;
  nextCronRunAt?: string;
  logs: CronLogItem[];
}

export interface GoogleMention {
  id: string;
  title_key?: string;
  norm_url?: string;
  url: string;
  title: string;
  snippet?: string;
  domain: string;
  platform: string;
  source_id?: string;
  engine?: string;
  query?: string;
  published?: string;
  first_seen?: string;
  date_status?: "confirmed" | "estimated" | "unknown";
  sentiment?: Sentiment | null;
  confidence?: number | null;
  keyword?: string;
}

export interface GoogleMentionsResponse {
  brand: string;
  total: number;
  shown: number;
  counts: Record<string, number>;
  mentions: GoogleMention[];
}

export interface GoogleStatsResponse {
  total: number;
  counts: Record<string, number>;
}

export interface GoogleScanPayload {
  keyword?: string;
  engine?: string;
}

export interface GoogleIngestResult {
  ok: boolean;
  keyword: string;
  itemsReceived: number;
  postsCreated: number;
  postsSkipped: number;
  analyzed: number;
  failed: number;
  message: string;
}
