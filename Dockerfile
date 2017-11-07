FROM apify/actor-node-basic

ENV NODE_ENV=production

COPY . ./

RUN npm install --quiet
RUN npm run build

CMD [ "node", "main.js" ]