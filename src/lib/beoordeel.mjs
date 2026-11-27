// Van ruwe meldingen naar bevindingen: per app en per onderdeel wat er speelt,
// hoe zwaar het weegt, welke versie het oplost en hoeveel werk dat is.
// Alle regels staan uitgelegd in docs/hoe-het-werkt.md.

import { cvss3Score, ernstVanLabel, ernstVanScore, zwaarste } from "./cvss.mjs";
import { hoogste, ontleed, sprong, vergelijk } from "./versies.mjs";

/* ── Soort lek, in gewone taal ───────────────────────────────────────── */

// De volgorde bepaalt welke omschrijving wint als een melding meer soorten
// noemt: het zwaarste gevolg staat bovenaan.
const SOORTEN = [
  {
    cwe: [94, 95, 77, 78, 502, 1336, 917, 434],
    kort: "eigen code uitvoeren",
    uitleg: "Een aanvaller kan eigen opdrachten laten uitvoeren op de server van de app.",
  },
  {
    cwe: [89, 943],
    kort: "toegang tot de database",
    uitleg: "Een aanvaller kan gegevens uit de database lezen of aanpassen.",
  },
  {
    cwe: [287, 306, 285, 862, 863, 284, 639, 290, 288, 269, 425],
    kort: "lek in de toegangscontrole",
    uitleg: "Iemand kan bij schermen of gegevens komen zonder de juiste inlog of rechten.",
  },
  {
    cwe: [22, 23, 36, 73, 59],
    kort: "bestanden op de server lezen",
    uitleg: "Een aanvaller kan bestanden op de server lezen of overschrijven die niet bedoeld zijn om te delen.",
  },
  {
    cwe: [918],
    kort: "server als tussenstation",
    uitleg: "Een aanvaller kan de server verzoeken laten doen naar interne systemen die van buiten niet bereikbaar zijn.",
  },
  {
    cwe: [79, 80, 116],
    kort: "code in de browser van gebruikers",
    uitleg: "Een aanvaller kan code laten draaien in de browser van je gebruikers en zo hun sessie overnemen.",
  },
  {
    cwe: [352, 1275, 346],
    kort: "acties uit naam van een gebruiker",
    uitleg: "Een aanvaller kan een ingelogde gebruiker ongemerkt een actie laten uitvoeren.",
  },
  {
    cwe: [200, 201, 209, 532, 524, 525, 538, 212, 359, 497],
    kort: "gegevens lekken uit",
    uitleg: "Gegevens die afgeschermd horen te zijn, kunnen bij een buitenstaander terechtkomen.",
  },
  {
    cwe: [444, 436, 113, 349, 345, 348, 601, 1321, 915, 20],
    kort: "verzoeken manipuleren",
    uitleg: "Een aanvaller kan verzoeken of antwoorden zo vervormen dat de app iets anders doet dan bedoeld.",
  },
  {
    cwe: [347, 295, 327, 326, 328, 330, 338, 916, 208],
    kort: "zwakke versleuteling of controle",
    uitleg: "Een controle op echtheid of versleuteling is te omzeilen of te zwak.",
  },
  {
    cwe: [400, 770, 1333, 835, 674, 405, 409, 407, 476, 248, 754, 617, 130, 789],
    kort: "app platleggen",
    uitleg: "Een aanvaller kan de app traag maken of laten vastlopen.",
  },
  {
    cwe: [119, 120, 121, 122, 125, 787, 416, 190, 415, 824],
    kort: "geheugenfout",
    uitleg: "Een fout in het geheugenbeheer kan leiden tot een crash, het lekken van gegevens of het uitvoeren van eigen code.",
  },
];

const ONBEKEND_SOORT = {
  kort: "beveiligingslek",
  uitleg: "Lees de melding voor wat er precies kan gebeuren.",
};

const KWAADAARDIG = {
  kort: "kwaadaardig pakket",
  uitleg:
    "Dit pakket is zelf kwaadaardig of is gekaapt. Behandel het als een inbraak: verwijder het, wissel alle sleutels en wachtwoorden waar de app bij kon en laat nakijken wat er is gebeurd.",
};

/** Vertaalt een lijst CWE-nummers naar een soort lek in gewone taal. */
export function soortLek(cweLijst) {
  const nummers = (cweLijst ?? []).map((c) => Number(String(c).replace(/\D/g, "")));
  return SOORTEN.find((s) => s.cwe.some((n) => nummers.includes(n))) ?? ONBEKEND_SOORT;
}

/* ── Herstelversie ───────────────────────────────────────────────────── */

const normaal = (ecosysteem, naam) =>
  ecosysteem === "PyPI" ? naam.toLowerCase().replace(/[-_.]+/g, "-") : naam;

/**
 * Zoekt in een OSV-melding de versie die het lek voor dit onderdeel oplost.
 * Eerst het bereik waar de huidige versie in valt; anders de laagste
 * herstelversie boven de huidige, bij voorkeur in dezelfde hoofdversie.
 */
export function herstelVersie(melding, onderdeel) {
  const inBereik = [];
  const alle = [];
  for (const a of melding.affected ?? []) {
    if (
      !a.package ||
      a.package.ecosystem !== onderdeel.ecosysteem ||
      normaal(onderdeel.ecosysteem, a.package.name) !== normaal(onderdeel.ecosysteem, onderdeel.naam)
    ) {
      continue;
    }
    for (const r of a.ranges ?? []) {
      let vanaf = null;
      for (const e of r.events ?? []) {
        if (e.introduced !== undefined) vanaf = e.introduced;
        if (e.fixed !== undefined) {
          alle.push(e.fixed);
          const naStart = vanaf === null || vanaf === "0" || vergelijk(onderdeel.versie, vanaf) >= 0;
          if (naStart && vergelijk(onderdeel.versie, e.fixed) < 0) inBereik.push(e.fixed);
          vanaf = null;
        }
      }
    }
  }
  const laagste = (lijst) => lijst.reduce((a, b) => (a && vergelijk(a, b) <= 0 ? a : b), null);
  if (inBereik.length) return laagste(inBereik);
  const hoger = alle.filter((v) => vergelijk(v, onderdeel.versie) > 0);
  const hoofd = ontleed(onderdeel.versie).getallen[0];
  const zelfdeLijn = hoger.filter((v) => ontleed(v).getallen[0] === hoofd);
  return laagste(zelfdeLijn.length ? zelfdeLijn : hoger);
}

/* ── Ernst ───────────────────────────────────────────────────────────── */

/** Bepaalt score en ernst van een OSV-melding. */
export function ernstVanMelding(melding) {
  const vectoren = [
    ...(melding.severity ?? []),
    ...(melding.affected ?? []).flatMap((a) => a.severity ?? []),
  ];
  const score = vectoren
    .map((s) => cvss3Score(s.score))
    .filter((s) => s !== null)
    .reduce((a, b) => (a === null || b > a ? b : a), null);
  const label = ernstVanLabel(melding.label);
  return { score, ernst: label !== "onbekend" ? label : ernstVanScore(score) };
}

/* ── Advies en werk ──────────────────────────────────────────────────── */

export const ADVIES = ["Vandaag", "Deze week", "Bij het volgende onderhoud", "Geen haast"];

/** Het niveau van urgentie: 0 is vandaag, 3 is geen haast. */
export function urgentie({ ernst, misbruikt, kwaadaardig, dev }, app) {
  if (misbruikt || kwaadaardig) return 0;
  let niveau = { kritiek: 0, hoog: 1, midden: 2, laag: 3, onbekend: 2 }[ernst] ?? 2;
  if (niveau === 1 && app.gevoeligheid === "hoog" && app.bereikbaar === "internet") niveau = 0;
  if (app.bereikbaar === "intern") niveau += 1;
  if (dev) niveau += 1;
  return Math.min(niveau, 3);
}

const WERK = {
  patch: "ongeveer 10 minuten werk, plus testen",
  minor: "een halfuur tot een uur werk, plus testen",
  major: "een nieuwe hoofdversie: plan een dagdeel en test goed",
  onbekend: "hoeveel werk is niet in te schatten",
};

export function werkTekst(stap, fix) {
  if (!fix) return "er is nog geen update; lees in de melding wat je tot die tijd kunt doen";
  return WERK[stap] ?? WERK.onbekend;
}

/* ── Bevindingen samenstellen ────────────────────────────────────────── */

const cveVan = (m) => (m.aliases ?? []).concat(m.id).find((a) => /^CVE-/.test(a)) ?? null;

function meldingUrl(m) {
  if (/^GHSA-/.test(m.id)) return `https://github.com/advisories/${m.id}`;
  return `https://osv.dev/vulnerability/${m.id}`;
}

/**
 * Maakt van de zoekresultaten een lijst bevindingen: één per app en onderdeel.
 * `verrijking` bevat wat de andere bronnen wisten: kev, epss, euvd, ncsc.
 */
export function stelBevindingenOp(kaart, osv, platformResultaten = [], verrijking = {}) {
  const { kev = new Map(), epss = new Map(), euvd = new Map(), ncsc = [] } = verrijking;
  const ncscPerCve = new Map();
  for (const a of ncsc) for (const cve of a.cves ?? []) if (!ncscPerCve.has(cve)) ncscPerCve.set(cve, a);

  const verrijk = (m) => {
    const cve = m.cve;
    const misbruik = cve ? kev.get(cve) : null;
    const eu = cve ? euvd.get(cve) : null;
    const advies = cve ? ncscPerCve.get(cve) : null;
    return {
      ...m,
      misbruikt: misbruik
        ? { sinds: misbruik.sinds, ransomware: misbruik.ransomware, bron: "CISA KEV" }
        : eu?.misbruiktSinds
          ? { sinds: eu.misbruiktSinds, ransomware: false, bron: "EUVD" }
          : null,
      epss: cve && epss.has(cve) ? epss.get(cve) : null,
      euvd: eu?.id ?? null,
      ncsc: advies
        ? { id: advies.id, kans: advies.kans, schade: advies.schade, link: advies.link }
        : null,
    };
  };

  const bevindingen = [];
  for (const app of kaart.apps) {
    for (const onderdeel of app.onderdelen) {
      const ids = osv.perOnderdeel.get(`${onderdeel.ecosysteem}|${onderdeel.naam}|${onderdeel.versie}`) ?? [];
      const perCve = new Map();
      for (const id of ids) {
        const ruw = osv.meldingen.get(id);
        if (!ruw) continue;
        const kwaadaardig = /^MAL-/.test(id);
        const { score, ernst } = ernstVanMelding(ruw);
        const cve = cveVan(ruw);
        const m = {
          id,
          cve,
          titel: ruw.summary || ruw.details.split("\n")[0].slice(0, 160),
          score,
          ernst: kwaadaardig ? "kritiek" : ernst,
          kwaadaardig,
          soort: kwaadaardig ? KWAADAARDIG : soortLek(ruw.cwe),
          gepubliceerd: ruw.published,
          url: meldingUrl(ruw),
          fix: kwaadaardig ? null : herstelVersie(ruw, onderdeel),
        };
        // Dezelfde kwetsbaarheid kan onder twee nummers binnenkomen.
        const sleutel = cve ?? id;
        const eerder = perCve.get(sleutel);
        if (!eerder || (/^GHSA-/.test(id) && !/^GHSA-/.test(eerder.id))) perCve.set(sleutel, m);
      }
      if (perCve.size) bevindingen.push(maakBevinding(app, "pakket", onderdeel, [...perCve.values()].map(verrijk)));
    }
  }

  for (const p of platformResultaten) {
    const app = kaart.apps.find((a) => a.naam === p.app);
    if (!app || !p.meldingen.length) continue;
    bevindingen.push(
      maakBevinding(
        app,
        "platform",
        { ecosysteem: "platform", naam: p.naam, versie: p.versie, direct: true, dev: false, beheerder: "platform" },
        p.meldingen.map(verrijk),
      ),
    );
  }

  bevindingen.sort(
    (a, b) =>
      a.niveau - b.niveau ||
      (b.score ?? 0) - (a.score ?? 0) ||
      a.app.localeCompare(b.app) ||
      a.onderdeel.naam.localeCompare(b.onderdeel.naam),
  );
  return bevindingen;
}

function maakBevinding(app, soort, onderdeel, meldingen) {
  const volgorde = { kritiek: 0, hoog: 1, midden: 2, laag: 3, onbekend: 4 };
  meldingen.sort(
    (a, b) =>
      Number(Boolean(b.misbruikt)) - Number(Boolean(a.misbruikt)) ||
      volgorde[a.ernst] - volgorde[b.ernst] ||
      (b.score ?? 0) - (a.score ?? 0),
  );
  const ernst = zwaarste(meldingen.map((m) => m.ernst));
  const misbruikt = meldingen.some((m) => m.misbruikt);
  const kwaadaardig = meldingen.some((m) => m.kwaadaardig);
  const fixes = meldingen.map((m) => m.fix).filter(Boolean);
  const fix = kwaadaardig ? null : hoogste(fixes);
  const zonderFix = meldingen.filter((m) => !m.fix).length;
  const stap = fix ? sprong(onderdeel.versie, fix) : "onbekend";
  const niveau = urgentie({ ernst, misbruikt, kwaadaardig, dev: onderdeel.dev }, app);
  return {
    app: app.naam,
    soort,
    onderdeel,
    meldingen,
    ernst,
    score: meldingen.reduce((a, m) => (m.score !== null && (a === null || m.score > a) ? m.score : a), null),
    misbruikt,
    kwaadaardig,
    fix,
    zonderFix,
    stap,
    werk: kwaadaardig ? "direct uitzoeken, dit is geen gewone update" : werkTekst(stap, fix),
    niveau,
    advies: ADVIES[niveau],
  };
}

/** De sleutel waarmee de radar onthoudt dat een melding al eerder is gezien. */
export const staatSleutel = (b, m) =>
  `${b.app}|${b.onderdeel.ecosysteem}|${b.onderdeel.naam}|${b.onderdeel.versie}|${m.cve ?? m.id}`;
