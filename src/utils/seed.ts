export function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (Math.imul(31, hash) + str.charCodeAt(i)) | 0;
  }
  return hash >>> 0;
}

export function composeSeed(
  marketTrendSeed: number,
  storeSeed: number,
  itemId: string,
  dayNumber: number,
): number {
  return (marketTrendSeed ^ storeSeed ^ hashString(itemId) ^ dayNumber) >>> 0;
}

export function utcHourNumber(): number {
  return Math.floor(Date.now() / 3600000);
}
