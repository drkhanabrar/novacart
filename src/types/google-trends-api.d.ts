// FILE: src/types/google-trends-api.d.ts

declare module "google-trends-api" {
  export interface InterestOverTimeOptions {
    keyword: string;
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    property?:
      | ""
      | "images"
      | "news"
      | "froogle"
      | "youtube";
  }

  export interface DailyTrendsOptions {
    geo?: string;
    hl?: string;
  }

  export interface RelatedQueriesOptions {
    keyword: string;
    startTime?: Date;
    endTime?: Date;
    geo?: string;
    property?:
      | ""
      | "images"
      | "news"
      | "froogle"
      | "youtube";
  }

  export function interestOverTime(
    options: InterestOverTimeOptions,
  ): Promise<string>;

  export function dailyTrends(
    options: DailyTrendsOptions,
  ): Promise<string>;

  export function relatedQueries(
    options: RelatedQueriesOptions,
  ): Promise<string>;

  const googleTrends: {
    interestOverTime: typeof interestOverTime;
    dailyTrends: typeof dailyTrends;
    relatedQueries: typeof relatedQueries;
  };

  export default googleTrends;
}