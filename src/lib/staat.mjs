// Wat de radar tussen twee runs onthoudt: wanneer hij voor het laatst draaide
// en welke meldingen hij al eerder zag. Daardoor weet de mail wat nieuw is.
// Er staat niets in wat niet ook in de mail staat.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

async function leesJson(pad, standaard) {
  try {
    return JSON.parse(await readFile(pad, "utf8"));
  } catch {
    return standaard;
  }
}

export async function laadStaat(map) {
  const staat = await leesJson(join(map, "staat.json"), null);
  const cache = await leesJson(join(map, "cache.json"), {});
  return {
    eersteRun: !staat,
    laatsteRun: staat?.laatsteRun ? new Date(staat.laatsteRun) : null,
    gezien: staat?.gezien ?? {},
    cache: { osv: cache.osv ?? {}, ncsc: cache.ncsc ?? {} },
  };
}

export async function bewaarStaat(map, { nu, gezien, cache }) {
  await mkdir(map, { recursive: true });
  await writeFile(
    join(map, "staat.json"),
    JSON.stringify({ versie: 1, laatsteRun: nu.toISOString(), gezien }, null, 1),
  );
  await writeFile(join(map, "cache.json"), JSON.stringify(cache));
}
