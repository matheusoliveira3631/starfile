import { App, Tags } from 'aws-cdk-lib';
import { GithubOidcStack } from './github-oidc.js';
import { StarfileStack } from './stack.js';

const app = new App();

// Tudo configurável por contexto: cdk deploy -c stage=prod -c allowedOrigins=https://exemplo.com
const stage = String(app.node.tryGetContext('stage') ?? 'dev');
const context = (key: string) => app.node.tryGetContext(key) as string | undefined;

const env = process.env.CDK_DEFAULT_ACCOUNT
  ? { env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' } }
  : {};

const stack = new StarfileStack(app, `Starfile-${stage}`, {
  ...env,
  allowedOrigins: (context('allowedOrigins') ?? '').split(',').filter(Boolean),
  retainData: stage === 'prod',
  fileRetentionDays: Number(context('fileRetentionDays') ?? 30),
  alarmEmail: context('alarmEmail'),
});

Tags.of(stack).add('project', 'starfile');
Tags.of(stack).add('stage', stage);

new GithubOidcStack(app, 'StarfileGithubOidc', {
  ...env,
  repository: context('githubRepository') ?? 'matheusoliveira3631/starfile',
  environment: 'production',
});
