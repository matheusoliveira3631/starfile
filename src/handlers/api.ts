import awsLambdaFastify from '@fastify/aws-lambda';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';

const app = buildApp(loadConfig());

// O IP do cliente vem do requestContext do API Gateway (sourceIp), que o cliente não
// consegue forjar. Por isso TRUST_PROXY fica false aqui.
export const handler = awsLambdaFastify(app);

// Inicializa na fase de init da Lambda, fora do tempo da primeira requisição.
await app.ready();
