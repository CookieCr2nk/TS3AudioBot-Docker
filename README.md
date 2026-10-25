# TS3AudioBot-Docker

Docker-Image für [TS3AudioBot](https://github.com/Splamy/TS3AudioBot) und ein optionales Web-Panel.

Es gibt zwei Wege:

| | Nur der Bot | Bot und Panel |
|---|---|---|
| Start | `docker compose up -d` | `make compose-panel-up` |
| Oberfläche | keine | http://localhost:8080 |
| Bot-API Port 58913 | nicht von außen erreichbar | nur das Panel, im internen Netz |

Das Panel und der Bot sind getrennte Container. MariaDB ist ein dritter Container und sieht die Bot-API nicht.

## Bot und Panel starten

```bash
git clone https://github.com/CookieCr2nk/TS3AudioBot-Docker.git
cd TS3AudioBot-Docker
make init-data
cp panel/.env.example .env
```

In der `.env` im Repo-Root mindestens diese zwei Werte setzen:

- `PANEL_DB_PASSWORD` — Passwort der Panel-Datenbank
- `PANEL_ADMIN_PASSWORD` — mindestens 10 Zeichen, sonst schreibt der erste Start ein Zufallspasswort einmal in die Panel-Logs

Dann:

```bash
make compose-panel-up
```

Öffne http://localhost:8080 und melde dich an. Lege einen Bot an. Die API-Adresse im Compose-Netz ist `http://ts3audiobot:58913`. UID und Token leer lassen.

TeamSpeak trägst du in `data/bots/default/bot.toml` ein (`address`, danach den Bot neu starten). Die Identity legt der Bot beim ersten Verbindungsversuch an.

Logs: `make compose-panel-logs` und `docker compose logs -f ts3audiobot`

Stoppen: `make compose-panel-down`

## Externe MariaDB

Wenn die Datenbank schon woanders läuft, startet dieser Stack keinen MariaDB-Container. Host, Port, Benutzer, Passwort und Datenbankname kommen nur aus der `.env`.

```bash
# in der .env im Repo-Root
PANEL_DB_HOST=db.example.com
PANEL_DB_PORT=3306
PANEL_DB_NAME=ts3panel
PANEL_DB_USER=ts3panel
PANEL_DB_PASSWORD=change-me
```

Liegt MariaDB auf demselben Rechner wie Docker, setze `PANEL_DB_HOST=host.docker.internal`. `127.0.0.1` wäre der Panel-Container selbst.

Datenbank und Benutzer müssen existieren und von der Docker-Bridge aus Verbindungen annehmen. Das Panel legt seine Tabellen beim Start selbst an.

```bash
make compose-panel-external-up
```

Stoppen: `make compose-panel-external-down`. Die externe Datenbank bleibt dabei unangetastet.

## Warum kein API-Token

Die Bot-API hört im Container auf Port 58913. Compose veröffentlicht diesen Port nicht. Im Panel-Setup hängen nur Bot und Panel am Netz `botapi`. MariaDB hängt an einem zweiten Netz `paneldb` ohne Internetzugang.

`data/rights.toml` erlaubt deshalb jeden API-Aufruf (`isapi = true`). Das ist sicher, solange Port 58913 nicht auf den Host gemappt wird. Eine feste Container-IP gibt es nicht, weil die sich je nach Docker-Installation ändert.

Wer `data/rights.toml` schon von einem älteren Stand hat: in der Admin-Regel `isapi = true` eintragen, alte Panel-IPs entfernen, Bot neu starten.

Ein API-Token im Panel ist nur nötig, wenn der Bot absichtlich außerhalb dieses Netzes liegt.

## Nur den Bot starten

```bash
make init-data
docker compose up -d
```

Es gibt dann keine Weboberfläche. Die API bleibt im Container. Wer Port 58913 trotzdem veröffentlicht, macht jeden, der den Port erreicht, zum Bot-Admin. Dafür vorher `isapi = true` aus `data/rights.toml` entfernen.

## Konfiguration

`make init-data` kopiert `config/` nach `data/`. Danach gilt nur noch `data/`. Ein späteres Image-Update ändert eine bestehende `data/` nicht.

| Datei | Inhalt |
|---|---|
| `data/bots/default/bot.toml` | TeamSpeak-Adresse, Name, Identity |
| `data/ts3audiobot.toml` | Globale Defaults, Web-API an auf Port 58913 |
| `data/rights.toml` | Wer welche Befehle darf |

Optionen: [TS3AudioBot Wiki](https://github.com/Splamy/TS3AudioBot/wiki)

## Images bauen

```bash
docker build -t ts3audiobot-docker:local .
docker build -t ts3audiobot-panel:local ./panel
```

`BOT_RELEASE` muss ein [Release-Tag](https://github.com/Splamy/TS3AudioBot/releases) sein, kein Branch-Name. Standard ist `0.12.0`.

Images von GitHub: `ghcr.io/cookiecr2nk/ts3audiobot-docker:master` und `:develop`, dazu das Panel als `ghcr.io/cookiecr2nk/ts3audiobot-docker-panel:master` und `:develop`.

## CI

Zwei Workflows:

- `.github/workflows/ci.yml` prüft bei jedem Push und Pull Request die Config, die Panel-Tests, baut beide Images und startet den Stack. Der Lauf gilt erst, wenn das Panel gesund ist, die Bot-API vom Panel aus antwortet und Port 58913 nicht am Host hängt.
- `.github/workflows/docker-publish.yml` baut auf `master` und `develop` beide Images für `linux/amd64` und `linux/arm64` und schiebt sie nach GHCR. `develop` bekommt den Tag `:develop`. `master` behält `:master` und den Bot-Release-Tag. Die Images werden gescannt und signiert.

Lokal: `make test` und `make panel-test`.

## Sicherheit

Der Bot läuft als Benutzer `ts3audiobot` (UID 9999), mit nur-lesbarem Root-Dateisystem und ohne Linux-Capabilities. Details und Meldungen: [SECURITY.md](SECURITY.md).

## Lizenz

MIT, siehe [LICENSE](LICENSE). TS3AudioBot selbst ist GPLv3.
