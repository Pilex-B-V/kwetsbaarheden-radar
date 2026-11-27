// De update-instructie voor je developer of IT-partner: per app welke
// onderdelen naar welke versie moeten, met de opdracht erbij. De tekst is ook
// als prompt te gebruiken in Claude Code, in de map van de app.

const PLATFORM = { nodejs: "Node.js", node: "Node.js", postgresql: "PostgreSQL", postgres: "PostgreSQL" };
const naamVan = (o) => (o.ecosysteem === "platform" ? (PLATFORM[o.naam.toLowerCase()] ?? o.naam) : o.naam);

const OPDRACHT = {
  npm: (o, fix) =>
    o.direct === false
      ? `npm update ${o.naam}   (indirect onderdeel; blijft de oude versie staan, zet dan een "overrides" in package.json op ${fix})`
      : `npm install ${o.dev ? "--save-dev " : ""}${o.naam}@${fix}`,
  pnpm: (o, fix) =>
    o.direct === false
      ? `pnpm update ${o.naam}   (indirect onderdeel; blijft de oude versie staan, zet dan "pnpm.overrides" in package.json op ${fix})`
      : `pnpm add ${o.dev ? "-D " : ""}${o.naam}@${fix}`,
  yarn: (o, fix) =>
    `yarn up ${o.naam}@${fix}   (Yarn 1: yarn upgrade ${o.naam}@${fix}; indirect onderdeel: zet "resolutions" in package.json)`,
  bun: (o, fix) =>
    o.direct === false
      ? `bun update ${o.naam}   (indirect onderdeel; blijft de oude versie staan, zet dan "overrides" in package.json op ${fix})`
      : `bun add ${o.dev ? "-d " : ""}${o.naam}@${fix}`,
  pip: (o, fix) => `pip install "${o.naam}==${fix}"   (en zet dezelfde versie in requirements.txt)`,
  composer: (o, fix) => `composer require ${o.naam}:${fix}   (indirect onderdeel: composer update ${o.naam})`,
  platform: (o, fix) => `werk ${naamVan(o)} bij naar ${fix} of hoger, op de server of bij je hostingpartij`,
};

export function opdracht(onderdeel, fix) {
  const maak = OPDRACHT[onderdeel.beheerder] ?? ((o, f) => `Werk ${o.naam} bij naar ${f}.`);
  return maak(onderdeel, fix);
}

const MAX = 15;

/** Maakt de instructie voor één app. Geeft null als er niets te doen is. */
export function maakInstructie(app, bevindingen, datumTekst) {
  const lijst = bevindingen.filter((b) => b.app === app.naam);
  if (!lijst.length) return null;
  const getoond = lijst.slice(0, MAX);
  const regels = [
    `Update-instructie voor ${app.naam} (${datumTekst})`,
    "",
    "Je werkt in de repository van deze app. De onderdelen hieronder hebben een bekende kwetsbaarheid.",
    "Werk ze bij in deze volgorde en verander verder niets.",
    "",
  ];
  getoond.forEach((b, i) => {
    const o = b.onderdeel;
    const doel = b.fix ? `${o.versie} -> ${b.fix}` : `${o.versie} (nog geen herstelversie)`;
    regels.push(`${i + 1}. ${naamVan(o)} ${doel}   [${b.ernst}, ${b.advies.toLowerCase()}]`);
    if (b.meldingen[0].id.startsWith("nodejs-")) {
      regels.push(`   ${b.meldingen[0].titel}`);
    } else {
      const ids = b.meldingen.slice(0, 4).map((m) => m.cve ?? m.id);
      const meer = b.meldingen.length > 4 ? ` en nog ${b.meldingen.length - 4}` : "";
      regels.push(`   Lost op: ${ids.join(", ")}${meer}`);
    }
    if (b.kwaadaardig) {
      regels.push("   Dit pakket staat gemeld als kwaadaardig. Verwijder het, wissel alle sleutels waar de app bij kon en zoek uit wat er is gebeurd.");
    } else if (b.fix) {
      regels.push(`   Opdracht: ${opdracht(o, b.fix)}`);
      if (b.zonderFix) regels.push(`   Let op: voor ${b.zonderFix} van deze meldingen is nog geen herstelversie.`);
    } else {
      regels.push(`   Er is nog geen herstelversie. Lees de melding voor een tijdelijke maatregel: ${b.meldingen[0].url}`);
    }
    regels.push("");
  });
  if (lijst.length > MAX) {
    regels.push(`En nog ${lijst.length - MAX} onderdelen met lagere urgentie: zie rapport.md.`, "");
  }
  regels.push(
    "Daarna:",
    "- Draai de tests en de build.",
    "- Controleer in een testomgeving of inloggen en de belangrijkste schermen werken.",
    "- Rol uit en controleer de live app.",
    "- Meld welke versies er nu staan, zodat de techniekkaart klopt.",
    "",
    "Meldingen:",
    ...getoond.flatMap((b) =>
      b.meldingen.slice(0, 4).map((m) => `- ${m.cve ?? (m.id.startsWith("nodejs-") ? "Node.js" : m.id)}: ${m.url}`),
    ),
  );
  return regels.join("\n");
}
