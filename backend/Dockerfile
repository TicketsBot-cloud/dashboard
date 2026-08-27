# Build container
FROM golang:1.25 AS builder

# Copy local modules that replace directives point to
# COPY common/ /go/src/github.com/TicketsBot-cloud/common/
# COPY database/ /go/src/github.com/TicketsBot-cloud/database/
# COPY worker/ /go/src/github.com/TicketsBot-cloud/worker/

RUN apt-get update && apt-get upgrade -y && apt-get install -y ca-certificates git zlib1g-dev

COPY . /go/src/github.com/TicketsBot-cloud/dashboard
WORKDIR /go/src/github.com/TicketsBot-cloud/dashboard

RUN git submodule update --init --recursive --remote

RUN set -Eeux && \
    go mod download && \
    go mod verify

RUN GOOS=linux GOARCH=amd64 \
    go build \
    -tags=jsoniter \
    -trimpath \
    -o main cmd/api/main.go

# Prod container
FROM alpine:latest

RUN apk update && apk upgrade && apk add curl

COPY --from=builder /go/src/github.com/ticketsbot-cloud/dashboard/locale /srv/dashboard/locale
COPY --from=builder /go/src/github.com/ticketsbot-cloud/dashboard/main /srv/dashboard/main

RUN chmod +x /srv/dashboard/main

RUN adduser container --disabled-password --no-create-home
USER container
WORKDIR /srv/dashboard

CMD ["/srv/dashboard/main"]
