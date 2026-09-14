import { startKnowledgeBaseMock } from "./knowledge-base-mock.mjs";
import { startStaticServer } from "./static-server.mjs";

const host = process.env.HOST ?? "127.0.0.1";
const staticPort = Number(process.env.PORT ?? 4173);
const knowledgeBasePort = Number(process.env.KNOWLEDGE_BASE_PORT ?? 5151);

if (![staticPort, knowledgeBasePort].every((port) => Number.isInteger(port) && port >= 0 && port <= 65535)) {
  throw new Error("PORT and KNOWLEDGE_BASE_PORT must be integers between 0 and 65535");
}

const [staticServer, knowledgeBase] = await Promise.all([
  startStaticServer({ host, port: staticPort, fallbackToRandomPort: process.env.PORT === undefined }),
  startKnowledgeBaseMock({ host, port: knowledgeBasePort })
]);

console.log(`Serving offline-pack/main at http://${host}:${staticServer.address().port}/`);
console.log(knowledgeBase.usingExistingService
  ? `Using existing knowledge-base service at http://${host}:${knowledgeBase.port}/`
  : `Serving empty knowledge-base mock at http://${host}:${knowledgeBase.port}/`);

const shutdown = () => {
  staticServer.close();
  knowledgeBase.server?.close();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
