// Prefer a supported capture size close to our stored 1600px image. JPEG quality
// alone reduces bytes, not the number of pixels decoded during processing.
export function choosePictureSize(sizes: string[]): string | undefined {
  const available = sizes.map((size) => {
    const match = /^(\d+)x(\d+)$/.exec(size);
    return match ? { size, width: Number(match[1]), height: Number(match[2]) } : null;
  }).filter((size): size is { size: string; width: number; height: number } => size !== null && size.width > 0 && size.height > 0);
  const bounded = available.filter(({ width, height }) => Math.max(width, height) <= 1600);
  return bounded.sort((a, b) => b.width * b.height - a.width * a.height)[0]?.size
    ?? available.sort((a, b) => a.width * a.height - b.width * b.height)[0]?.size;
}
