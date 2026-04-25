.PHONY: help build test lint compose-up compose-down compose-logs logs clean

help: ## Show this help message
	@echo 'TS3AudioBot-Docker Development Tasks'
	@echo ''
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

build: ## Build Docker image locally
	@echo "Building Docker image..."
	docker build -t ts3audiobot-docker:local .

build-multiarch: ## Build for multiple architectures (amd64, arm64, arm/v7)
	@echo "Building multi-architecture images..."
	docker buildx build --platform linux/amd64,linux/arm64,linux/arm/v7 \
		-t ts3audiobot-docker:local .

lint: ## Run Hadolint to check Dockerfile best practices
	@echo "Linting Dockerfile..."
	@command -v hadolint >/dev/null 2>&1 || { echo "hadolint not found. Install with: brew install hadolint"; exit 1; }
	hadolint Dockerfile

test: lint ## Run all tests and validations
	@echo "Running tests..."
	@echo "✓ Hadolint passed"
	@echo "✓ All validation passed"

compose-up: ## Start services with docker-compose
	@echo "Starting services..."
	docker-compose up -d
	@sleep 2
	@echo "Services started. Run 'make compose-logs' to view logs"

compose-down: ## Stop and remove containers
	@echo "Stopping services..."
	docker-compose down

compose-logs: ## View docker-compose logs
	docker-compose logs -f ts3audiobot

logs: compose-logs ## Alias for compose-logs

compose-restart: ## Restart services
	@echo "Restarting services..."
	docker-compose restart ts3audiobot
	@echo "Services restarted"

compose-shell: ## Open shell in running container
	docker-compose exec ts3audiobot /bin/bash

config-init: ## Initialize config from templates
	@echo "Initializing configuration..."
	@if [ ! -f config/ts3audiobot.toml ]; then \
		cp config/ts3audiobot.toml.example config/ts3audiobot.toml; \
		echo "Created config/ts3audiobot.toml from template"; \
	else \
		echo "config/ts3audiobot.toml already exists"; \
	fi
	@if [ ! -f config/rights.toml ]; then \
		cp config/rights.toml.example config/rights.toml; \
		echo "Created config/rights.toml from template"; \
	else \
		echo "config/rights.toml already exists"; \
	fi

volume-create: ## Create Docker volume if it doesn't exist
	@echo "Creating volume..."
	docker volume create ts3audiobot-data

volume-inspect: ## Show volume details
	docker volume inspect ts3audiobot-data

volume-remove: ## Remove Docker volume (WARNING: deletes data)
	@echo "WARNING: This will delete the volume and all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker volume rm ts3audiobot-data; \
		echo "Volume removed"; \
	fi

clean: ## Remove local build artifacts
	@echo "Cleaning up..."
	docker rmi ts3audiobot-docker:local 2>/dev/null || true
	@echo "Cleanup complete"

validate-config: ## Validate configuration files with detailed checks
	@echo "Running configuration validation..."
	@bash scripts/validate-config.sh

pre-commit-install: ## Install pre-commit hooks
	@command -v pre-commit >/dev/null 2>&1 || { echo "pre-commit not found. Install with: pip install pre-commit"; exit 1; }
	pre-commit install
	@echo "Pre-commit hooks installed"

version: ## Show version information
	@echo "TS3AudioBot-Docker Version Info:"
	@grep "Runtime:" README.md | head -1
	@grep "Base:" README.md | head -1
	@grep "Last Updated:" README.md | head -1
