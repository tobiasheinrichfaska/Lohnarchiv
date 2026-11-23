# Lohnarchiv

Revisionssicheres Archiv für begleitende Entgeltunterlagen (Immatrikulationsbescheinigungen,
A1-Bescheinigungen, Krankenkassen-Nachweise, Scans). Eine Offline-Anwendung im Browser.

- Ablage in einem **passwortgeschützten ZIP** (AES-256).
- Jedes Dokument bekommt einen **Zeitstempel** eines Zeitservers (RFC 3161); bei PDFs eingebettet.
- Der Zustand des Archivs steht in einer **Kette von JSON-Manifesten**; jedes Hinzufügen oder Entfernen
  erzeugt ein neues, wieder zeitgestempeltes Manifest. Alle alten Manifeste bleiben erhalten, so lässt sich
  jederzeit zeigen, dass nichts fehlt.
- Entfernen nur mit Name und technischem Grund (Fehlablage, unleserlich/ersetzt, Duplikat).
- Prüfungs-Export als Einzeldateien (§ 9a BVV).

> **Nicht von einem Menschen sicherheitsgeprüft, nur die Logikschicht – nicht für echte Unterlagen
> verwenden.** Keine Rechtsberatung. Meldungen: [SECURITY.md](SECURITY.md).

**Stand:** Die Logikschicht (Manifest-Kette, Prüfung, Dateinamen) ist fertig und getestet; ZIP, Zeitserver,
PDF-Stempel und Oberfläche folgen. Details: [CLAUDE.md](CLAUDE.md).

Kein Ersatz für die Lohnabrechnungs-Software und keine Rechtsberatung; die organisatorischen Maßnahmen
(Verfahrensdokumentation, Rechte, Datensicherung) bleiben bei der Anwenderin / dem Anwender.

## License

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

This project is licensed under the **GNU Affero General Public License v3.0** (AGPLv3).
You are free to use, modify, and distribute this software under the terms of the AGPLv3.
If you use this software to provide a network service, you must make the full source code
of your modifications available to users of that service.

**Commercial License:** If you wish to use this software in a closed-source or proprietary
product, a commercial license is available. Contact: tobias.a.w.heinrich@gmail.com

See [LICENSE](LICENSE) for the full AGPLv3 text.
See [LICENSE_COMMERCIAL.md](LICENSE_COMMERCIAL.md) for commercial licensing terms.
