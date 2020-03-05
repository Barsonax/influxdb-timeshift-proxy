FROM node:alpine

EXPOSE 8089

COPY ./src /app
WORKDIR /app

CMD [ "node", "start" ]