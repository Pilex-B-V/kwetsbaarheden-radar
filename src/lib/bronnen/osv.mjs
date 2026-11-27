// OSV.dev: de open database van Google waarin onder meer de GitHub Advisory
// Database, PyPA en de meldingen over kwaadaardige pakketten samenkomen.
// De radar stuurt per onderdeel alleen ecosysteem, naam en versie.
// Documentatie: https://google.github.io/osv.dev/api/

import { gelijktijdig, haalJson } from "../http.mjs";

const API = "https://api.osv.dev/v1";
const PER_VERZOEK = 500;

const sleutel = (o) => `${o.ecosysteem}|${o.naam}|${o.versie}`;

/** Houdt van een melding alleen over wat de radar gebruikt. */
function kort(v) {
  return {
    id: v.id,
    summary: v.summary ?? "",
    details: (v.details ?? "").slice(0, 1200),
    aliases: v.aliases ?? [],
    published: v.published ?? null,
    modified: v.modified ?? null,
    withdrawn: v.withdrawn ?? null,
    severity: v.severity ?? [],
    label: v.database_specific?.severity ?? null,
    cwe: v.database_specific?.cwe_ids ?? [],
    affected: (v.affected ?? []).map((a) => ({
      package: a.package
        ? { ecosystem: a.package.ecosystem, name: a.package.name }
        : null,
      ranges: (a.ranges ?? []).filter((r) => r.type !== "GIT"),
      versions: undefined,
      severity: a.severity ?? [],
    })),
    references: (v.references ?? [])
      .filter((r) => r.type === "ADVISORY" || r.type === "WEB")
      .slice(0, 6)
      .map((r) => r.url),
  };
}

/**
 * Zoekt voor elk onderdeel de bekende meldingen.
 * Geeft { perOnderdeel: Map(sleutel -> id[]), meldingen: Map(id -> melding) }.
 * `cache` is een gewoon object (id -> melding) dat tussen runs bewaard blijft.
 */
export async function zoekOsv(onderdelen, { fetchFn, cache = {} } = {}) {
  const perOnderdeel = new Map();
  const gewijzigd = new Map();

  for (let start = 0; start < onderdelen.length; start += PER_VERZOEK) {
    let open = onderdelen.slice(start, start + PER_VERZOEK).map((o) => ({
      onderdeel: o,
      vraag: { package: { ecosystem: o.ecosysteem, name: o.naam }, version: o.versie },
    }));
    // Een antwoord kan per onderdeel een vervolgpagina hebben.
    while (open.length) {
      const antwoord = await haalJson(`${API}/querybatch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ queries: open.map((x) => x.vraag) }),
        fetchFn,
      });
      const volgende = [];
      (antwoord.results ?? []).forEach((r, i) => {
        const { onderdeel, vraag } = open[i];
        const lijst = perOnderdeel.get(sleutel(onderdeel)) ?? [];
        for (const v of r.vulns ?? []) {
          lijst.push(v.id);
          gewijzigd.set(v.id, v.modified ?? null);
        }
        if (lijst.length) perOnderdeel.set(sleutel(onderdeel), lijst);
        if (r.next_page_token) {
          volgende.push({ onderdeel, vraag: { ...vraag, page_token: r.next_page_token } });
        }
      });
      open = volgende;
    }
  }

  const ophalen = [...gewijzigd.keys()].filter(
    (id) => !cache[id] || cache[id].modified !== gewijzigd.get(id),
  );
  await gelijktijdig(ophalen, 8, async (id) => {
    cache[id] = kort(await haalJson(`${API}/vulns/${encodeURIComponent(id)}`, { fetchFn }));
  });

  const meldingen = new Map();
  for (const id of gewijzigd.keys()) {
    if (cache[id] && !cache[id].withdrawn) meldingen.set(id, cache[id]);
  }
  // De cache bevat alleen nog wat deze run nodig had.
  for (const id of Object.keys(cache)) if (!gewijzigd.has(id)) delete cache[id];
  return { perOnderdeel, meldingen };
}

export { sleutel as onderdeelSleutel };
