import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { cvss3Score, ernstVanLabel, ernstVanScore, zwaarste } from "../src/lib/cvss.mjs";
import {
  leesLockfile,
  ontdubbel,
  uitBunLock,
  uitComposerLock,
  uitPackageLock,
  uitPnpmLock,
  uitRequirements,
  uitYarnLock,
} from "../src/lib/lockfiles.mjs";
import { hoogste, sprong, vergelijk } from "../src/lib/versies.mjs";

const fixture = (naam) => readFileSync(new URL(`./fixtures/${naam}`, import.meta.url), "utf8");
const vind = (lijst, naam) => lijst.filter((o) => o.naam === naam);

test("versies vergelijken", () => {
  assert.equal(vergelijk("15.2.2", "15.2.3"), -1);
  assert.equal(vergelijk("15.10.0", "15.9.9"), 1);
  assert.equal(vergelijk("v2.0.0", "2.0"), 0);
  assert.equal(vergelijk("16.0.0-canary.4", "16.0.0"), -1);
  assert.equal(vergelijk("16.0.0-canary.4", "16.0.0-canary.19"), -1);
  assert.equal(vergelijk("1.0.0.post1", "1.0.0"), 1);
  assert.equal(vergelijk("3.1.4", "3.1.4"), 0);
});

test("de sprong naar een herstelversie", () => {
  assert.equal(sprong("15.2.2", "15.2.3"), "patch");
  assert.equal(sprong("15.2.2", "15.5.29"), "minor");
  assert.equal(sprong("3.24.2", "4.6.6"), "major");
  assert.equal(sprong("0.115.6", "0.116.0"), "major");
  assert.equal(sprong("onzin", "1.0.0"), "onbekend");
  assert.equal(hoogste(["15.2.3", "15.5.29", "15.4.8"]), "15.5.29");
});

test("CVSS 3.1: bekende scores", () => {
  // CVE-2025-29927, Next.js middleware
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N"), 9.1);
  // CVE-2025-55182, React Server Components
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H"), 10);
  // Voorbeelden uit de specificatie van FIRST
  assert.equal(cvss3Score("CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N"), 6.1);
  assert.equal(cvss3Score("CVSS:3.1/AV:L/AC:H/PR:L/UI:N/S:U/C:H/I:N/A:N"), 4.7);
  assert.equal(cvss3Score("CVSS:3.0/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H"), 8.8);
  assert.equal(cvss3Score("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N"), null);
  assert.equal(cvss3Score("geen vector"), null);
});

test("ernst uit score en label", () => {
  assert.equal(ernstVanScore(9.1), "kritiek");
  assert.equal(ernstVanScore(7), "hoog");
  assert.equal(ernstVanScore(4.2), "midden");
  assert.equal(ernstVanScore(2), "laag");
  assert.equal(ernstVanScore(null), "onbekend");
  assert.equal(ernstVanLabel("MODERATE"), "midden");
  assert.equal(ernstVanLabel("critical"), "kritiek");
  assert.equal(zwaarste(["laag", "hoog", "onbekend"]), "hoog");
  assert.equal(zwaarste(["onbekend"]), "onbekend");
});

test("package-lock.json", () => {
  const lijst = uitPackageLock(fixture("package-lock.json"));
  assert.equal(lijst.length, 7);
  assert.deepEqual(vind(lijst, "next")[0], { ecosysteem: "npm", naam: "next", versie: "15.2.2", direct: true, dev: false });
  assert.deepEqual(vind(lijst, "postcss").map((o) => o.versie).sort(), ["8.4.31", "8.5.3"]);
  assert.ok(vind(lijst, "postcss").every((o) => o.direct === false));
  assert.equal(vind(lijst, "typescript")[0].dev, true);
  // Een alias telt onder de echte naam van het pakket.
  assert.equal(vind(lijst, "string-width")[0].versie, "4.2.3");
  assert.equal(vind(lijst, "@scope/pakket")[0].versie, "2.0.0-beta.1");
  // Een map uit de workspace is geen pakket, een fork op GitHub ook niet.
  assert.equal(vind(lijst, "lokaal").length, 0);
  assert.equal(vind(lijst, "fork-van-iets").length, 0);
});

test("pnpm-lock.yaml, versie 9 en 6", () => {
  const negen = uitPnpmLock(fixture("pnpm-lock.yaml"));
  assert.deepEqual(negen.map((o) => `${o.naam}@${o.versie}`).sort(), [
    "@supabase/supabase-js@2.49.1",
    "next@15.2.2",
    "postcss@8.4.31",
    "typescript@5.7.3",
  ]);
  assert.equal(vind(negen, "next")[0].direct, true);
  assert.equal(vind(negen, "@supabase/supabase-js")[0].direct, true);
  assert.equal(vind(negen, "postcss")[0].direct, false);
  assert.equal(vind(negen, "typescript")[0].dev, true);

  const zes = uitPnpmLock(fixture("pnpm-lock-v6.yaml"));
  assert.deepEqual(zes.map((o) => `${o.naam}@${o.versie}`).sort(), ["@babel/core@7.23.9", "next@14.1.0", "vitest@1.2.0"]);
  assert.equal(vind(zes, "next")[0].direct, true);
  assert.equal(vind(zes, "vitest")[0].dev, true);
  assert.equal(vind(zes, "@babel/core")[0].direct, false);
});

test("yarn.lock, klassiek en berry", () => {
  const klassiek = uitYarnLock(fixture("yarn.lock"));
  // Een alias telt onder de echte naam; een eigen map of een fork op GitHub telt niet mee.
  assert.deepEqual(klassiek.map((o) => `${o.naam}@${o.versie}`), [
    "@babel/code-frame@7.23.5",
    "next@15.2.2",
    "postcss@8.4.31",
    "string-width@4.2.3",
  ]);
  const berry = uitYarnLock(fixture("yarn-berry.lock"));
  assert.deepEqual(berry.map((o) => `${o.naam}@${o.versie}`), [
    "@scope/pakket@2.1.0",
    "@docusaurus/react-loadable@6.0.0",
    "next@15.2.2",
  ]);
});

test("bun.lock", () => {
  const lijst = uitBunLock(fixture("bun.lock"));
  assert.deepEqual(lijst.map((o) => `${o.naam}@${o.versie}`).sort(), [
    "@tanstack/query-core@5.66.0",
    "@tanstack/react-query@5.66.0",
    "esbuild@0.25.0",
    "react@19.0.0",
    "vite@6.2.0",
  ]);
  assert.equal(vind(lijst, "react")[0].direct, true);
  assert.equal(vind(lijst, "vite")[0].dev, true);
  assert.equal(vind(lijst, "esbuild")[0].direct, false);
});

test("requirements.txt en composer.lock", () => {
  const py = uitRequirements(fixture("requirements.txt"));
  assert.deepEqual(py.map((o) => `${o.naam}==${o.versie}`), ["fastapi==0.115.6", "pydantic==2.10.3", "Jinja2==3.1.4"]);
  assert.ok(py.every((o) => o.ecosysteem === "PyPI"));
  const php = uitComposerLock(fixture("composer.lock"));
  assert.deepEqual(php, [
    { ecosysteem: "Packagist", naam: "symfony/http-foundation", versie: "6.4.2", dev: false },
    { ecosysteem: "Packagist", naam: "phpunit/phpunit", versie: "10.5.9", dev: true },
  ]);
});

test("lockfile herkennen aan de naam", () => {
  const { beheerder, onderdelen } = leesLockfile("apps/portaal/package-lock.json", fixture("package-lock.json"));
  assert.equal(beheerder, "npm");
  assert.ok(onderdelen.every((o) => o.beheerder === "npm"));
  assert.equal(leesLockfile("C:\\apps\\api\\requirements-prod.txt", "flask==3.0.0").beheerder, "pip");
  assert.throws(() => leesLockfile("Gemfile.lock", ""), /Onbekend bestand/);
});

test("ontdubbelen houdt productie en direct vast", () => {
  const lijst = ontdubbel([
    { ecosysteem: "npm", naam: "a", versie: "1.0.0", direct: false, dev: true },
    { ecosysteem: "npm", naam: "a", versie: "1.0.0", direct: true, dev: false },
    { ecosysteem: "npm", naam: "a", versie: "2.0.0", direct: false, dev: true },
  ]);
  assert.equal(lijst.length, 2);
  assert.deepEqual(lijst[0], { ecosysteem: "npm", naam: "a", versie: "1.0.0", direct: true, dev: false });
});

test("via welk zelf gekozen onderdeel iets meekomt", () => {
  const npm = uitPackageLock(fixture("package-lock.json"));
  assert.deepEqual(vind(npm, "postcss").find((o) => o.versie === "8.4.31").via, ["next"]);
  assert.equal(vind(npm, "next")[0].via, undefined);
  const bun = uitBunLock(fixture("bun.lock"));
  assert.deepEqual(vind(bun, "esbuild")[0].via, ["vite"]);
  assert.deepEqual(vind(bun, "@tanstack/query-core")[0].via, ["@tanstack/react-query"]);
  // Bij samenvoegen blijven de herkomsten bewaard.
  const samen = ontdubbel([
    { ecosysteem: "npm", naam: "x", versie: "1.0.0", direct: false, via: ["b"] },
    { ecosysteem: "npm", naam: "x", versie: "1.0.0", direct: false, via: ["a"] },
  ]);
  assert.deepEqual(samen[0].via, ["a", "b"]);
});
