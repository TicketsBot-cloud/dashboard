# Build container
FROM golang:1.26 AS builder

# Copy local modules that replace directives point to
COPY common/ /go/src/github.com/common/
COPY database/ /go/src/github.com/database/
COPY worker/ /go/src/github.com/worker/
COPY gdl/ /go/src/github.com/gdl/

RUN apt-get update && apt-get upgrade -y && apt-get install -y ca-certificates zlib1g-dev

COPY dashboard/backend/ /go/src/github.com/TicketsBot-cloud/dashboard
WORKDIR /go/src/github.com/TicketsBot-cloud/dashboard

RUN set -Eeux && \
    go mod download && \
    go mod verify

RUN GOOS=linux GOARCH=amd64 \
    go build \
    -tags=jsoniter \
    -trimpath \
    -o main cmd/api/main.go

# Prod container
FROM ubuntu:latest

RUN apt-get update && apt-get upgrade -y && apt-get install -y ca-certificates curl

COPY --from=builder /go/src/github.com/TicketsBot-cloud/dashboard/locale /srv/dashboard/locale
COPY --from=builder /go/src/github.com/TicketsBot-cloud/dashboard/main /srv/dashboard/main

RUN chmod +x /srv/dashboard/main

RUN useradd -m container
USER container
WORKDIR /srv/dashboard

CMD ["/srv/dashboard/main"]
