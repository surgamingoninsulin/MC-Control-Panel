type Parts = [number, number, number];

const parse = (value: string): Parts | null => {
  const match = value.match(/^(\d+)\.(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3] || 0)];
};

export const compareMcVersion = (a: string, b: string): number => {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return b.localeCompare(a);
  if (pa[0] !== pb[0]) return pb[0] - pa[0];
  if (pa[1] !== pb[1]) return pb[1] - pa[1];
  return pb[2] - pa[2];
};

export const isVersionGte = (value: string, min: string): boolean => {
  const pv = parse(value);
  const pm = parse(min);
  if (!pv || !pm) return false;
  if (pv[0] !== pm[0]) return pv[0] > pm[0];
  if (pv[1] !== pm[1]) return pv[1] > pm[1];
  return pv[2] >= pm[2];
};

export const isVersionLte = (value: string, max: string): boolean => {
  const pv = parse(value);
  const pm = parse(max);
  if (!pv || !pm) return false;
  if (pv[0] !== pm[0]) return pv[0] < pm[0];
  if (pv[1] !== pm[1]) return pv[1] < pm[1];
  return pv[2] <= pm[2];
};

