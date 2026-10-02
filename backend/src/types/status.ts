// SQLite (Prisma) has no native enum support, so ProcessingStatus and
// Sentiment are stored as plain strings and constrained here in app code.

export const ProcessingStatus = {
  RECEIVED: "RECEIVED",
  PROCESSING: "PROCESSING",
  ANALYZED: "ANALYZED",
  FAILED: "FAILED",
} as const;
export type ProcessingStatusValue = (typeof ProcessingStatus)[keyof typeof ProcessingStatus];

export const Sentiment = {
  POSITIVE: "POSITIVE",
  NEGATIVE: "NEGATIVE",
  NEUTRAL: "NEUTRAL",
} as const;
export type SentimentValue = (typeof Sentiment)[keyof typeof Sentiment];
