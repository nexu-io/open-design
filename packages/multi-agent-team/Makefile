.PHONY: build test clean lint

build:
	go build ./...

test:
	go test -v -race -cover ./...

clean:
	go clean -cache

lint:
	golangci-lint run ./...
