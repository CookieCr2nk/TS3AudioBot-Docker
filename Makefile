.PHONY: help build build-multiarch test init-data compose-up compose-down compose-logs logs compose-restart clean validate-config pre-commit-install compose-panel-up compose-panel-down compose-panel-logs compose-panel-external-up compose-panel-external-down panel-test

COMPOSE := docker compose

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

build: ## Build image locally
	docker build -t ts3audiobot-docker:local .

build-multiarch: ## Build amd64 + arm64 (requires buildx)
	docker buildx build --platform linux/amd64,linux/arm64 -t ts3audiobot-docker:local .

init-data: ## Copy seed config into ./data for bind-mount compose
	mkdir -p data
	rsync -a --delete config/ data/

test: validate-config ## Run local checks
	@python3 -c "import yaml; yaml.safe_load(open('docker-compose.yml')); yaml.safe_load(open('docker-compose.panel.yml')); yaml.safe_load(open('docker-compose.panel-external-db.yml')); yaml.safe_load(open('.github/workflows/docker-publish.yml')); yaml.safe_load(open('.github/workflows/ci.yml'))"
	@if command -v node >/dev/null; then node --test panel/test/*.js; else echo "skip panel tests (node not installed)"; fi
	@echo "OK"

validate-config: ## Check bot.toml has required fields
	@bash scripts/validate-config.sh

compose-up: ## Start stack in background
	$(COMPOSE) up -d

compose-down: ## Stop stack
	$(COMPOSE) down

compose-logs: ## Follow container logs
	$(COMPOSE) logs -f ts3audiobot

logs: compose-logs ## Alias for compose-logs

compose-restart: ## Restart the bot container
	$(COMPOSE) restart ts3audiobot

compose-panel-up: ## Start bot, MariaDB, and the web panel
	$(COMPOSE) -f docker-compose.yml -f docker-compose.panel.yml up -d --build

compose-panel-down: ## Stop bot, MariaDB, and the web panel
	$(COMPOSE) -f docker-compose.yml -f docker-compose.panel.yml down

compose-panel-logs: ## Follow web panel logs
	$(COMPOSE) -f docker-compose.yml -f docker-compose.panel.yml logs -f panel

compose-panel-external-up: ## Start bot and panel against an external MariaDB
	$(COMPOSE) -f docker-compose.yml -f docker-compose.panel-external-db.yml up -d --build

compose-panel-external-down: ## Stop bot and panel that use an external MariaDB
	$(COMPOSE) -f docker-compose.yml -f docker-compose.panel-external-db.yml down

panel-test: ## Run web panel unit tests
	node --test panel/test/*.js

clean: ## Remove local image tag
	-docker rmi ts3audiobot-docker:local

pre-commit-install: ## Install git pre-commit hooks
	pre-commit install