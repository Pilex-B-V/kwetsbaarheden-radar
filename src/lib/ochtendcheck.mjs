// De ochtendcheck zelf: bronnen ophalen, vergelijken met de techniekkaart en
// alles samenbrengen in één rapport waar de mail van wordt gemaakt.

import { staatSleutel, stelBevindingenOp, soortLek } from "./beoordeel.mjs";
import { ernstVanLabel, ernstVanScore } from "./cvss.mjs";
import { wacht } from "./http.mjs";
import { maakInstructie } from "./instructie.mjs";
import { zoekOsv } from "./bronnen/osv.mjs";
import {
  CPE_NAMEN,
  controleerNode,
  controleerPlatform,
  haalEpss,
  haalEuvd,
  haalKev,
  haalNcsc,
  telNieuw,
} from "./bronnen/overig.mjs";

const DAG = 24 * 60 * 60 * 1000;

export function datumTeksten(nu, tijdzone) {
  const maak = (opties) =>
    new Intl.DateTimeFormat("nl-NL", { timeZone: tijdzone, ...opties })
      .format(nu)
      .replace(/\./g, "");
  return {
    kort: maak({ weekday: "short", day: "numeric", month: "short" }),
    lang: maak({ day: "numeric", month: "long", year: "numeric" }),
  };
}

const dagMaand = (iso, tijdzone) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: tijdzone, day: "numeric", month: "short" })
    .format(new Date(iso))
    .replace(/\./g, "");

// Woorden die te algemeen zijn om een NCSC-advies aan een onderdeel te koppelen.
const TE_ALGEMEEN = new Set(
  "core server client utils types common test tools http https path debug config table form date time color events stream buffer crypto process util mail image files cache proxy router plugin toolkit kernel android windows linux chrome office cloud data open free next-app".split(" "),
);

/** Zoekt NCSC-adviezen die een onderdeel van de kaart bij naam noemen. */
export function ncscVoorKaart(adviezen, kaart, sinds, alGekoppeld = new Set()) {
  const termen = new Map();
  const voegToe = (term, label) => {
    const t = term.toLowerCase();
    if (t.length >= 4 && !TE_ALGEMEEN.has(t) && !termen.has(t)) termen.set(t, label);
  };
  for (const app of kaart.apps) {
    for (const p of app.platform) {
      voegToe(p.naam, `${p.naam} (${app.naam})`);
      if (/^node(js)?$/i.test(p.naam)) voegToe("node.js", `Node.js (${app.naam})`);
    }
    for (const o of app.onderdelen) {
      if (o.direct !== true || o.dev) continue;
      voegToe(o.naam.replace(/^@/, ""), `${o.naam} (${app.naam})`);
      const m = o.naam.match(/^@([^/]+)\//);
      if (m) voegToe(m[1], `${o.naam} (${app.naam})`);
    }
  }
  const uit = [];
  for (const a of adviezen) {
    if (a.datum < sinds || alGekoppeld.has(a.id)) continue;
    const tekst = `${a.titel} ${(a.producten ?? []).join(" ")}`.toLowerCase();
    const raakt = [];
    for (const [term, label] of termen) {
      const patroon = new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
      if (patroon.test(tekst)) raakt.push(label);
    }
    if (raakt.length) uit.push({ ...a, raakt: [...new Set(raakt)].slice(0, 4) });
  }
  return uit;
}

async function probeer(bronnen, naam, taak, terugval) {
  try {
    const uit = await taak();
    bronnen.push({ naam, gelukt: true });
    return uit;
  } catch (fout) {
    bronnen.push({ naam, gelukt: false, fout: fout.message });
    return terugval;
  }
}

async function controleerPlatformen(kaart, bronnen, waarschuwingen, opties) {
  const uit = [];
  const gedaan = new Map();
  let nvdGebruikt = false;
  let nodeGebruikt = false;
  const fouten = { nvd: null, node: null };
  for (const app of kaart.apps) {
    for (const p of app.platform) {
      const naam = p.naam.toLowerCase();
      const sleutel = `${naam}|${p.versie}`;
      if (!gedaan.has(sleutel)) {
        let meldingen = [];
        if (/^node(\.?js)?$/.test(naam)) {
          nodeGebruikt = true;
          try {
            const r = await controleerNode(p.versie, opties);
            if (r) {
              meldingen = [
                {
                  id: `nodejs-${p.versie}`,
                  cve: null,
                  titel: `${r.gemist} ${r.gemist === 1 ? "beveiligingsrelease" : "beveiligingsreleases"} gemist; de laatste is van ${r.datum}`,
                  score: null,
                  ernst: "hoog",
                  kwaadaardig: false,
                  soort: {
                    kort: "beveiligingsupdates gemist",
                    uitleg:
                      "Node.js bracht na jouw versie beveiligingsreleases uit. De ernst verschilt per release; de radar gaat uit van hoog.",
                  },
                  gepubliceerd: r.datum,
                  url: "https://nodejs.org/en/blog/vulnerability",
                  fix: r.nieuwste,
                },
              ];
            }
          } catch (fout) {
            fouten.node = fout.message;
          }
        } else if (p.cpe ?? CPE_NAMEN[naam]) {
          if (nvdGebruikt && !opties.omgeving?.NVD_API_KEY) await wacht(opties.nvdPauze ?? 6500);
          nvdGebruikt = true;
          try {
            const lijst = await controleerPlatform(p.cpe ?? CPE_NAMEN[naam], p.versie, opties);
            meldingen = lijst.map((m) => ({
              id: m.cve,
              cve: m.cve,
              titel: m.titel.split(/(?<=\.)\s/)[0].slice(0, 180),
              score: m.score,
              ernst: m.label ? ernstVanLabel(m.label) : ernstVanScore(m.score),
              kwaadaardig: false,
              soort: soortLek(m.cwe),
              gepubliceerd: m.gepubliceerd,
              url: `https://nvd.nist.gov/vuln/detail/${m.cve}`,
              fix: m.fix,
            }));
          } catch (fout) {
            fouten.nvd = fout.message;
          }
        } else {
          meldingen = null;
        }
        gedaan.set(sleutel, meldingen);
      }
      const meldingen = gedaan.get(sleutel);
      if (meldingen === null) {
        waarschuwingen.push(
          `${app.naam}: ${p.naam} ${p.versie} staat op de kaart, maar de radar kent de naam niet en controleert het niet. Zet er een "cpe" bij (zie de README).`,
        );
      } else if (meldingen.length) {
        uit.push({ app: app.naam, naam: p.naam, versie: p.versie, meldingen: meldingen.map((m) => ({ ...m })) });
      }
    }
  }
  if (nodeGebruikt) bronnen.push({ naam: "nodejs.org", gelukt: !fouten.node, fout: fouten.node ?? undefined });
  return { uit, nvdFout: nvdGebruikt ? fouten.nvd : undefined, nvdGebruikt };
}

/**
 * Draait de hele check. `staat` komt uit laadStaat; de functie past
 * staat.gezien en staat.cache aan, zodat de aanroeper ze kan bewaren.
 */
export async function ochtendcheck(kaart, staat, opties = {}) {
  const nu = opties.nu ?? new Date();
  const tijdzone = opties.tijdzone ?? "Europe/Amsterdam";
  const bronnen = [];
  const waarschuwingen = [];

  const uniek = new Map();
  for (const app of kaart.apps) {
    for (const w of app.waarschuwingen ?? []) waarschuwingen.push(`${app.naam}: ${w}`);
    for (const o of app.onderdelen) uniek.set(`${o.ecosysteem}|${o.naam}|${o.versie}`, o);
  }

  const osv = await probeer(
    bronnen,
    "OSV.dev (GitHub Advisories)",
    () => zoekOsv([...uniek.values()], { fetchFn: opties.fetchFn, cache: staat.cache.osv }),
    null,
  );
  const mislukt = osv === null;

  const sinds =
    staat.laatsteRun && nu - staat.laatsteRun < 7 * DAG && nu - staat.laatsteRun > 60_000
      ? staat.laatsteRun
      : new Date(nu - DAG);

  const [nieuwGepubliceerd, kev, ncsc] = await Promise.all([
    probeer(bronnen, "NVD", () => telNieuw(sinds, nu, opties), null),
    probeer(bronnen, "CISA KEV", () => haalKev(opties), new Map()),
    probeer(bronnen, "NCSC", () => haalNcsc({ fetchFn: opties.fetchFn, cache: staat.cache.ncsc }), []),
  ]);

  const platform = await controleerPlatformen(kaart, bronnen, waarschuwingen, opties);
  const nvd = bronnen.find((b) => b.naam === "NVD");
  if (platform.nvdFout && nvd?.gelukt) {
    nvd.gelukt = false;
    nvd.fout = platform.nvdFout;
  }
  if (platform.nvdFout) {
    waarschuwingen.push("De platformonderdelen (zoals je database) zijn vandaag niet gecontroleerd: NVD gaf geen antwoord.");
  }

  const alleMeldingen = [...(osv?.meldingen.values() ?? [])];
  const cves = new Set();
  const zwaar = new Set();
  for (const m of alleMeldingen) {
    const cve = [...(m.aliases ?? []), m.id].find((a) => /^CVE-/.test(a));
    if (!cve) continue;
    cves.add(cve);
    if (/^(CRITICAL|HIGH)$/i.test(m.label ?? "")) zwaar.add(cve);
  }
  for (const p of platform.uit) {
    for (const m of p.meldingen) {
      if (!m.cve) continue;
      cves.add(m.cve);
      if (m.ernst === "kritiek" || m.ernst === "hoog") zwaar.add(m.cve);
    }
  }
  const epss = cves.size
    ? await probeer(bronnen, "EPSS", () => haalEpss([...cves], opties), new Map())
    : new Map();
  const euvd = zwaar.size
    ? await probeer(bronnen, "EUVD", () => haalEuvd([...zwaar].slice(0, 40), opties), new Map())
    : new Map();

  const bevindingen = mislukt
    ? []
    : stelBevindingenOp(kaart, osv, platform.uit, { kev, epss, euvd, ncsc });

  // Wat is nieuw sinds de vorige run.
  const gezien = {};
  for (const b of bevindingen) {
    let oudste = null;
    b.nieuw = false;
    for (const m of b.meldingen) {
      const sleutel = staatSleutel(b, m);
      const eerder = staat.gezien[sleutel];
      m.nieuw = !eerder;
      if (m.nieuw) b.nieuw = true;
      gezien[sleutel] = eerder ?? nu.toISOString();
      if (eerder && (!oudste || eerder < oudste)) oudste = eerder;
    }
    b.sinds = oudste ? dagMaand(oudste, tijdzone) : null;
  }
  if (!mislukt) staat.gezien = gezien;

  const gekoppeld = new Set(
    bevindingen.flatMap((b) => b.meldingen.map((m) => m.ncsc?.id).filter(Boolean)),
  );
  const ncscNieuws = ncscVoorKaart(ncsc, kaart, sinds, gekoppeld);

  const datum = datumTeksten(nu, tijdzone);
  const uitgelicht = bevindingen.filter((b) => b.niveau <= 1);
  const overig = bevindingen.filter((b) => b.niveau > 1);
  const metBevinding = new Set(bevindingen.map((b) => b.app));
  const instructies = kaart.apps
    .map((app) => ({ app: app.naam, tekst: maakInstructie(app, bevindingen, datum.lang) }))
    .filter((i) => i.tekst);

  return {
    datum,
    nu,
    mislukt,
    eersteRun: staat.eersteRun,
    cijfers: {
      apps: kaart.apps.length,
      onderdelen: uniek.size + kaart.apps.reduce((n, a) => n + a.platform.length, 0),
      nieuwGepubliceerd,
      nieuwUitgelicht: uitgelicht.filter((b) => b.nieuw).length,
      openUitgelicht: uitgelicht.filter((b) => !b.nieuw).length,
      nieuwOverig: overig.filter((b) => b.nieuw).length,
      openOverig: overig.filter((b) => !b.nieuw).length,
      misbruikt: bevindingen.filter((b) => b.misbruikt).length,
    },
    bevindingen,
    rustig: mislukt ? [] : kaart.apps.filter((a) => !metBevinding.has(a.naam)).map((a) => a.naam),
    apps: kaart.apps.map((a) => ({ naam: a.naam, aantal: a.onderdelen.length + a.platform.length })),
    ncscNieuws,
    waarschuwingen,
    instructies,
    // In de mail alleen de instructies voor apps waar nu iets moet gebeuren.
    instructiesMail: instructies.filter((i) => uitgelicht.some((b) => b.app === i.app)),
    bronnen,
  };
}
