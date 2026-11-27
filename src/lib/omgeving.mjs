// Instellingen uit een bestand .env, voor als je de radar op je eigen computer
// of server draait. In GitHub Actions komen de instellingen uit de secrets en
// is er geen .env. Wat al als omgevingsvariabele is gezet, gaat voor.

import { readFileSync } from "node:fs";

/** Zet de tekst van een .env-bestand om naar naam en waarde. */
export function leesEnvTekst(tekst) {
  const uit = {};
  for (const ruw of tekst.split(/\r?\n/)) {
    const regel = ruw.trim();
    if (!regel || regel.startsWith("#")) continue;
    const m = regel.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let waarde = m[2].trim();
    const aanhaling = waarde.match(/^(["'])(.*)\1$/);
    if (aanhaling) waarde = aanhaling[2];
    else waarde = waarde.replace(/\s+#.*$/, "");
    uit[m[1]] = waarde;
  }
  return uit;
}

/**
 * Leest .env als die er is en vult aan wat nog niet is ingesteld.
 * Geeft de namen terug die zijn overgenomen, nooit de waarden.
 */
export function laadEnv(pad = ".env", omgeving = process.env) {
  let tekst;
  try {
    tekst = readFileSync(pad, "utf8");
  } catch {
    return [];
  }
  const overgenomen = [];
  for (const [naam, waarde] of Object.entries(leesEnvTekst(tekst))) {
    if (waarde !== "" && !omgeving[naam]) {
      omgeving[naam] = waarde;
      overgenomen.push(naam);
    }
  }
  return overgenomen;
}
