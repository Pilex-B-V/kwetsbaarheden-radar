// De overige bronnen. Elke functie haalt één ding op en geeft gewone gegevens
// terug. Valt een bron uit, dan vangt radar.mjs dat op en staat het in de mail.

import { gelijktijdig, haalJson, haalTekst } from "../http.mjs";
import { vergelijk, ontleed } from "../versies.mjs";

/* ── NVD: hoeveel nieuwe kwetsbaarheden zijn er gepubliceerd ─────────── */

/**
 * Telt de CVE's die NVD tussen twee momenten publiceerde.
 * Documentatie: https://nvd.nist.gov/developers/vulnerabilities
 */
export async function telNieuw(van, tot, { fetchFn, omgeving = process.env } = {}) {
  const url =
    "https://services.nvd.nist.gov/rest/json/cves/2.0" +
    `?pubStartDate=${encodeURIComponent(van.toISOString())}` +
    `&pubEndDate=${encodeURIComponent(tot.toISOString())}&resultsPerPage=1`;
  const headers = omgeving.NVD_API_KEY ? { apiKey: omgeving.NVD_API_KEY } : {};
  const antwoord = await haalJson(url, { headers, fetchFn, pauze: 7000 });
  return Number(antwoord.totalResults ?? 0);
}

/* ── CISA KEV: wordt een lek nu actief misbruikt ─────────────────────── */

/**
 * De catalogus Known Exploited Vulnerabilities van de Amerikaanse CISA.
 * Geeft Map(CVE -> { sinds, ransomware }).
 */
export async function haalKev({ fetchFn } = {}) {
  const d = await haalJson(
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
    { fetchFn, tijdslimiet: 60_000 },
  );
  return new Map(
    (d.vulnerabilities ?? []).map((v) => [
      v.cveID,
      {
        sinds: v.dateAdded,
        ransomware: String(v.knownRansomwareCampaignUse).toLowerCase() === "known",
      },
    ]),
  );
}

/* ── EPSS: hoe groot is de kans op misbruik ──────────────────────────── */

/**
 * EPSS van FIRST: de geschatte kans dat een lek binnen 30 dagen wordt
 * misbruikt. Geeft Map(CVE -> kans tussen 0 en 1).
 */
export async function haalEpss(cves, { fetchFn } = {}) {
  const uit = new Map();
  for (let i = 0; i < cves.length; i += 80) {
    const d = await haalJson(
      `https://api.first.org/data/v1/epss?cve=${cves.slice(i, i + 80).join(",")}`,
      { fetchFn },
    );
    for (const r of d.data ?? []) uit.set(r.cve, Number(r.epss));
  }
  return uit;
}

/* ── EUVD: de Europese database van ENISA ────────────────────────────── */

/**
 * Zoekt bij een CVE het EUVD-nummer en of ENISA misbruik heeft vastgelegd.
 * Geeft Map(CVE -> { id, misbruiktSinds }).
 */
export async function haalEuvd(cves, { fetchFn } = {}) {
  const uit = new Map();
  await gelijktijdig(cves, 4, async (cve) => {
    const d = await haalJson(
      `https://euvdservices.enisa.europa.eu/api/search?text=${encodeURIComponent(cve)}&size=5`,
      { fetchFn },
    );
    const treffer = (d.items ?? []).find((it) =>
      String(it.aliases ?? "").split(/\s+/).includes(cve),
    );
    if (treffer) {
      uit.set(cve, { id: treffer.id, misbruiktSinds: treffer.exploitedSince ?? null });
    }
  });
  return uit;
}

/* ── NCSC: de beveiligingsadviezen van de Nederlandse overheid ───────── */

const ontsnap = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");

/** Leest de RSS-feed van advisories.ncsc.nl. */
export function leesNcscFeed(xml) {
  const adviezen = [];
  for (const blok of xml.match(/<item>[\s\S]*?<\/item>/g) ?? []) {
    const veld = (naam) =>
      ontsnap(blok.match(new RegExp(`<${naam}>([\\s\\S]*?)</${naam}>`))?.[1] ?? "").trim();
    const titel = veld("title");
    const m = titel.match(/^(NCSC-\d{4}-\d+)\s+\[([\d.]+)\]\s+\[([LMH])\/([LMH])\]\s+(.*)$/);
    if (!m) continue;
    adviezen.push({
      id: m[1],
      versie: m[2],
      kans: m[3],
      schade: m[4],
      titel: m[5],
      link: veld("link"),
      datum: new Date(veld("pubDate")),
    });
  }
  return adviezen;
}

/**
 * Haalt de recente adviezen op, met per advies de CVE's en productnamen uit
 * het CSAF-bestand. `cache` (id+versie -> gegevens) blijft tussen runs staan.
 */
export async function haalNcsc({ fetchFn, cache = {} } = {}) {
  const adviezen = leesNcscFeed(
    await haalTekst("https://advisories.ncsc.nl/rss/advisories", { fetchFn }),
  );
  const geldig = new Set();
  await gelijktijdig(adviezen, 4, async (a) => {
    const sleutel = `${a.id}@${a.versie}`;
    geldig.add(sleutel);
    if (!cache[sleutel]) {
      const jaar = a.id.split("-")[1];
      try {
        const csaf = await haalJson(
          `https://advisories.ncsc.nl/csaf/v2/${jaar}/${a.id.toLowerCase()}.json`,
          { fetchFn, pogingen: 2 },
        );
        const producten = [];
        const loop = (takken) => {
          for (const t of takken ?? []) {
            if (t.category === "product_name" || t.category === "vendor") {
              producten.push(t.name);
            }
            loop(t.branches);
          }
        };
        loop(csaf.product_tree?.branches);
        cache[sleutel] = {
          cves: (csaf.vulnerabilities ?? []).map((v) => v.cve).filter(Boolean),
          producten: [...new Set(producten)],
        };
      } catch {
        // Zonder CSAF blijft het advies bruikbaar op titel.
        cache[sleutel] = { cves: [], producten: [] };
      }
    }
    Object.assign(a, cache[sleutel]);
  });
  for (const k of Object.keys(cache)) if (!geldig.has(k)) delete cache[k];
  return adviezen;
}

/* ── Node.js: beveiligingsreleases van de runtime zelf ───────────────── */

/**
 * Kijkt op nodejs.org welke beveiligingsreleases er na jouw versie zijn
 * verschenen in dezelfde hoofdversie. Geeft null als je bij bent.
 */
export async function controleerNode(versie, { fetchFn } = {}) {
  const lijst = await haalJson("https://nodejs.org/dist/index.json", { fetchFn });
  const hoofd = ontleed(versie).getallen[0];
  const lijn = lijst.filter((r) => ontleed(r.version).getallen[0] === hoofd);
  if (!lijn.length) return null;
  const gemist = lijn.filter((r) => r.security && vergelijk(r.version, versie) > 0);
  if (!gemist.length) return null;
  const nieuwste = lijn[0];
  return {
    gemist: gemist.length,
    nieuwste: nieuwste.version.replace(/^v/, ""),
    datum: gemist[0].date,
    eersteGemist: gemist[gemist.length - 1].date,
  };
}

/* ── NVD: platformonderdelen zoals een database of webserver ─────────── */

// Hoe NVD de bekendste platformonderdelen noemt (leverancier:product).
// Staat jouw onderdeel er niet bij, zet dan zelf "cpe" in de kaart.
export const CPE_NAMEN = {
  postgresql: "postgresql:postgresql",
  postgres: "postgresql:postgresql",
  mysql: "oracle:mysql",
  mariadb: "mariadb:mariadb",
  redis: "redis:redis",
  mongodb: "mongodb:mongodb",
  php: "php:php",
  python: "python:python",
  wordpress: "wordpress:wordpress",
  drupal: "drupal:drupal",
  apache: "apache:http_server",
};

/**
 * Zoekt in NVD de kwetsbaarheden voor één platformonderdeel in jouw versie.
 * Geeft een lijst { cve, titel, score, label, gepubliceerd, fix }.
 */
export async function controleerPlatform(cpe, versie, { fetchFn, omgeving = process.env } = {}) {
  const headers = omgeving.NVD_API_KEY ? { apiKey: omgeving.NVD_API_KEY } : {};
  const basis = `cpe:2.3:a:${cpe}:`;
  const uit = [];
  let start = 0;
  let totaal = Infinity;
  while (start < totaal) {
    const d = await haalJson(
      "https://services.nvd.nist.gov/rest/json/cves/2.0" +
        `?virtualMatchString=${encodeURIComponent(`${basis}${versie}:*:*:*:*:*:*:*`)}` +
        `&resultsPerPage=200&startIndex=${start}`,
      { headers, fetchFn, pauze: 7000 },
    );
    totaal = Number(d.totalResults ?? 0);
    const lijst = d.vulnerabilities ?? [];
    if (!lijst.length) break;
    start += lijst.length;
    for (const { cve } of lijst) {
      if (/^(Rejected|Deferred)$/i.test(cve.vulnStatus ?? "")) continue;
      // Alleen meetellen als het onderdeel zelf als kwetsbaar staat genoemd,
      // niet als het alleen de omgeving is waarin iets anders draait.
      const bereiken = [];
      for (const c of cve.configurations ?? []) {
        for (const n of c.nodes ?? []) {
          for (const m of n.cpeMatch ?? []) {
            if (m.vulnerable && m.criteria.startsWith(basis)) bereiken.push(m);
          }
        }
      }
      if (!bereiken.length) continue;
      const past = bereiken.find(
        (m) =>
          m.versionEndExcluding &&
          vergelijk(versie, m.versionEndExcluding) < 0 &&
          (!m.versionStartIncluding || vergelijk(versie, m.versionStartIncluding) >= 0),
      );
      const metriek =
        cve.metrics?.cvssMetricV31?.[0] ?? cve.metrics?.cvssMetricV30?.[0] ?? cve.metrics?.cvssMetricV40?.[0];
      uit.push({
        cve: cve.id,
        titel: (cve.descriptions ?? []).find((b) => b.lang === "en")?.value ?? "",
        score: metriek?.cvssData?.baseScore ?? null,
        label: metriek?.cvssData?.baseSeverity ?? null,
        gepubliceerd: cve.published ?? null,
        cwe: (cve.weaknesses ?? []).flatMap((w) => w.description.map((b) => b.value)).filter((w) => /^CWE-\d+$/.test(w)),
        fix: past?.versionEndExcluding ?? null,
      });
    }
  }
  return uit;
}
