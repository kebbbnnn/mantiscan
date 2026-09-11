const DEFAULT_PROD_API = 'https://mantiscan-api.diegosilang.workers.dev';

export function apiUrl(path: string): string {
  // In local development without an explicit VITE_API_URL, use relative path for Vite proxy
  if (import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
    return path;
  }

  const base = import.meta.env.VITE_API_URL || DEFAULT_PROD_API;
  const cleanBase = base.replace(/\/+$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  return `${cleanBase}${cleanPath}`;
}
