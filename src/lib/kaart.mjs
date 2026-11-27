// De techniekkaart: per app wat het is, wie erover gaat en uit welke
// onderdelen het bestaat. Onderdelen komen uit de kaart zelf ("onderdelen")
// of uit een lockfile ("bronnen"), lokaal of rechtstreeks uit GitHub.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { haalTekst } from "./http.mjs";
import { leesLockfile, ontdubbel } from "./lockfiles.mjs";

const GEVOELIGHEID = ["hoog", "normaal", "laag"];
const BEREIK = ["internet", "intern"];

function eis(voorwaarde, melding) {
  if (!voorwaarde) throw new Error(`Techniekkaart: ${melding}`);
}

/** Controleert de vorm van de kaart en vult standaardwaarden in. */
export function controleerKaart(kaart) {
  eis(kaart && typeof kaart === "object", "het bestand bevat geen object.");
  eis(Array.isArray(kaart.apps) && kaart.apps.length > 0, 'er staat geen app in "apps".');
  const namen = new Set();
  const apps = kaart.apps.map((app, i) => {
    eis(typeof app.naam === "string" && app.naam.trim(), `app ${i + 1} heeft geen "naam".`);
    eis(!namen.has(app.naam), `de naam "${app.naam}" komt twee keer voor.`);
    namen.add(app.naam);
    const gevoeligheid = app.gevoeligheid ?? "normaal";
    const bereikbaar = app.bereikbaar ?? "internet";
    eis(GEVOELIGHEID.includes(gevoeligheid), `"${app.naam}": gevoeligheid is hoog, normaal of laag.`);
    eis(BEREIK.includes(bereikbaar), `"${app.naam}": bereikbaar is internet of intern.`);
    for (const o of app.onderdelen ?? []) {
      eis(o.ecosysteem && o.naam && o.versie, `"${app.naam}": elk onderdeel heeft ecosysteem, naam en versie.`);
    }
    for (const p of app.platform ?? []) {
      eis(p.naam && p.versie, `"${app.naam}": elk platformonderdeel heeft naam en versie.`);
    }
    for (const b of app.bronnen ?? []) {
      eis(b.soort === "bestand" || b.soort === "github", `"${app.naam}": een bron is van de soort bestand of github.`);
      eis(b.pad, `"${app.naam}": een bron heeft een "pad".`);
      if (b.soort === "github") {
        eis(/^[\w.-]+\/[\w.-]+$/.test(b.repo ?? ""), `"${app.naam}": een github-bron heeft "repo" in de vorm eigenaar/naam.`);
      }
    }
    return {
      naam: app.naam.trim(),
      doel: app.doel ?? "",
      eigenaar: app.eigenaar ?? "",
      developer: app.developer ?? "",
      url: app.url ?? "",
      gevoeligheid,
      bereikbaar,
      platform: app.platform ?? [],
      bronnen: app.bronnen ?? [],
      onderdelen: app.onderdelen ?? [],
    };
  });
  return { bedrijf: kaart.bedrijf ?? "", apps };
}

async function leesBron(bron, basis, omgeving, fetchFn) {
  if (bron.soort === "bestand") {
    return readFile(resolve(basis, bron.pad), "utf8");
  }
  // Een openbare repository is zonder token te lezen; voor een afgeschermde is
  // een token nodig dat alleen mag lezen.
  const token = omgeving.RADAR_GITHUB_TOKEN || omgeving.GITHUB_TOKEN;
  const ref = bron.ref ? `?ref=${encodeURIComponent(bron.ref)}` : "";
  const pad = bron.pad.split("/").map(encodeURIComponent).join("/");
  try {
    return await haalTekst(
      `https://api.github.com/repos/${bron.repo}/contents/${pad}${ref}`,
      {
        headers: {
          accept: "application/vnd.github.raw+json",
          "x-github-api-version": "2022-11-28",
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        fetchFn,
      },
    );
  } catch (fout) {
    // GitHub antwoordt met 404 als je er niet bij mag, om niets te verraden.
    if (/status 40[134]/.test(fout.message)) {
      throw new Error(
        omgeving.RADAR_GITHUB_TOKEN
          ? "geen toegang. Controleer de naam van de repository en het pad, en of het token bij deze repository mag en niet is verlopen."
          : "niet gevonden. Klopt de naam en het pad? Is de repository afgeschermd, zet dan een leestoken in RADAR_GITHUB_TOKEN (README, stap 3).",
      );
    }
    throw fout;
  }
}

/**
 * Laadt de kaart en leest alle bronnen in. Een bron die niet te lezen is,
 * stopt de run niet: de app krijgt een waarschuwing die in de mail komt.
 */
export async function laadKaart(pad, { omgeving = process.env, fetchFn } = {}) {
  let ruw;
  try {
    ruw = JSON.parse(await readFile(pad, "utf8"));
  } catch (fout) {
    if (fout.code === "ENOENT") {
      throw new Error(
        `Er is nog geen ${pad}. Maak hem aan (README, stap 3) of probeer eerst het voorbeeld: npm run voorbeeld`,
      );
    }
    throw new Error(`${pad} is geen geldige JSON: ${fout.message}`);
  }
  const kaart = controleerKaart(ruw);
  const basis = dirname(resolve(pad));
  for (const app of kaart.apps) {
    app.waarschuwingen = [];
    let onderdelen = app.onderdelen.map((o) => ({ ...o }));
    for (const bron of app.bronnen) {
      const waar = bron.soort === "github" ? `${bron.repo}/${bron.pad}` : bron.pad;
      try {
        const tekst = await leesBron(bron, basis, omgeving, fetchFn);
        onderdelen = onderdelen.concat(leesLockfile(bron.pad, tekst).onderdelen);
      } catch (fout) {
        app.waarschuwingen.push(`${waar} is niet gelezen: ${fout.message}`);
      }
    }
    app.onderdelen = ontdubbel(onderdelen);
    if (!app.onderdelen.length && !app.platform.length && !app.waarschuwingen.length) {
      app.waarschuwingen.push(
        "Er zijn geen onderdelen gevonden, dus deze app is niet gecontroleerd.",
      );
    }
  }
  return kaart;
}
