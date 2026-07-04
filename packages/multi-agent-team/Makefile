.PHONY: build test clean lint

build:
	go build -o cmd/odteam/odteam ./cmd/odteam/

test:
	go test -v -race -cover ./...

clean:
	go clean -cache

lint:
	golangci-lint run ./...
