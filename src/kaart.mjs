#!/usr/bin/env node
// Leest een lockfile en laat zien wat de radar erin vindt. Met --schrijf zet
// je de app met alle onderdelen in de techniekkaart.
//
//   node src/kaart.mjs ../klantportaal/package-lock.json
//   node src/kaart.mjs ../klantportaal/package-lock.json --naam "Klantportaal" --schrijf

import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { BEKENDE_BESTANDEN, leesLockfile, ontdubbel } from "./lib/lockfiles.mjs";

const HULP = `Gebruik:
  node src/kaart.mjs <lockfile> [--naam "Naam van de app"] [--kaart techniekkaart.json] [--schrijf]

De radar leest: ${BEKENDE_BESTANDEN.join(", ")}.
Zonder --schrijf krijg je alleen een overzicht en verandert er niets.`;

async function hoofd() {
  const { values: optie, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      naam: { type: "string" },
      kaart: { type: "string", default: "techniekkaart.json" },
      schrijf: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (optie.help || positionals.length !== 1) {
    console.log(HULP);
    return optie.help ? 0 : 2;
  }
  const pad = positionals[0];
  const { beheerder, onderdelen: ruw } = leesLockfile(pad, await readFile(pad, "utf8"));
  const onderdelen = ontdubbel(ruw);
  const direct = onderdelen.filter((o) => o.direct === true && !o.dev);
  console.log(`${pad}: ${onderdelen.length} onderdelen (${beheerder}).`);
  if (direct.length) {
    console.log(`\nZelf gekozen onderdelen (${direct.length}):`);
    for (const o of direct.sort((a, b) => a.naam.localeCompare(b.naam))) console.log(`  ${o.naam} ${o.versie}`);
  }
  console.log(`\nDe overige ${onderdelen.length - direct.length} komen mee met andere onderdelen of horen bij de ontwikkelomgeving.`);

  if (!optie.schrijf) {
    console.log('\nEr is niets weggeschreven. Voeg --naam "..." --schrijf toe om de app in de kaart te zetten.');
    return 0;
  }
  if (!optie.naam) {
    console.error('\nGeef de app een naam met --naam "...".');
    return 2;
  }
  let kaart = { bedrijf: "", apps: [] };
  try {
    kaart = JSON.parse(await readFile(optie.kaart, "utf8"));
  } catch (fout) {
    if (fout.code !== "ENOENT") throw new Error(`${optie.kaart} is niet te lezen: ${fout.message}`);
  }
  const lijst = onderdelen.map(({ ecosysteem, naam, versie, direct: d, dev, beheerder: b }) => ({
    ecosysteem,
    naam,
    versie,
    ...(d !== undefined ? { direct: d } : {}),
    ...(dev ? { dev: true } : {}),
    beheerder: b,
  }));
  const bestaand = kaart.apps.find((a) => a.naam === optie.naam);
  if (bestaand) {
    bestaand.onderdelen = lijst;
  } else {
    kaart.apps.push({
      naam: optie.naam,
      doel: "",
      eigenaar: "",
      developer: "",
      gevoeligheid: "normaal",
      bereikbaar: "internet",
      platform: [],
      onderdelen: lijst,
    });
  }
  await writeFile(optie.kaart, `${JSON.stringify(kaart, null, 2)}\n`);
  console.log(`\n${optie.naam} staat ${bestaand ? "bijgewerkt " : ""}in ${optie.kaart}. Vul doel, eigenaar, developer en platform zelf aan.`);
  return 0;
}

hoofd().then(
  (code) => {
    process.exitCode = code;
  },
  (fout) => {
    console.error(`Fout: ${fout.message}`);
    process.exitCode = 2;
  },
);
