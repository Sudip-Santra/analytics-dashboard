import { apiFetch } from "./api";

export interface FeatureData {
  feature: string;
  clicks: number;
}

export interface DailyData {
  date: string;
  clicks: number;
}

export interface AnalyticsResponse {
  features: FeatureData[];
  daily: DailyData[];
  stats: {
    total_clicks: number;
    unique_users: number;
  };
}

export interface AnalyticsFilters {
  startDate?: string;
  endDate?: string;
  age?: string;
  gender?: string;
  feature?: string;
}

export async function fetchAnalytics(filters: AnalyticsFilters) {
  const params = new URLSearchParams();
  if (filters.startDate) params.set("start_date", filters.startDate);
  if (filters.endDate) params.set("end_date", filters.endDate);
  if (filters.age && filters.age !== "all") params.set("age", filters.age);
  if (filters.gender && filters.gender !== "all") params.set("gender", filters.gender);
  if (filters.feature) params.set("feature", filters.feature);

  const { data } = await apiFetch<AnalyticsResponse>(`/analytics?${params}`);
  return data;
}

export async function trackFeatureClick(featureName: string) {
  await apiFetch("/track", {
    method: "POST",
    body: { feature_name: featureName },
  });
}
