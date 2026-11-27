# Was noch fehlt, damit ein Zeitstempel-Relay diese App annimmt

Stand 2026-11-27. Bisher gibt es nur die Logikschicht: Die App spricht noch mit keinem Relay. Konkrete Adressen
und Kennungen gehören nicht in dieses öffentliche Repository.

Unten steht `https://RELAY` für die Adresse des Relays und `https://APP` für die Adresse, unter der die App läuft.

## Entscheidungen vorab

| Nr. | Frage                                                                                                                                                                                                              | Warum                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| E1  | **Wo läuft die App?** Geplant ist eine Offline-HTML-Datei. Als Datei geöffnet (`file://`) hat sie keine Herkunft, das Relay lehnt sie ab. Zum Stempeln braucht sie eine `https`-Adresse (oder `http://localhost`). | Sonst kein Stempel                   |
| E2  | **Welches Relay?** Vorgesehen ist eine eigene Instanz: Viele PDF-Stempel belegen das Budget, und archiviert werden Mandantenunterlagen.                                                                            | Nicht auf ein gemeinsames Test-Relay |
| E3  | **Welcher Zeitdienst, rechtlich geklärt?** Die freien Dienste sind nicht qualifiziert; ihre Bedingungen sind nicht juristisch geprüft.                                                                             | Vor echten Belegen                   |

## Es fehlt in der App

1. **Abhängigkeit auf `zeitstempel`**, festgelegt auf einen Commit ab `6f218e6` oder einen späteren Tag.
   **Nicht `v0.1.0`:** Dieser Stand ist älter als die heutige Anmeldung, sein Client schickt keine; ein heutiges
   Relay antwortet mit `401`.
2. **IO-Schicht** mit `createRelayClient` aus `zeitstempel/client`, jeder Stempel mit `mode: 'solo'` (ein
   PDF-Dokument-Zeitstempel muss genau die Prüfsumme der Datei bestätigen), Vertrauensanker je Dienst, und die
   Anbindung an den Port `TokenVerifier`.
3. **Schlüssel der App:** Eingabe und Aufbewahrung (nicht auslesbarer `CryptoKey`), nie im ZIP-Archiv.
4. **Adresse beim Bauen** festlegen und die Sicherheitsrichtlinie der Seite so setzen, dass `connect-src` genau
   `https://RELAY` erlaubt.
5. **PDF-Stempel** über `pdf-fortschreiben`; Umgang mit fremden PDFs noch zu entwerfen. Abgetrennte `.tsr` für die
   anderen Formate.
6. **Meldungen** bei Ausfall, Pause (`429`) und abgelehntem Schlüssel; ohne Stempel darf nichts verloren gehen.
7. **Oberfläche und ZIP**, ohne die es nichts zu stempeln gibt.

## Es fehlt beim Relay

- `RELAY_ORIGINS=https://APP` (nur Schema und Rechnername).
- Ein Schlüssel je Arbeitsplatz, erzeugt mit `--solo`; öffentlicher Eintrag in die Schlüsseldatei.
- `RELAY_SERVICES` mit dem gewählten Dienst. Je Dienst gilt ein Mindestabstand (`freetsa` 5 s, die anderen 15 s):
  100 Belege mit `freetsa` dauern mindestens rund 8 Minuten. Die App braucht dafür eine Warteschlange.
- Begrenzung je Netzadresse, nur `https`, Überwachung.

## Danach prüfen

Ein Stempel aus dem Browser gegen das echte Relay, und ob Adobe Acrobat den PDF-Zeitstempel als gültig und
vertrauenswürdig anzeigt (bisher nicht belegt).
