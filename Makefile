.PHONY: lint test build dev dev-mock format e2e spec be-generate be-build be-run be-test be-lint be-docker-build be-docker-run

SPEC := spec/tsp-output/@typespec/openapi3/openapi.yaml
BACKEND := backend
OAPI := $(shell go env GOPATH)/bin/oapi-codegen

# --- Фронтенд ---

lint:
	cd frontend && npm run lint

test:
	cd frontend && npm run test

build:
	cd frontend && npm run build

dev:
	cd frontend && npm run dev

dev-mock:
	cd frontend && npm run dev:mock

format:
	cd frontend && npm run format

e2e:
	cd frontend && npm run e2e

# --- Контракт API ---

spec:
	cd spec && npm run compile



be-generate:
	cd $(BACKEND) && $(OAPI) --config api/oapi-codegen.yaml "$(abspath $(SPEC))"

be-build:
	cd $(BACKEND) && go build ./...

be-run:
	cd $(BACKEND) && go run .

be-test:
	cd $(BACKEND) && go test ./...

be-lint:
	cd $(BACKEND) && go vet ./...

be-docker-build:
	docker build -t bookingapi .

be-docker-run:
	docker run --rm -p 8080:8080 --env-file $(BACKEND)/.env bookingapi