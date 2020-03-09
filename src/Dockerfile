FROM node:alpine

EXPOSE 8089

RUN npm install -g nodemon
COPY . /app
WORKDIR /app

ENTRYPOINT [ "npm", "run" ]
CMD [ "start" ]