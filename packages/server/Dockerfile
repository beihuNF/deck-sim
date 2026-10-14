FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev ws
COPY dist/standalone.js dist/selection.js ./dist/
EXPOSE 8787
ENV PORT=8787
CMD ["node", "dist/standalone.js"]
