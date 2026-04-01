import { useState, useMemo, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { subDays, format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  Bar,
  BarChart,
  Line,
  LineChart,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import type { BarShapeProps } from "recharts";
import {
  CalendarDays,
  Users,
  MousePointerClick,
  TrendingUp,
  Activity,
  BarChart3,
  LogOut,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { logout } from "@/services/auth";
import { fetchAnalytics, trackFeatureClick, type FeatureData, type DailyData } from "@/services/analytics";

const FEATURE_COLORS: Record<string, string> = {
  date_picker: "var(--chart-1)",
  filter_age: "var(--chart-2)",
  filter_gender: "var(--chart-4)",
  chart_bar: "var(--chart-3)",
  chart_line: "var(--chart-5)",
};

const barChartConfig = {
  clicks: {
    label: "Total Clicks",
    color: "var(--chart-1)",
  },
} satisfies Record<string, { label: string; color: string }>;

const lineChartConfig = {
  clicks: {
    label: "Clicks",
    color: "var(--chart-1)",
  },
} satisfies Record<string, { label: string; color: string }>;

const FEATURE_LABELS: Record<string, string> = {
  date_picker: "Date Picker",
  filter_age: "Age Filter",
  filter_gender: "Gender Filter",
  chart_bar: "Bar Chart",
  chart_line: "Line Chart",
};

const STAT_CARDS = [
  { gradient: "from-blue-500/10 to-indigo-500/10", iconBg: "bg-blue-500/10", iconColor: "text-blue-600" },
  { gradient: "from-emerald-500/10 to-teal-500/10", iconBg: "bg-emerald-500/10", iconColor: "text-emerald-600" },
  { gradient: "from-amber-500/10 to-orange-500/10", iconBg: "bg-amber-500/10", iconColor: "text-amber-600" },
  { gradient: "from-violet-500/10 to-purple-500/10", iconBg: "bg-violet-500/10", iconColor: "text-violet-600" },
];

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

function setCookie(name: string, value: string, days: number) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`;
}

function loadFiltersFromCookies() {
  const saved = getCookie("dashboard_filters");
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveFiltersToCookies(filters: { dateFrom: string; dateTo: string; age: string; gender: string }) {
  setCookie("dashboard_filters", JSON.stringify(filters), 30);
}

export default function Dashboard() {
  const navigate = useNavigate();

  const savedFilters = useMemo(() => loadFiltersFromCookies(), []);

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: savedFilters?.dateFrom ? new Date(savedFilters.dateFrom) : subDays(new Date(), 90),
    to: savedFilters?.dateTo ? new Date(savedFilters.dateTo) : new Date(),
  });
  const [ageFilter, setAgeFilter] = useState(savedFilters?.age || "all");
  const [genderFilter, setGenderFilter] = useState(savedFilters?.gender || "all");
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);

  const [featureData, setFeatureData] = useState<FeatureData[]>([]);
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [totalClicks, setTotalClicks] = useState(0);
  const [uniqueUsers, setUniqueUsers] = useState(0);
  const [loading, setLoading] = useState(true);

  // Track interaction
  const trackClick = useCallback(async (featureName: string) => {
    try {
      await trackFeatureClick(featureName);
    } catch {
      // silent — tracking should not disrupt UX
    }
  }, []);

  // Base filters object
  const baseFilters = useCallback(() => ({
    startDate: dateRange?.from?.toISOString(),
    endDate: dateRange?.to?.toISOString(),
    age: ageFilter,
    gender: genderFilter,
  }), [dateRange, ageFilter, genderFilter]);

  const formatDaily = (daily: DailyData[]) =>
    daily.map((d) => ({ date: format(new Date(d.date), "MMM dd"), clicks: d.clicks }));

  // Fetch features + stats (no feature filter)
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAnalytics(baseFilters());
      setFeatureData(data.features);
      setTotalClicks(data.stats.total_clicks);
      setUniqueUsers(data.stats.unique_users);
      if (!selectedFeature) {
        setDailyData(formatDaily(data.daily));
      }
    } catch (err: unknown) {
      const error = err as { status?: number };
      if (error?.status === 401) {
        toast.error("Session expired. Please login again.");
        navigate("/login");
        return;
      }
      toast.error("Cannot connect to server");
    } finally {
      setLoading(false);
    }
  }, [baseFilters, selectedFeature, navigate]);

  // Fetch daily data filtered by selected feature
  const fetchDailyForFeature = useCallback(async () => {
    if (!selectedFeature) return;
    try {
      const data = await fetchAnalytics({ ...baseFilters(), feature: selectedFeature });
      setDailyData(formatDaily(data.daily));
    } catch {
      // silent
    }
  }, [baseFilters, selectedFeature]);

  // Re-fetch overview when filters change
  useEffect(() => { fetchOverview(); }, [fetchOverview]);
  // Re-fetch daily when selected feature changes
  useEffect(() => { fetchDailyForFeature(); }, [fetchDailyForFeature]);

  // Save filters to cookies whenever they change
  useEffect(() => {
    saveFiltersToCookies({
      dateFrom: dateRange?.from?.toISOString() || "",
      dateTo: dateRange?.to?.toISOString() || "",
      age: ageFilter,
      gender: genderFilter,
    });
  }, [dateRange, ageFilter, genderFilter]);

  const topFeature = featureData[0]?.feature ?? "N/A";
  const avgDaily =
    dailyData.length > 0
      ? Math.round(dailyData.reduce((s, d) => s + d.clicks, 0) / dailyData.length)
      : 0;

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      // continue logout even if request fails
    }
    toast.success("Logged out");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-lg bg-primary flex items-center justify-center">
              <Activity className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight">Product Analytics</h1>
              <p className="text-xs text-muted-foreground">Real-time usage dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs">
              <span className="size-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />
              Live
            </Badge>
            <Button variant="destructive" size="sm" onClick={handleLogout}>
              <LogOut className="size-4 mr-1.5" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Filters */}
        <div>
          <div>
            <div className="flex flex-wrap items-end gap-4">
              {/* Date Range Picker */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />
                  Date Range
                </label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="lg"
                      className={cn(
                        "w-70 justify-start text-left font-normal",
                        !dateRange && "text-muted-foreground"
                      )}
                      onClick={() => trackClick("date_picker")}
                    >
                      {dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "MMM dd, yyyy")} -{" "}
                            {format(dateRange.to, "MMM dd, yyyy")}
                          </>
                        ) : (
                          format(dateRange.from, "MMM dd, yyyy")
                        )
                      ) : (
                        "Pick a date range"
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      defaultMonth={dateRange?.from}
                      selected={dateRange}
                      onSelect={setDateRange}
                      numberOfMonths={2}
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Age Filter */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  Age Group
                </label>
                <Select value={ageFilter} onValueChange={(v) => { setAgeFilter(v); trackClick("filter_age"); }}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Ages" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ages</SelectItem>
                    <SelectItem value="<18">Under 18</SelectItem>
                    <SelectItem value="18-40">18 - 40</SelectItem>
                    <SelectItem value=">40">Over 40</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Gender Filter */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                  <Users className="size-3.5" />
                  Gender
                </label>
                <Select value={genderFilter} onValueChange={(v) => { setGenderFilter(v); trackClick("filter_gender"); }}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="All Genders" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Genders</SelectItem>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Clear All Filters */}
              <Button
                variant="destructive"
                size="lg"
                onClick={() => {
                  setDateRange({ from: subDays(new Date(), 90), to: new Date() });
                  setAgeFilter("all");
                  setGenderFilter("all");
                  setSelectedFeature(null);
                }}
              >
                <X className="size-4 mr-1.5" />
                Clear All Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className={cn("bg-linear-to-br", STAT_CARDS[0].gradient, "border-blue-200/50")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Clicks
              </CardTitle>
              <div className={cn("size-8 rounded-lg flex items-center justify-center", STAT_CARDS[0].iconBg)}>
                <MousePointerClick className={cn("size-4", STAT_CARDS[0].iconColor)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : totalClicks.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground mt-1">In selected period</p>
            </CardContent>
          </Card>
          <Card className={cn("bg-linear-to-br", STAT_CARDS[1].gradient, "border-emerald-200/50")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unique Users
              </CardTitle>
              <div className={cn("size-8 rounded-lg flex items-center justify-center", STAT_CARDS[1].iconBg)}>
                <Users className={cn("size-4", STAT_CARDS[1].iconColor)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : uniqueUsers}</div>
              <p className="text-xs text-muted-foreground mt-1">Active in period</p>
            </CardContent>
          </Card>
          <Card className={cn("bg-linear-to-br", STAT_CARDS[2].gradient, "border-amber-200/50")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Top Feature
              </CardTitle>
              <div className={cn("size-8 rounded-lg flex items-center justify-center", STAT_CARDS[2].iconBg)}>
                <TrendingUp className={cn("size-4", STAT_CARDS[2].iconColor)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? "—" : (FEATURE_LABELS[topFeature] ?? topFeature)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {featureData[0]?.clicks ?? 0} clicks
              </p>
            </CardContent>
          </Card>
          <Card className={cn("bg-linear-to-br", STAT_CARDS[3].gradient, "border-violet-200/50")}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Daily
              </CardTitle>
              <div className={cn("size-8 rounded-lg flex items-center justify-center", STAT_CARDS[3].iconBg)}>
                <Activity className={cn("size-4", STAT_CARDS[3].iconColor)} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{loading ? "—" : avgDaily}</div>
              <p className="text-xs text-muted-foreground mt-1">Clicks per day</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart - Feature Usage */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="size-4" />
                    Feature Usage
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Total clicks per feature. Click a bar to filter the trend.
                  </CardDescription>
                </div>
                {selectedFeature && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFeature(null)}
                  >
                    Clear selection
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <ChartContainer config={barChartConfig} className="h-80 w-full **:outline-none!">
                <BarChart
                  data={featureData}
                  layout="vertical"
                  margin={{ left: 0, right: 16, top: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <YAxis
                    dataKey="feature"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={110}
                    tick={{ fontSize: 12 }}
                    tickFormatter={(v) => FEATURE_LABELS[v] ?? v}
                  />
                  <XAxis type="number" tickLine={false} axisLine={false} />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        labelFormatter={(v) => FEATURE_LABELS[v as string] ?? v}
                      />
                    }
                  />
                  <Bar
                    dataKey="clicks"
                    radius={[0, 6, 6, 0]}
                    className="cursor-pointer"
                    onClick={(_data, index) => {
                      const feature = featureData[index]?.feature;
                      if (feature) {
                        setSelectedFeature(
                          feature === selectedFeature ? null : feature
                        );
                        trackClick("chart_bar");
                      }
                    }}
                    shape={(props: BarShapeProps) => {
                      const { x, y, width, height } = props;
                      const feature = (props as BarShapeProps & { feature: string }).feature;
                      const color = FEATURE_COLORS[feature] ?? "var(--chart-1)";
                      const isActive = selectedFeature === null || selectedFeature === feature;
                      return (
                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          rx={6}
                          fill={color}
                          opacity={isActive ? 1 : 0.25}
                          className="cursor-pointer transition-opacity duration-200"
                        />
                      );
                    }}
                  />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          {/* Line Chart - Daily Trend */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4" />
                {selectedFeature
                  ? `${FEATURE_LABELS[selectedFeature] ?? selectedFeature} — Daily Trend`
                  : "All Features — Daily Trend"}
              </CardTitle>
              <CardDescription>
                {selectedFeature
                  ? `Click count over time for ${FEATURE_LABELS[selectedFeature] ?? selectedFeature}`
                  : "Aggregated click count over time"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer config={lineChartConfig} className="h-80 w-full">
                <LineChart
                  data={dailyData}
                  margin={{ left: 0, right: 16, top: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 10 }}
                    angle={-35}
                    textAnchor="end"
                    height={50}
                    interval={Math.max(0, Math.floor(dailyData.length / 10))}
                  />
                  <YAxis tickLine={false} axisLine={false} width={35} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line
                    type="monotone"
                    dataKey="clicks"
                    stroke={selectedFeature ? FEATURE_COLORS[selectedFeature] ?? "var(--chart-1)" : "var(--chart-1)"}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
