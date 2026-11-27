// Lockfiles inlezen: het bestand waarin precies staat welke onderdelen, in
// welke versie, in een app zitten. Elk onderdeel komt terug als
// { ecosysteem, naam, versie, direct, dev }.
//
// direct: staat het onderdeel zelf in package.json (true) of komt het mee met
// een ander onderdeel (false). Onbekend is undefined.

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
    for (const [pad, p] of Object.entries(d.packages)) {
      if (!pad || p.link || !p.version) continue;
      const i = pad.lastIndexOf("node_modules/");
      if (i < 0) continue; // een map uit de workspace, geen pakket
      const mapnaam = pad.slice(i + "node_modules/".length);
      const naam = p.name ?? mapnaam;
      uit.push({
        ecosysteem: "npm",
        naam,
        versie: p.version,
        direct: pad === `node_modules/${mapnaam}` && direct.has(mapnaam),
        dev: Boolean(p.dev),
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

/** yarn.lock, klassiek (v1) en berry (v2 en hoger). */
export function uitYarnLock(tekst) {
  const uit = [];
  let naam = null;
  for (const regel of tekst.split(/\r?\n/)) {
    if (!regel || regel.startsWith("#")) continue;
    if (/^\S/.test(regel)) {
      naam = null;
      if (regel.startsWith("__metadata")) continue;
      const eerste = regel
        .replace(/:\s*$/, "")
        .split(",")[0]
        .trim()
        .replace(/^"|"$/g, "");
      const at = eerste.indexOf("@", 1);
      if (at < 0 || /@(workspace|patch|file|link|portal):/.test(eerste)) {
        continue;
      }
      naam = eerste.slice(0, at);
      continue;
    }
    const v = regel.match(/^\s+version:?\s+"?([^"\s]+)"?\s*$/);
    if (v && naam && SEMVER.test(v[1])) {
      uit.push({ ecosysteem: "npm", naam, versie: v[1] });
      naam = null;
    }
  }
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
  const uit = [];
  for (const [sleutel, waarde] of Object.entries(d.packages ?? {})) {
    const nv = splitsNaamVersie(String(waarde?.[0] ?? ""));
    if (!nv || !SEMVER.test(nv.versie)) continue;
    const top = sleutel === nv.naam;
    uit.push({
      ecosysteem: "npm",
      ...nv,
      direct: top && (prod.has(nv.naam) || dev.has(nv.naam)),
      dev: top && dev.has(nv.naam) && !prod.has(nv.naam),
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
    }
  }
  return [...gezien.values()];
}
