export function assetUrl(relativePath: string) {
  const normalizedPath = String(relativePath || '').replace(/^\/+/, '');
  return `${import.meta.env.BASE_URL}${normalizedPath}`;
}