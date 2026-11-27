# Uitrollen: de radar elke ochtend vanzelf laten draaien

Je hebt de radar lokaal getest: de droge run klopt en de proefmail is
aangekomen. Nu zet je hem zo neer dat hij elke ochtend vanzelf draait. Dat kan
op twee manieren.

| | GitHub Actions | Eigen computer of server |
| --- | --- | --- |
| Draait ook als je computer uit staat | Ja | Alleen op een server die altijd aan staat |
| Wat je nodig hebt | Een GitHub-account | Node.js op die computer |
| Waar de instellingen staan | Als secrets in je repository | In `.env` naast de radar |
| Als een run mislukt | De run is rood en GitHub meldt het | Het staat in het logbestand |

Ons advies is GitHub Actions. De rest van deze pagina gaat ervan uit dat
`techniekkaart.json` klaar is en dat je instellingen in `.env` staan.

Werk je met Claude Code, zeg dan: "Rol de radar uit." Claude volgt deze pagina
en vraagt je akkoord bij elke stap die iets aanmaakt of verstuurt.

## Route 1: GitHub Actions

Je zet je kopie van de radar, met je kaart erin, in een eigen afgeschermde
repository. Daar start GitHub hem elke ochtend om 07:40 Nederlandse tijd.

Je hebt [de opdracht `gh`](https://cli.github.com) nodig. Log één keer in:

```bash
gh auth login
```

### 1. Maak je eigen, afgeschermde repository

De kopie op je computer wijst nog naar de openbare repository van Pilex. Maak
die koppeling los:

```bash
git remote remove origin
```

Leg je kaart vast en maak je eigen repository aan. Vervang de naam door je eigen
account of organisatie:

```bash
git add techniekkaart.json
git commit -m "Techniekkaart"
gh repo create jouw-bedrijf/kwetsbaarheden-radar --private --source=. --remote=origin --push
```

Vraagt Git wie je bent, draai dan eerst `git config user.name "Je naam"` en
`git config user.email "je@adres.nl"`.

Controleer dat hij echt op privé staat. Het antwoord moet `PRIVATE` zijn:

```bash
gh repo view --json visibility --jq .visibility
```

> [!IMPORTANT]
> Je techniekkaart laat zien waar je apps kwetsbaar zijn. De taak weigert te
> draaien als er een techniekkaart in een openbare repository staat. Het bestand
> `.env` en de map `uit` gaan nooit mee naar GitHub.

### 2. Zet je instellingen in GitHub

Dit zet alles wat je in `.env` hebt ingevuld als secret in je repository. De
waarden komen niet in beeld. Heb je de mail overgeslagen en is er geen `.env`,
sla deze stap dan over:

```bash
gh secret set -f .env
```

Controleer welke namen er staan:

```bash
gh secret list
```

Een regel die je in `.env` leeg hebt gelaten, komt als lege secret in de lijst.
Dat is niet erg: de radar slaat lege waarden over.

Liever in de browser? Ga in je repository naar **Settings**, **Secrets and
variables**, **Actions** en klik per waarde op **New repository secret**.

### 3. Start de eerste run

```bash
gh workflow run ochtendcheck.yml
gh run watch
```

Na een paar minuten staat de mail in je postvak. Het rapport staat in GitHub
onder **Actions**, bij de run, onder **Summary**.

Vanaf nu draait de taak elke ochtend. De eerste mail is je nulmeting; daarna
staat bij elk lek of het nieuw is, of sinds wanneer het open staat.

### Goed om te weten

- **Het tijdstip** staat in `.github/workflows/ochtendcheck.yml`. De taak start
  om 07:40, zodat de mail er meestal voor 08:00 is. Bij drukte kan GitHub een
  taak later starten. Alleen werkdagen: verander `40 7 * * *` in `40 7 * * 1-5`.
- **Een app toevoegen:** pas `techniekkaart.json` aan en test met
  `npm run droog`. Leg de wijziging vast met `git commit -am "Kaart bijgewerkt"`
  en stuur hem met `git push`.
- **Een instelling wijzigen:** pas `.env` aan en draai `gh secret set -f .env`
  opnieuw.
- **Een nieuwe versie van de radar** haal je op uit de openbare repository en
  stuur je door naar je eigen kopie:

  ```bash
  git pull --no-rebase --no-edit https://github.com/Pilex-B-V/kwetsbaarheden-radar.git main
  git push
  ```
- **Mislukt een run,** dan is hij onder **Actions** rood. Klik hem open: de
  laatste regels zeggen wat er misging.

## Route 2: een eigen computer of server

De radar draait dan vanuit de map waar hij staat, met de instellingen uit
`.env`. Test eerst met de hand:

```bash
npm run radar
```

Dat is de echte run: hij verstuurt de mail en onthoudt in de map `.radar` wat
hij zag. Daarna plan je hem in.

### Windows

Open PowerShell en vervang het pad door de map van de radar:

```powershell
schtasks /Create /TN "Kwetsbaarheden-radar" /SC DAILY /ST 07:40 /TR "cmd /c cd /d C:\radar && node src\radar.mjs >> radar.log 2>&1"
```

De taak staat daarna in de Taakplanner van Windows. Proberen kan met
`schtasks /Run /TN "Kwetsbaarheden-radar"`, weghalen met
`schtasks /Delete /TN "Kwetsbaarheden-radar"`. De computer moet om 07:40 aan
staan en je moet zijn ingelogd.

### macOS en Linux

Open je geplande taken met `crontab -e` en voeg deze regel toe. Vervang het pad,
en gebruik het volledige pad van Node.js dat `which node` geeft:

```text
40 7 * * * cd /pad/naar/radar && /usr/local/bin/node src/radar.mjs >> radar.log 2>&1
```

### Goed om te weten

- Wat er gebeurde, staat in `radar.log` in de map van de radar.
- Op een eigen computer merk je een mislukte run alleen aan de mail die
  wegblijft. Laat de mail daarom elke dag komen, ook als er niets is.
- Een nieuwe versie van de radar haal je op met `git pull`. Je kaart en je
  `.env` blijven staan.
