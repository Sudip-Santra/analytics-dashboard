import { apiFetch } from "./api";

interface LoginResponse {
  message: string;
  user: { id: number; email: string };
}

interface MeResponse {
  id: number;
  email: string;
  age: number;
  gender: string;
}

interface RegisterPayload {
  email: string;
  password: string;
  confirm_password: string;
  age: number;
  gender: string;
}

export async function register(payload: RegisterPayload) {
  const { data } = await apiFetch<LoginResponse>("/register", {
    method: "POST",
    body: payload,
  });
  return data;
}

export async function login(email: string, password: string) {
  const { data } = await apiFetch<LoginResponse>("/login", {
    method: "POST",
    body: { email, password },
  });
  return data;
}

export async function logout() {
  await apiFetch<{ message: string }>("/logout", { method: "POST" });
}

export async function getMe() {
  const { data } = await apiFetch<MeResponse>("/me");
  return data;
}
