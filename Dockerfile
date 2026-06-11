FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm install && npx prisma generate

COPY . .

EXPOSE 3000

CMD ["npm", "start"]