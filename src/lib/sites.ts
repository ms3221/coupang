/** 크롤 사이트(source) 메타 — DB는 source 문자열만 저장, 라벨/색은 프론트 상수.
 *  사이트 추가 시 여기 한 줄 + 백엔드 크롤러만 늘리면 됨. */
export const SITES: Record<string, { label: string; badgeCls: string }> = {
  hankyeong: {
    label: "한경 시골농부",
    badgeCls: "border-cyan-500/30 bg-cyan-500/10 text-cyan-300",
  },
  jeollayouth: {
    label: "전라도청년",
    badgeCls: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  },
};

/** 카테고리(category) 라벨. */
export const CATEGORIES: Record<string, string> = {
  hot6: "HOT 6",
  best6: "BEST 6",
};

export const siteLabel = (source: string) => SITES[source]?.label ?? source;
export const siteBadgeCls = (source: string) =>
  SITES[source]?.badgeCls ?? "border-border bg-muted text-muted-foreground";
export const categoryLabel = (category: string) =>
  CATEGORIES[category] ?? category;
