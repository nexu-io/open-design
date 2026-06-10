.PHONY: build run test clean

APP_NAME = odteam
BUILD_DIR = build

build:
	go build -o $(BUILD_DIR)/$(APP_NAME) ./cmd/odteam

run: build
	./$(BUILD_DIR)/$(APP_NAME)

test:
	go test -v -race -cover ./...

clean:
	rm -rf $(BUILD_DIR)

lint:
	golangci-lint run ./...
