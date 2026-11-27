#!/usr/bin/env node
// Kwetsbaarheden-radar: vergelijkt de onderdelen op je techniekkaart met de
// openbare bronnen over kwetsbaarheden en maakt er één ochtendmail van.
//
//   node src/radar.mjs                  de check draaien en de mail versturen
//   node src/radar.mjs --droog          alles doen, maar niets versturen of onthouden
//   node src/radar.mjs --kaart pad.json een andere techniekkaart gebruiken

import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { laadKaart } from "./lib/kaart.mjs";
import { maakHtml, maakRapport, maakTekst, status } from "./lib/mail.mjs";
import { ochtendcheck } from "./lib/ochtendcheck.mjs";
import { bewaarStaat, laadStaat } from "./lib/staat.mjs";
import { verstuur, verzendwijze } from "./lib/verstuur.mjs";

const HULP = `Kwetsbaarheden-radar

Gebruik:
  node src/radar.mjs [opties]

Opties:
  --kaart <pad>   De techniekkaart (standaard techniekkaart.json, of RADAR_KAART)
  --uit <map>     Waar de mail en het rapport komen te staan (standaard uit)
  --droog         Niets versturen en niets onthouden; handig om te testen
  --help          Deze uitleg

Versturen stel je in met omgevingsvariabelen, zie de README.`;

const slug = (naam) =>
  naam
    .toLowerCase()
    .normalize("NFD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "app";

async function hoofd() {
  const { values: optie } = parseArgs({
    options: {
      kaart: { type: "string" },
      uit: { type: "string", default: "uit" },
      droog: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (optie.help) {
    console.log(HULP);
    return 0;
  }
  const omgeving = process.env;
  const kaartPad = optie.kaart ?? omgeving.RADAR_KAART ?? "techniekkaart.json";
  const staatMap = omgeving.RADAR_STAAT_MAP ?? ".radar";

  // Een halve instelling is een fout: liever nu stoppen dan stil niets sturen.
  const wijze = optie.droog ? null : verzendwijze(omgeving);

  const kaart = await laadKaart(kaartPad, { omgeving });
  const staat = optie.droog
    ? { eersteRun: true, laatsteRun: null, gezien: {}, cache: { osv: {}, ncsc: {} } }
    : await laadStaat(staatMap);

  console.log(
    `Techniekkaart: ${kaart.apps.length} ${kaart.apps.length === 1 ? "app" : "apps"}, ` +
      `${kaart.apps.reduce((n, a) => n + a.onderdelen.length, 0)} onderdelen. Bronnen ophalen...`,
  );
  const rapport = await ochtendcheck(kaart, staat, {
    omgeving,
    tijdzone: omgeving.RADAR_TIJDZONE ?? "Europe/Amsterdam",
  });

  const s = status(rapport);
  const mail = {
    onderwerp: s.onderwerp,
    status: s.kort,
    html: maakHtml(rapport),
    tekst: maakTekst(rapport),
    cijfers: rapport.cijfers,
  };
  const rapportMd = maakRapport(rapport);

  await mkdir(optie.uit, { recursive: true });
  await writeFile(join(optie.uit, "ochtendmail.html"), mail.html);
  await writeFile(join(optie.uit, "ochtendmail.txt"), mail.tekst);
  await writeFile(join(optie.uit, "rapport.md"), rapportMd);
  await writeFile(
    join(optie.uit, "rapport.json"),
    JSON.stringify(
      { onderwerp: mail.onderwerp, cijfers: rapport.cijfers, bevindingen: rapport.bevindingen, waarschuwingen: rapport.waarschuwingen, bronnen: rapport.bronnen },
      null,
      1,
    ),
  );
  for (const ins of rapport.instructies) {
    await writeFile(join(optie.uit, `instructie-${slug(ins.app)}.md`), ins.tekst);
  }
  if (omgeving.GITHUB_STEP_SUMMARY) await appendFile(omgeving.GITHUB_STEP_SUMMARY, `${rapportMd}\n`);

  console.log(`\n${mail.onderwerp}`);
  for (const b of rapport.bevindingen.filter((x) => x.niveau <= 1)) {
    console.log(`  ${b.ernst.toUpperCase().padEnd(8)} ${b.app}: ${b.onderdeel.naam} ${b.onderdeel.versie} -> ${b.fix ?? "nog geen update"}`);
  }
  const overig = rapport.bevindingen.filter((x) => x.niveau > 1).length;
  if (overig) console.log(`  En ${overig} minder dringend.`);
  for (const b of rapport.bronnen.filter((x) => !x.gelukt)) console.log(`  Geen antwoord van ${b.naam}: ${b.fout}`);
  console.log(`\nMail en rapport staan in de map ${optie.uit}.`);

  if (optie.droog) {
    console.log("Droge run: er is niets verstuurd en niets onthouden.");
    return rapport.mislukt ? 1 : 0;
  }
  if (!rapport.mislukt) {
    await bewaarStaat(staatMap, { nu: rapport.nu, gezien: staat.gezien, cache: staat.cache });
  }
  const alleenBijNieuws = /^(1|true|ja)$/i.test(omgeving.RADAR_ALLEEN_BIJ_NIEUWS ?? "");
  const nieuws = rapport.mislukt || rapport.cijfers.nieuwUitgelicht + rapport.cijfers.nieuwOverig > 0;
  if (!wijze) {
    console.log("Er is geen verzendwijze ingesteld, dus er is niets verstuurd. Zie de README, stap 4.");
  } else if (alleenBijNieuws && !nieuws) {
    console.log("Niets nieuws en RADAR_ALLEEN_BIJ_NIEUWS staat aan: geen mail verstuurd.");
  } else {
    console.log(`Mail ${await verstuur(mail, { omgeving })}.`);
  }
  return rapport.mislukt ? 1 : 0;
}

hoofd().then(
  (code) => {
    process.exitCode = code;
  },
  (fout) => {
    console.error(`\nFout: ${fout.message}`);
    process.exitCode = 2;
  },
);
