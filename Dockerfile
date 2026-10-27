FROM node:22-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
COPY app/package.json app/pnpm-lock.yaml ./app/
WORKDIR /workspace/app
RUN pnpm install --frozen-lockfile
WORKDIR /workspace
COPY app ./app
COPY input_examples ./input_examples
COPY sdk ./sdk
COPY contracts ./contracts
RUN cd app && npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3001
WORKDIR /workspace
COPY --from=build /workspace/app ./app
COPY --from=build /workspace/input_examples ./input_examples
WORKDIR /workspace/app
EXPOSE 3001
CMD ["npm", "run", "start", "--", "-p", "3001", "-H", "0.0.0.0"]
