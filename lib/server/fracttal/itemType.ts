// Fracttal item types - the five asset categories the API filters by.
// This is why it exists: item_type values appear in queries and responses;
// centralizing them keeps the magic numbers in one place, and toItemType
// rejects unknown values so a new upstream type is listed, never guessed.
export const ITEM_TYPES = {
  Location: 1,
  Equipment: 2,
  Tools: 3,
  SpareParts: 4,
  Digital: 5,
} as const;

export type ItemTypeValue = (typeof ITEM_TYPES)[keyof typeof ITEM_TYPES];

export const ITEM_TYPE_LABELS: Record<ItemTypeValue, string> = {
  1: "Locations",
  2: "Equipment",
  3: "Tools",
  4: "Spare Parts and Supplies",
  5: "Digital",
};

// toItemType: validates a raw upstream value; undefined (not a known type)
// is reported instead of being coerced into the wrong bucket.
export function toItemType(value: unknown): ItemTypeValue | undefined {
  const matched = Object.values(ITEM_TYPES).find((v) => v === value);
  return matched as ItemTypeValue | undefined;
}
