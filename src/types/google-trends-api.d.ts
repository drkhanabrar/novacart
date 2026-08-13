declare module "google-trends-api" {
  interface InterestOverTimeOptions {
    keyword: string;
    startTime?: Date;
    endTime?: Date;
    geo?: string;
  }

  function interestOverTime(options: InterestOverTimeOptions): Promise<string>;

  const googleTrends: {
    interestOverTime: typeof interestOverTime;
  };

  export default googleTrends;
}