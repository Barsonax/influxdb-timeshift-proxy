FROM node:alpine

EXPOSE 8089

RUN npm install -g nodemon
COPY ./src /app
WORKDIR /app

CMD [ "nodemon", "start" ]