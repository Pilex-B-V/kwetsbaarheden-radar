// Lockfiles inlezen: het bestand waarin precies staat welke onderdelen, in
// welke versie, in een app zitten. Elk onderdeel komt terug als
// { ecosysteem, naam, versie, direct, dev }.
//
// direct: staat het onderdeel zelf in package.json (true) of komt het mee met
// een ander onderdeel (false). Onbekend is undefined.
// via: bij een onderdeel dat meekomt, de zelf gekozen onderdelen waar het
// onder hangt. Alleen bij lockfiles waar dat uit te lezen is.

/**
 * Zoekt voor elk onderdeel dat meekomt via welke zelf gekozen onderdelen het
 * in de app zit. `ouders` is Map(naam -> Set(namen die ervan afhangen)).
 */
function zoekVia(naam, ouders, direct) {
  const gevonden = new Set();
  const gezien = new Set([naam]);
  let laag = [naam];
  while (laag.length && gevonden.size < 3) {
    const volgende = [];
    for (const kind of laag) {
      for (const ouder of ouders.get(kind) ?? []) {
        if (gezien.has(ouder)) continue;
        gezien.add(ouder);
        if (direct.has(ouder)) gevonden.add(ouder);
        else volgende.push(ouder);
      }
    }
    laag = volgende;
  }
  return [...gevonden].sort().slice(0, 3);
}

function voegOuderToe(ouders, kind, ouder) {
  if (!ouders.has(kind)) ouders.set(kind, new Set());
  ouders.get(kind).add(ouder);
}

const SEMVER = /^\d+\.\d+/;

function splitsNaamVersie(spec) {
  const i = spec.lastIndexOf("@");
  if (i <= 0) return null;
  return { naam: spec.slice(0, i), versie: spec.slice(i + 1) };
}

/** package-lock.json en npm-shrinkwrap.json, versie 1, 2 en 3. */
export function uitPackageLock(tekst) {
  const d = JSON.parse(tekst);
  const uit = [];
  if (d.packages) {
    const root = d.packages[""] ?? {};
    const direct = new Set([
      ...Object.keys(root.dependencies ?? {}),
      ...Object.keys(root.optionalDependencies ?? {}),
      ...Object.keys(root.devDependencies ?? {}),
    ]);
    const mapnaamVan = (pad) => pad.slice(pad.lastIndexOf("node_modules/") + "node_modules/".length);
    const ouders = new Map();
    for (const [pad, p] of Object.entries(d.packages)) {
      if (!pad || !pad.includes("node_modules/")) continue;
      for (const kind of Object.keys({ ...p.dependencies, ...p.optionalDependencies })) {
        voegOuderToe(ouders, kind, mapnaamVan(pad));
      }
    }
    for (const [pad, p] of Object.entries(d.packages)) {
      if (!pad || p.link || !p.version) continue;
      // Een fork of een los bestand komt niet uit het register.
      if (/^(git|github:|file:)/.test(p.resolved ?? "")) continue;
      if (!pad.includes("node_modules/")) continue; // een map uit de workspace, geen pakket
      const mapnaam = mapnaamVan(pad);
      const naam = p.name ?? mapnaam;
      const isDirect = pad === `node_modules/${mapnaam}` && direct.has(mapnaam);
      const via = isDirect ? [] : zoekVia(mapnaam, ouders, direct);
      uit.push({
        ecosysteem: "npm",
        naam,
        versie: p.version,
        direct: isDirect,
        dev: Boolean(p.dev),
        ...(via.length ? { via } : {}),
      });
    }
    return uit;
  }
  const loop = (deps, top) => {
    for (const [naam, p] of Object.entries(deps ?? {})) {
      if (p.version && SEMVER.test(p.version)) {
        uit.push({
          ecosysteem: "npm",
          naam,
          versie: p.version,
          direct: top ? undefined : false,
          dev: Boolean(p.dev),
        });
      }
      loop(p.dependencies, false);
    }
  };
  loop(d.dependencies, true);
  return uit;
}

/** pnpm-lock.yaml, lockfileVersion 5 tot en met 9. */
export function uitPnpmLock(tekst) {
  const regels = tekst.split(/\r?\n/);
  const uit = [];
  const direct = new Set();
  const dev = new Set();
  let sectie = "";
  let soort = "";
  for (const regel of regels) {
    if (/^\S/.test(regel)) {
      sectie = regel.replace(/:.*$/, "");
      soort = /^(dependencies|optionalDependencies)$/.test(sectie)
        ? "prod"
        : sectie === "devDependencies"
          ? "dev"
          : "";
      continue;
    }
    if (sectie === "importers") {
      const kop = regel.match(/^ {4}(\w+):\s*$/);
      if (kop) {
        soort = /^(dependencies|optionalDependencies)$/.test(kop[1])
          ? "prod"
          : kop[1] === "devDependencies"
            ? "dev"
            : "";
        continue;
      }
      const dep = regel.match(/^ {6}'?([^':\s][^':]*)'?:/);
      if (dep && soort) (soort === "dev" ? dev : direct).add(dep[1]);
      continue;
    }
    if (soort) {
      // Zonder workspaces staan de directe onderdelen bovenaan het bestand.
      const dep = regel.match(/^ {2}'?([^':\s][^':]*)'?:/);
      if (dep) (soort === "dev" ? dev : direct).add(dep[1]);
      continue;
    }
    if (sectie !== "packages") continue;
    const m = regel.match(/^ {2}(['"]?)(\S.*?)\1:\s*$/);
    if (!m) continue;
    let sleutel = m[2].replace(/^\//, "").replace(/\(.*$/, "");
    let nv = null;
    const at = sleutel.lastIndexOf("@");
    if (at > 0) {
      nv = { naam: sleutel.slice(0, at), versie: sleutel.slice(at + 1) };
    } else {
      const slash = sleutel.lastIndexOf("/");
      if (slash > 0) {
        nv = {
          naam: sleutel.slice(0, slash),
          versie: sleutel.slice(slash + 1).replace(/_.*$/, ""),
        };
      }
    }
    if (!nv || !SEMVER.test(nv.versie)) continue;
    uit.push({ ecosysteem: "npm", ...nv });
  }
  return uit.map((o) => ({
    ...o,
    direct: direct.has(o.naam) || dev.has(o.naam),
    dev: dev.has(o.naam) && !direct.has(o.naam),
  }));
}

// Een onderdeel dat niet uit het register komt (een eigen map, een fork op
// GitHub, een los bestand) heeft geen naam waar de bronnen iets mee kunnen.
const NIET_UIT_REGISTER = /^(workspace:|patch:|file:|link:|portal:|git[+:@]|github:|https?:|ssh:)/;

/**
 * yarn.lock, klassiek (v1) en berry (v2 en hoger).
 *
 * Een onderdeel kan onder een andere naam zijn geïnstalleerd (een alias,
 * bijvoorbeeld "string-width-cjs@npm:string-width@^4.2.0"). De radar zoekt dan
 * op de echte naam: daar staan de meldingen onder.
 */
export function uitYarnLock(tekst) {
  const uit = [];
  let naam = null;
  let versie = null;
  let overslaan = false;
  const sluitAf = () => {
    if (naam && versie && !overslaan && SEMVER.test(versie)) {
      uit.push({ ecosysteem: "npm", naam, versie });
    }
    naam = null;
    versie = null;
    overslaan = false;
  };
  for (const regel of tekst.split(/\r?\n/)) {
    if (!regel || regel.startsWith("#")) continue;
    if (/^\S/.test(regel)) {
      sluitAf();
      if (regel.startsWith("__metadata")) continue;
      const eerste = regel
        .replace(/:\s*$/, "")
        .split(",")[0]
        .trim()
        .replace(/^"|"$/g, "");
      const at = eerste.indexOf("@", 1);
      if (at < 0) continue;
      naam = eerste.slice(0, at);
      const bereik = eerste.slice(at + 1);
      const alias = bereik.match(/^npm:(@?[^@]+)@/);
      if (alias) naam = alias[1];
      else if (NIET_UIT_REGISTER.test(bereik)) overslaan = true;
      continue;
    }
    const v = regel.match(/^\s+version:?\s+"?([^"\s]+)"?\s*$/);
    if (v) versie = v[1];
    // Berry zet de echte herkomst in "resolution"; die is leidend.
    const r = regel.match(/^\s+resolution:\s+"?([^"]+)"?\s*$/);
    if (r) {
      const echt = r[1].match(/^(@?[^@]+)@npm:/);
      if (echt) naam = echt[1];
      else overslaan = true;
    }
    // Klassiek: een onderdeel dat rechtstreeks van GitHub komt.
    if (/^\s+resolved\s+"(git|https:\/\/(codeload\.)?github\.com)/.test(regel)) {
      overslaan = true;
    }
  }
  sluitAf();
  return uit;
}

/** bun.lock, het tekstformaat van Bun 1.2 en hoger. */
export function uitBunLock(tekst) {
  const d = JSON.parse(tekst.replace(/,(\s*[}\]])/g, "$1"));
  const root = d.workspaces?.[""] ?? {};
  const prod = new Set([
    ...Object.keys(root.dependencies ?? {}),
    ...Object.keys(root.optionalDependencies ?? {}),
  ]);
  const dev = new Set(Object.keys(root.devDependencies ?? {}));
  const direct = new Set([...prod, ...dev]);
  const ouders = new Map();
  for (const waarde of Object.values(d.packages ?? {})) {
    const ouder = splitsNaamVersie(String(waarde?.[0] ?? ""))?.naam;
    const info = waarde?.find?.((deel) => deel && typeof deel === "object" && !Array.isArray(deel));
    if (!ouder || !info) continue;
    for (const kind of Object.keys({ ...info.dependencies, ...info.optionalDependencies })) {
      voegOuderToe(ouders, kind, ouder);
    }
  }
  const uit = [];
  for (const [sleutel, waarde] of Object.entries(d.packages ?? {})) {
    const nv = splitsNaamVersie(String(waarde?.[0] ?? ""));
    if (!nv || !SEMVER.test(nv.versie)) continue;
    const top = sleutel === nv.naam;
    const isDirect = top && direct.has(nv.naam);
    const via = isDirect ? [] : zoekVia(nv.naam, ouders, direct);
    uit.push({
      ecosysteem: "npm",
      ...nv,
      direct: isDirect,
      dev: top && dev.has(nv.naam) && !prod.has(nv.naam),
      ...(via.length ? { via } : {}),
    });
  }
  return uit;
}

/** requirements.txt: alleen regels met een vaste versie (naam==1.2.3). */
export function uitRequirements(tekst) {
  const uit = [];
  for (const ruw of tekst.split(/\r?\n/)) {
    const regel = ruw.replace(/#.*$/, "").replace(/\\$/, "").trim();
    const m = regel.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*==\s*([^\s;]+)/);
    if (m) {
      uit.push({ ecosysteem: "PyPI", naam: m[1], versie: m[2], direct: true });
    }
  }
  return uit;
}

/** composer.lock (PHP). */
export function uitComposerLock(tekst) {
  const d = JSON.parse(tekst);
  const zet = (lijst, dev) =>
    (lijst ?? [])
      .filter((p) => p.name && p.version)
      .map((p) => ({
        ecosysteem: "Packagist",
        naam: p.name,
        versie: String(p.version).replace(/^v/, ""),
        dev,
      }));
  return [...zet(d.packages, false), ...zet(d["packages-dev"], true)];
}

const SOORTEN = [
  { past: /(^|[\\/])(package-lock|npm-shrinkwrap)\.json$/, lees: uitPackageLock, beheerder: "npm" },
  { past: /(^|[\\/])pnpm-lock\.yaml$/, lees: uitPnpmLock, beheerder: "pnpm" },
  { past: /(^|[\\/])yarn\.lock$/, lees: uitYarnLock, beheerder: "yarn" },
  { past: /(^|[\\/])bun\.lock$/, lees: uitBunLock, beheerder: "bun" },
  { past: /(^|[\\/])requirements[^\\/]*\.txt$/, lees: uitRequirements, beheerder: "pip" },
  { past: /(^|[\\/])composer\.lock$/, lees: uitComposerLock, beheerder: "composer" },
];

/** De bestandsnamen die de radar herkent, voor meldingen en documentatie. */
export const BEKENDE_BESTANDEN = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "requirements.txt",
  "composer.lock",
];

/** Leest een lockfile op basis van de bestandsnaam. */
export function leesLockfile(pad, tekst) {
  const soort = SOORTEN.find((s) => s.past.test(pad));
  if (!soort) {
    throw new Error(
      `Onbekend bestand: ${pad}. De radar leest ${BEKENDE_BESTANDEN.join(", ")}.`,
    );
  }
  const onderdelen = soort
    .lees(tekst)
    .map((o) => ({ ...o, beheerder: soort.beheerder }));
  return { beheerder: soort.beheerder, onderdelen };
}

/** Haalt dubbele onderdelen (zelfde naam en versie) eruit. */
export function ontdubbel(onderdelen) {
  const gezien = new Map();
  for (const o of onderdelen) {
    const sleutel = `${o.ecosysteem}|${o.naam}|${o.versie}`;
    const eerder = gezien.get(sleutel);
    if (!eerder) {
      gezien.set(sleutel, { ...o });
    } else {
      // Zit het ergens direct of in productie, dan telt dat.
      eerder.direct = eerder.direct || o.direct;
      eerder.dev = Boolean(eerder.dev && o.dev);
      if (o.via?.length) eerder.via = [...new Set([...(eerder.via ?? []), ...o.via])].sort().slice(0, 3);
    }
  }
  return [...gezien.values()];
}
