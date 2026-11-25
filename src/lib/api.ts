import type { Api } from '../types';

export const API_URL = 'https://qenbkrxjsxbsetfeffza.supabase.co/functions/v1/games-api';

export class ApiError extends Error {
  /** 0 when the request never reached the server. */
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function call<A extends keyof Api>(action: A, req: Api[A]['req']): Promise<Api[A]['res']> {
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...req }),
    });
  } catch {
    throw new ApiError('No connection', 0);
  }
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    // fall through to the status check
  }
  if (!res.ok || body == null) throw new ApiError(body?.error ?? `Server error (${res.status})`, res.status);
  return body as Api[A]['res'];
}
