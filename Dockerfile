# Headless MineOffice for Linux servers. The desktop app is not included.
FROM node:22-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
# --ignore-scripts: the Electron download is not needed to build the command line
RUN npm ci --ignore-scripts
COPY . .
RUN npm pack --ignore-scripts=false && mv mineoffice-agent-*.tgz /mineoffice-agent.tgz

FROM node:22-slim
ENV NODE_ENV=production
ENV MINEOFFICE_HOME=/data
COPY --from=build /mineoffice-agent.tgz /tmp/mineoffice-agent.tgz
RUN npm install --global --omit=dev /tmp/mineoffice-agent.tgz && rm /tmp/mineoffice-agent.tgz
RUN mkdir -p /data && chown node:node /data
USER node
WORKDIR /data
VOLUME /data
EXPOSE 8787
ENTRYPOINT ["mineoffice-agent"]
CMD ["serve"]
