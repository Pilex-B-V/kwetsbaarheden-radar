Update-instructie voor Klantportaal (27 november 2026)

Je werkt in de repository van deze app. De onderdelen hieronder hebben een bekende kwetsbaarheid.
Werk ze bij in deze volgorde en verander verder niets.

1. next 15.2.2 -> 15.5.29   [kritiek, vandaag]
   Lost op: GHSA-9qr9-h5gf-34mp, CVE-2025-29927, CVE-2026-75604, GHSA-2464-fhr4-w9xw en nog 36
   Opdracht: npm install next@15.5.29

2. PostgreSQL 16.4 -> 16.15   [hoog, vandaag]
   Lost op: CVE-2024-10979, CVE-2026-2004, CVE-2026-2005, CVE-2026-2006 en nog 39
   Opdracht: werk PostgreSQL bij naar 16.15 of hoger, op de server of bij je hostingpartij

3. zod 3.24.2 -> 4.6.6   [hoog, vandaag]
   Lost op: CVE-2023-54404
   Opdracht: npm install zod@4.6.6

4. Node.js 22.11.0 -> 22.23.5   [hoog, vandaag]
   9 beveiligingsreleases gemist; de laatste is van 2026-11-11
   Opdracht: werk Node.js bij naar 22.23.5 of hoger, op de server of bij je hostingpartij

Daarna:
- Draai de tests en de build.
- Controleer in een testomgeving of inloggen en de belangrijkste schermen werken.
- Rol uit en controleer de live app.
- Meld welke versies er nu staan, zodat de techniekkaart klopt.

Meldingen:
- GHSA-9qr9-h5gf-34mp: https://github.com/advisories/GHSA-9qr9-h5gf-34mp
- CVE-2025-29927: https://github.com/advisories/GHSA-f82v-jwr5-mffw
- CVE-2026-75604: https://github.com/advisories/GHSA-p293-qw3h-jr36
- GHSA-2464-fhr4-w9xw: https://github.com/advisories/GHSA-2464-fhr4-w9xw
- CVE-2024-10979: https://nvd.nist.gov/vuln/detail/CVE-2024-10979
- CVE-2026-2004: https://nvd.nist.gov/vuln/detail/CVE-2026-2004
- CVE-2026-2005: https://nvd.nist.gov/vuln/detail/CVE-2026-2005
- CVE-2026-2006: https://nvd.nist.gov/vuln/detail/CVE-2026-2006
- CVE-2023-54404: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5
- Node.js: https://nodejs.org/en/blog/vulnerability