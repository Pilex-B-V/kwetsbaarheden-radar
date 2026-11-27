---
name: app-toevoegen
description: Zet één app op de techniekkaart van de kwetsbaarheden-radar: zoekt het lockfile en de versies op, vraagt de gebruiker wat alleen hij weet en test de kaart. Gebruik dit als de gebruiker een app wil toevoegen, of als de kaart nog leeg is.
---

# Een app op de techniekkaart zetten

De techniekkaart is `techniekkaart.json` in de hoofdmap. Per app staat erop wat
het is, wie erover gaat en waar de radar de lijst met onderdelen vindt. Een
uitgewerkt voorbeeld staat in `voorbeeld/techniekkaart.json`; de velden staan in
de README onder De techniekkaart.

Bestaat het bestand nog niet, maak het dan aan met deze inhoud:

```json
{
  "apps": []
}
```

## 1. Waar staat de code

Vraag de gebruiker waar de code van de app staat. Er zijn drie mogelijkheden.

**Een repository op GitHub.** Dit is de beste bron: de radar haalt het lockfile
dan elke ochtend zelf op, dus de kaart blijft kloppen. Zoek het lockfile op,
alleen lezend:

```bash
gh api repos/<eigenaar>/<naam>/contents --jq '.[].name'
```

Je zoekt `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lock`,
`requirements.txt` of `composer.lock`. Staat het in een submap, kijk dan daar.
Staat er alleen een `bun.lockb`, zeg dan dat de bouwer één keer
`bun install --save-text-lockfile` moet draaien.

De bron op de kaart:

```json
{ "soort": "github", "repo": "<eigenaar>/<naam>", "pad": "package-lock.json" }
```

Is de repository afgeschermd, dan heeft de radar een leestoken nodig
(`RADAR_GITHUB_TOKEN` in `.env`). De stappen staan in de README onder Het leestoken voor GitHub.
Zonder token staat de app straks onder Niet volledig gecontroleerd.

**Een map op deze computer.** Lees het lockfile in als momentopname:

```bash
node src/kaart.mjs <pad/naar/lockfile> --naam "<naam van de app>" --schrijf
```

Zeg erbij dat dit na elke update van de app opnieuw moet, omdat de kaart anders
achterloopt.

**Geen toegang tot de code.** Dat komt voor bij een app van een bureau. Schrijf
voor de gebruiker een kort bericht aan de bouwer met de vraag om leestoegang tot
de repository of om het lockfile, en vraag welke versie van Node.js, Python of
PHP en welke database de app gebruikt. Zet de app op de lijst met open punten.

## 2. Wat eronder draait

Het platform staat niet in het lockfile. Zoek het op in de code, alleen lezend,
en zeg in welk bestand je het vond:

- Node.js: `.nvmrc`, `.node-version`, `engines` in `package.json`, `Dockerfile`,
  de instellingen van de hostingpartij.
- Python of PHP: `runtime.txt`, `Dockerfile`, `composer.json`.
- De database en de versie, als die in de code of de configuratie staat.

De radar kent deze namen: `nodejs`, `postgresql`, `mysql`, `mariadb`, `redis`,
`mongodb`, `php`, `python`, `wordpress`, `drupal`, `apache`.

Vind je een versie niet, raad dan niet. Vraag het de gebruiker of de bouwer en
laat het veld tot die tijd weg. Staat er alleen een hoofdversie, zoals Node.js
22, vraag dan naar de precieze versie: zonder die versie kan de radar niet zien
welke beveiligingsupdates zijn gemist.

Draait de database bij een dienst die het beheer doet, vraag dan na of die ook
de beveiligingsupdates uitvoert. Is dat zo, dan hoeft hij niet op de kaart.

## 3. Wat alleen de gebruiker weet

Vraag, één voor één:

1. Hoe noemen jullie de app, en wat doen mensen ermee?
2. Wie in het bedrijf gaat erover (de eigenaar)?
3. Wie voert updates uit: een collega, een bureau, een IT-partner?
4. Staan er persoonsgegevens, klantgegevens of financiële gegevens in? Dan is de
   gevoeligheid `hoog`. Anders `normaal`, of `laag` als er niets van waarde in
   staat.
5. Is de app vanaf het internet bereikbaar, of alleen intern?

Vraag 4 en 5 bepalen hoe dringend een lek wordt. Leg dat uit.

## 4. Op de kaart zetten

Voeg het blok toe aan de lijst `apps`:

```json
{
  "naam": "Klantportaal",
  "doel": "Klanten bekijken hun facturen en documenten",
  "eigenaar": "Directie",
  "developer": "Extern bureau",
  "gevoeligheid": "hoog",
  "bereikbaar": "internet",
  "platform": [{ "naam": "nodejs", "versie": "22.11.0" }],
  "bronnen": [
    { "soort": "github", "repo": "jouw-bedrijf/klantportaal", "pad": "package-lock.json" }
  ]
}
```

Heeft `src/kaart.mjs` de app al aangemaakt, vul dan alleen de lege velden aan.

## 5. Testen

Draai `npm run droog` en controleer:

- De eerste regel noemt het aantal apps en onderdelen. Een gewone webapp heeft
  honderden onderdelen. Staat er een handvol, dan is het lockfile niet gelezen.
- Staat de app onder Niet volledig gecontroleerd, dan staat onder Let op waarom.
  Los dat op.

Vat daarna voor de gebruiker samen wat de radar bij deze app vond.
