FROM node:22-alpine

WORKDIR /opt

LABEL org.opencontainers.image.source=https://github.com/lannonbr/jeff-bot

COPY . .
RUN npm install

CMD [ "index.js" ]
