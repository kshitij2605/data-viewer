import client from './client.ts';

export interface UserInfo {
  id: number;
  username: string;
  display_name: string;
}

export interface LoginResponse {
  token: string;
  user: UserInfo;
}

export async function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  const res = await client.post<LoginResponse>('/auth/login', {
    username,
    password,
  });
  return res.data;
}

export async function logout(): Promise<void> {
  await client.post('/auth/logout');
}

export async function getMe(): Promise<UserInfo> {
  const res = await client.get<UserInfo>('/auth/me');
  return res.data;
}
