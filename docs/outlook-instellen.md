# Outlook koppelen

De radar verstuurt de ochtendmail vanuit een postvak in Microsoft 365. Dat gaat
via Microsoft Graph, de officiële koppeling van Microsoft. Je maakt één keer een
app-registratie aan en geeft die het recht om vanuit één postvak te versturen.

Je hebt hiervoor een beheerder van Microsoft 365 nodig. Reken op 15 tot 20
minuten. Heb je geen beheerder of wil je dit niet zelf doen, kijk dan onderaan
bij [De mail op een andere manier versturen](#de-mail-op-een-andere-manier-versturen).

## Wat je straks hebt

Vijf waarden. Die zet je als secret in je repository (stap 5).

| Secret | Wat het is |
| --- | --- |
| `RADAR_TENANT_ID` | Het nummer van je Microsoft 365-omgeving |
| `RADAR_CLIENT_ID` | Het nummer van de app-registratie |
| `RADAR_CLIENT_SECRET` | Het wachtwoord van de app-registratie |
| `RADAR_MAIL_VAN` | Het postvak waaruit de mail vertrekt, bijvoorbeeld `radar@jouwbedrijf.nl` |
| `RADAR_MAIL_AAN` | Wie de mail krijgt. Meer adressen scheid je met een komma |

## Stap 1: kies het postvak

Gebruik een gedeeld postvak, bijvoorbeeld `radar@jouwbedrijf.nl`. Een gedeeld
postvak kost geen licentie en de afzender is dan herkenbaar: je kunt er in
Outlook een regel of een categorie op zetten. Je eigen postvak kan ook.

## Stap 2: maak de app-registratie

1. Ga naar [entra.microsoft.com](https://entra.microsoft.com) en open
   **App registrations**.
2. Kies **New registration**. Naam: `Kwetsbaarheden-radar`. Laat de rest staan
   en klik op **Register**.
3. Op de pagina die opent staan **Application (client) ID** en **Directory
   (tenant) ID**. Dat zijn `RADAR_CLIENT_ID` en `RADAR_TENANT_ID`.
4. Open **Certificates & secrets**, kies **New client secret**, geef een naam en
   een looptijd, en kopieer de **Value**. Dat is `RADAR_CLIENT_SECRET`. Je ziet
   hem maar één keer. Zet de einddatum in je agenda: daarna stopt de mail.

## Stap 3: geef het recht om te versturen, voor één postvak

Dit is de stap waar het op aankomt. Het recht `Mail.Send` voor een app geldt
standaard voor elk postvak in je organisatie. Dat wil je niet. Met de
rolverdeling van Exchange Online (RBAC for Applications) beperk je het tot het
postvak van de radar.

Open PowerShell als beheerder van Exchange en verbind:

```powershell
Install-Module ExchangeOnlineManagement -Scope CurrentUser
Connect-ExchangeOnline
```

Zoek in het Entra-beheercentrum onder **Enterprise applications** de
`Kwetsbaarheden-radar` op. Neem daar het **Application ID** en het **Object ID**
over. Gebruik niet de nummers van de pagina App registrations: het Object ID
daar is een ander nummer.

```powershell
# 1. Vertel Exchange welke app het is
New-ServicePrincipal -AppId <Application ID> -ObjectId <Object ID> -DisplayName "Kwetsbaarheden-radar"

# 2. Beschrijf het ene postvak waar de app bij mag (de alias is het deel voor de @)
New-ManagementScope -Name "Postvak radar" -RecipientRestrictionFilter "Alias -eq 'radar'"

# 3. Geef de app het recht om te versturen, alleen binnen dat bereik
New-ManagementRoleAssignment -App <Application ID> -Role "Application Mail.Send" -CustomResourceScope "Postvak radar"
```

Controleer daarna of het klopt:

```powershell
Test-ServicePrincipalAuthorization -Identity <Application ID> -Resource radar@jouwbedrijf.nl | Format-Table
Test-ServicePrincipalAuthorization -Identity <Application ID> -Resource iemand.anders@jouwbedrijf.nl | Format-Table
```

Bij het postvak van de radar hoort `InScope` op `True` te staan, bij elk ander
postvak op `False`.

Twee dingen om te weten:

- Geef de app **niet** ook nog `Mail.Send` onder API permissions in Entra. Wat
  je daar toekent, geldt voor alle postvakken en komt boven op wat je in
  Exchange hebt ingesteld. Dan is de beperking weg.
- Een wijziging in deze rechten werkt volgens Microsoft na 30 minuten tot 2 uur.
  Krijg je direct na het instellen een foutmelding over toegang, wacht dan even.

## Stap 4: test het

Zet de vijf waarden lokaal in je terminal en draai de radar één keer. Op een
Mac of in Linux:

```bash
export RADAR_TENANT_ID="..."
export RADAR_CLIENT_ID="..."
export RADAR_CLIENT_SECRET="..."
export RADAR_MAIL_VAN="radar@jouwbedrijf.nl"
export RADAR_MAIL_AAN="jij@jouwbedrijf.nl"
node src/radar.mjs
```

In PowerShell op Windows:

```powershell
$env:RADAR_TENANT_ID = "..."
$env:RADAR_CLIENT_ID = "..."
$env:RADAR_CLIENT_SECRET = "..."
$env:RADAR_MAIL_VAN = "radar@jouwbedrijf.nl"
$env:RADAR_MAIL_AAN = "jij@jouwbedrijf.nl"
node src/radar.mjs
```

Onderaan staat `Mail verstuurd naar 1 adres via Outlook.` en de mail staat in je
postvak. Liever niet lokaal testen? Sla deze stap over en gebruik **Run
workflow** in stap 5.

## Stap 5: zet de waarden in GitHub

In je eigen, afgeschermde repository: **Settings**, **Secrets and variables**,
**Actions**, **New repository secret**. Maak de vijf secrets uit de tabel
bovenaan. Ga daarna naar **Actions**, kies **Ochtendcheck** en klik op **Run
workflow**. Na een paar minuten hoort de mail er te zijn. Krijg je een status
403, dan zijn de rechten uit stap 3 nog niet doorgekomen: wacht tot twee uur.

## Als het niet werkt

| Wat je ziet | Wat je doet |
| --- | --- |
| `login.microsoftonline.com: status 400` of `401` | Het tenant-ID, het client-ID of het secret klopt niet, of het secret is verlopen. Maak een nieuw secret. |
| `graph.microsoft.com: status 403` | De app mag niet versturen vanuit dit postvak. Loop stap 3 na en wacht tot twee uur. |
| `graph.microsoft.com: status 404` | Het adres in `RADAR_MAIL_VAN` bestaat niet of is geen postvak. |
| `Outlook is half ingesteld` | Een van de vijf secrets ontbreekt. De melding noemt welke. |
| De mail komt in de map Ongewenst | Markeer hem één keer als veilig en zet de afzender in je lijst met veilige afzenders. |

## De mail op een andere manier versturen

Stel je `RADAR_WEBHOOK_URL` in, dan stuurt de radar de mail als JSON naar dat
adres. Daar kan een flow in Power Automate, n8n of Make hem oppakken en
versturen, of doorzetten naar Teams. Het bericht bevat de velden `onderwerp`,
`status`, `html`, `tekst` en `cijfers`.

Stel je niets in, dan verstuurt de radar niets. De mail en het rapport staan dan
alleen bij de run in GitHub, onder **Artifacts** en in de samenvatting.

## Bronnen

- Microsoft Graph, [user: sendMail](https://learn.microsoft.com/en-us/graph/api/user-sendmail)
- Microsoft, [Role Based Access Control for Applications in Exchange Online](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac)
