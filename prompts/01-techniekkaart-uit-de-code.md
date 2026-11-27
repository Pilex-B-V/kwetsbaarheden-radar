# De techniekkaart van één app, uit de code

**Waar:** Claude Code, in de map van de app.

**Wanneer:** Je hebt de code van de app op je computer of in GitHub en wilt weten waar hij van gemaakt is.

```text
Je staat in de map van een app die bij ons in gebruik is. Ik wil een techniekkaart van deze app: een overzicht van de techniek waar hij op draait, zodat ik elke dag kan laten controleren of er een nieuw beveiligingslek in zit.

Lees alleen. Verander geen bestanden, installeer niets en voer geen opdrachten uit die iets aanpassen.

Zoek het volgende uit en zeg bij elk punt in welk bestand je het vond:

1. Het lockfile: package-lock.json, pnpm-lock.yaml, yarn.lock, bun.lock, requirements.txt of composer.lock. Noem het pad. Zijn er meer, noem ze allemaal. Staat er alleen een bun.lockb, zeg dan dat dat een oud formaat is en dat de opdracht "bun install --save-text-lockfile" er een leesbaar bun.lock van maakt.
2. De vijf tot tien onderdelen waar de app het meest op leunt, met hun exacte versie uit het lockfile: het framework, de koppeling met de database, het onderdeel voor inloggen, het onderdeel voor betalingen als dat er is.
3. De versie van Node.js, Python of PHP waar de app op draait. Kijk in .nvmrc, .node-version, package.json (engines), Dockerfile, runtime.txt en de instellingen van de hostingpartij. Vind je het niet, zeg dat dan en raad niet.
4. De database en de versie, als die in de code of de configuratie staat.
5. Waar de app draait: welke hostingpartij, en of de app vanaf het internet bereikbaar is of alleen intern.
6. Welke gegevens erin staan: persoonsgegevens, klantgegevens, financiële gegevens of niets gevoeligs.
7. Externe diensten waar de app mee praat, zoals een betaaldienst, een maildienst of een AI-dienst.

Geef het resultaat in twee delen.

Deel 1, voor mij, in gewone taal en hooguit vijftien regels: wat is dit voor app, waar is hij van gemaakt, wat kon je niet vinden.

Deel 2, een JSON-blok dat ik in techniekkaart.json kan plakken, in precies deze vorm:

{
  "naam": "",
  "doel": "",
  "eigenaar": "",
  "developer": "",
  "url": "",
  "gevoeligheid": "hoog, normaal of laag",
  "bereikbaar": "internet of intern",
  "platform": [{ "naam": "nodejs", "versie": "22.11.0" }],
  "bronnen": [{ "soort": "github", "repo": "eigenaar/naam", "pad": "package-lock.json" }]
}

Regels voor het JSON-blok:
- Zet "gevoeligheid" op hoog als er persoonsgegevens, klantgegevens of financiële gegevens in de app staan.
- Gebruik voor "platform" alleen deze namen: nodejs, postgresql, mysql, mariadb, redis, mongodb, php, python, wordpress, drupal, apache. Iets anders hoort alleen in deel 1.
- Vul bij "bronnen" het echte pad van het lockfile in. Weet je de naam van de repository op GitHub niet, laat "repo" dan leeg en zeg het.
- Laat "naam", "eigenaar" en "developer" leeg als je ze niet uit de code kunt halen. Verzin niets.
```
