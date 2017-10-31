FROM apify/actor-node-basic

ENV NODE_ENV=production

COPY . ./

RUN npm install --quiet --production

CMD [ "node", "main.js" ]