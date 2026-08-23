import type { Particular } from "./types";

/** Resolve catalog particular by id or case-insensitive name. */
export function findParticular(
  particulars: Particular[],
  ref: { id?: string | null; name?: string | null },
): Particular | undefined {
  if (ref.id) {
    const byId = particulars.find((p) => p.id === ref.id);
    if (byId) return byId;
  }
  const name = (ref.name || "").trim().toLowerCase();
  if (!name) return undefined;
  return particulars.find((p) => p.name.toLowerCase() === name);
}

export function particularLabel(
  particulars: Particular[],
  particularId: string | null | undefined,
  fallbackName = "",
): string {
  if (particularId) {
    const hit = particulars.find((p) => p.id === particularId);
    if (hit) return hit.name;
  }
  return fallbackName.trim();
}

export function resolveParticularRef(
  particulars: Particular[],
  particularId: string | null | undefined,
  particularName: string,
): { particularId: string | null; particular: string } {
  const hit = findParticular(particulars, {
    id: particularId,
    name: particularName,
  });
  if (hit) return { particularId: hit.id, particular: hit.name };
  const name = particularName.trim();
  return { particularId: null, particular: name };
}
