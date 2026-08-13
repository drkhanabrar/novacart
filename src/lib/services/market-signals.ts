import googleTrends from "google-trends-api";

export interface MarketSignal {
  keyword: string;
  trendScore: number; // 0-100 average Google Trends interest, last 3 months
  trendDirection: "RISING" | "STEADY" | "FALLING";
  youtubeVideoCount: number;
  youtubeTotalViews: number;
  youtubeAvgViews: number;
  fetchedAt: string;
}

function threeMonthsAgo(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - 3);
  return d;
}

async function getGoogleTrendsScore(
  keyword: string
): Promise<{ score: number; direction: MarketSignal["trendDirection"] }> {
  const raw = await googleTrends.interestOverTime({
    keyword,
    startTime: threeMonthsAgo(),
    endTime: new Date(),
  });

  const parsed = JSON.parse(raw);
  const points: { value: number[] }[] = parsed?.default?.timelineData ?? [];

  if (points.length === 0) {
    return { score: 0, direction: "STEADY" };
  }

  const values = points.map((p) => p.value[0] ?? 0);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  const mid = Math.floor(values.length / 2);
  const firstHalf = values.slice(0, mid);
  const secondHalf = values.slice(mid);
  const firstAvg =
    firstHalf.reduce((a, b) => a + b, 0) / (firstHalf.length || 1);
  const secondAvg =
    secondHalf.reduce((a, b) => a + b, 0) / (secondHalf.length || 1);

  let direction: MarketSignal["trendDirection"] = "STEADY";
  if (secondAvg > firstAvg * 1.15) direction = "RISING";
  else if (secondAvg < firstAvg * 0.85) direction = "FALLING";

  return { score: Math.round(avg), direction };
}

async function getYouTubeSignal(
  keyword: string
): Promise<{ videoCount: number; totalViews: number; avgViews: number }> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing YOUTUBE_API_KEY. Add it to your .env.local file (see setup steps)."
    );
  }

  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&type=video&order=viewCount&maxResults=10` +
    `&publishedAfter=${threeMonthsAgo().toISOString()}` +
    `&q=${encodeURIComponent(keyword)}&key=${apiKey}`;

  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();

  if (searchData.error) {
    throw new Error(`YouTube API error: ${searchData.error.message}`);
  }

  const videoIds: string[] = (searchData.items ?? [])
    .map((item: { id?: { videoId?: string } }) => item.id?.videoId)
    .filter((id: string | undefined): id is string => Boolean(id));

  if (videoIds.length === 0) {
    return { videoCount: 0, totalViews: 0, avgViews: 0 };
  }

  const statsUrl =
    `https://www.googleapis.com/youtube/v3/videos` +
    `?part=statistics&id=${videoIds.join(",")}&key=${apiKey}`;

  const statsRes = await fetch(statsUrl);
  const statsData = await statsRes.json();

  const totalViews = (statsData.items ?? []).reduce(
    (sum: number, item: { statistics?: { viewCount?: string } }) =>
      sum + parseInt(item.statistics?.viewCount ?? "0", 10),
    0
  );

  return {
    videoCount: videoIds.length,
    totalViews,
    avgViews: Math.round(totalViews / videoIds.length),
  };
}

/**
 * Pulls real market-demand signals for one product keyword from
 * Google Trends and the YouTube Data API (both official, free sources).
 */
export async function getMarketSignals(keyword: string): Promise<MarketSignal> {
  const [trends, youtube] = await Promise.all([
    getGoogleTrendsScore(keyword),
    getYouTubeSignal(keyword),
  ]);

  return {
    keyword,
    trendScore: trends.score,
    trendDirection: trends.direction,
    youtubeVideoCount: youtube.videoCount,
    youtubeTotalViews: youtube.totalViews,
    youtubeAvgViews: youtube.avgViews,
    fetchedAt: new Date().toISOString(),
  };
}