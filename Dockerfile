FROM node:latest

WORKDIR /usr/src/discord-bot
ADD . ./
COPY package.json ./package.json
COPY package-lock.json ./package-lock.json
COPY tsconfig.json ./tsconfig.json

RUN npm update && npm install
RUN npm install pm2 -g
RUN npm run compile

CMD ["pm2-runtime", "dist/app.js", "--name", "docker-bot"]