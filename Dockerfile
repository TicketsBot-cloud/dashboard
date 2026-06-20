# Build container
FROM golang:alpine AS builder

RUN apk update && apk upgrade && apk add git zlib-dev gcc musl-dev

# Copy local modules that replace directives point to
COPY common/ /go/src/github.com/TicketsBot-cloud/common/
COPY database/ /go/src/github.com/TicketsBot-cloud/database/
COPY worker/ /go/src/github.com/TicketsBot-cloud/worker/

COPY dashboard/ /go/src/github.com/TicketsBot-cloud/dashboard/
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
FROM alpine:latest

RUN apk update && apk upgrade && apk add curl

COPY --from=builder /go/src/github.com/TicketsBot-cloud/dashboard/locale /srv/dashboard/locale
COPY --from=builder /go/src/github.com/TicketsBot-cloud/dashboard/main /srv/dashboard/main

RUN chmod +x /srv/dashboard/main

RUN adduser container --disabled-password --no-create-home
USER container
WORKDIR /srv/dashboard

CMD ["/srv/dashboard/main"]
