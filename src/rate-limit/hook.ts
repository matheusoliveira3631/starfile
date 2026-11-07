import type { FastifyReply, FastifyRequest, onRequestAsyncHookHandler } from 'fastify';
import type { RateLimiter, RateLimitResult } from './limiter.js';

export interface RateLimitRule {
  name: string;
  limit: number;
  windowSeconds: number;
  subject: (request: FastifyRequest) => string;
}

export function setRateLimitHeaders(reply: FastifyReply, result: RateLimitResult) {
  const resetIn = Math.max(0, result.resetAt - Math.floor(Date.now() / 1000));
  void reply
    .header('ratelimit-limit', result.limit)
    .header('ratelimit-remaining', result.remaining)
    .header('ratelimit-reset', resetIn);
  return resetIn;
}

export function tooManyRequests(reply: FastifyReply, result: RateLimitResult) {
  const resetIn = setRateLimitHeaders(reply, result);
  return reply
    .code(429)
    .header('retry-after', resetIn)
    .send({ error: 'rate_limited', message: `Muitas requisições. Tente de novo em ${String(resetIn)}s` });
}

export function rateLimit(limiter: RateLimiter, rule: RateLimitRule): onRequestAsyncHookHandler {
  return async (request, reply) => {
    const result = await limiter.hit(`${rule.name}:${rule.subject(request)}`, rule.limit, rule.windowSeconds);
    if (!result.allowed) return tooManyRequests(reply, result);
    setRateLimitHeaders(reply, result);
  };
}
