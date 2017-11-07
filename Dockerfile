FROM apify/actor-node-puppeteer

ENV NODE_ENV=production

COPY . ./

RUN npm install --quiet
RUN npm run build

CMD [ "node", "main.js" ]