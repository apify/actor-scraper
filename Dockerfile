FROM apify/actor-node-puppeteer

ENV NODE_ENV=production

COPY . ./

RUN npm install --quiet --dev
RUN npm run build

CMD [ "node", "main.js" ]