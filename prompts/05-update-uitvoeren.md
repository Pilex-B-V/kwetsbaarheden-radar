# De update laten uitvoeren

**Waar:** Claude Code, in de map van de app.

**Wanneer:** Je hebt zelf toegang tot de code en wilt de update uit de mail laten doen. Bij een app waar je bedrijf op draait, laat je het resultaat door je developer nakijken.

```text
Hieronder staat een update-instructie uit mijn kwetsbaarheden-radar. Voer hem uit in deze repository.

[plak hier de instructie uit het blok Voor je developer]

Werk zo:
1. Maak eerst een nieuwe branch met de naam beveiligingsupdate en de datum van vandaag. Werk niet op de hoofdbranch.
2. Kijk welke versie van elk onderdeel er nu staat en zeg het als dat afwijkt van de instructie.
3. Voer de updates één voor één uit, in de volgorde van de instructie. Verander verder niets: geen andere onderdelen, geen opmaak, geen opruimwerk.
4. Is een update een nieuwe hoofdversie, lees dan eerst de aantekeningen bij die versie en vertel me wat er verandert voordat je hem doet.
5. Draai na elke update de tests en de build. Gaat er iets stuk, stop dan en leg uit wat er misgaat. Zet de tests niet uit en pas ze niet aan om ze te laten slagen.
6. Controleer aan het eind met de pakketbeheerder of de oude, kwetsbare versie nergens meer in het lockfile staat.

Zet de wijzigingen niet live en voeg ze niet samen met de hoofdbranch. Sluit af met een korte samenvatting: welk onderdeel van welke versie naar welke versie ging, wat de tests zeiden, en wat ik zelf nog moet nakijken voordat het live mag.
```
