export type CompareSelection = {
  ids: string[];
  limited: boolean;
};

export function toggleComparison(ids: string[], id: string, maximum = 4): CompareSelection {
  if (ids.includes(id)) return { ids: ids.filter((item) => item !== id), limited: false };
  if (ids.length >= maximum) return { ids, limited: true };
  return { ids: [...ids, id], limited: false };
}
