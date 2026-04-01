const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export async function apiFetch<T>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T; status: number }> {
  const { method = "GET", body } = options;

  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();

  if (!res.ok) {
    throw { status: res.status, detail: data.detail || "Something went wrong" };
  }

  return { data, status: res.status };
}
