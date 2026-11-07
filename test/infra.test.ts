import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { GithubOidcStack } from '../infra/github-oidc.js';
import { StarfileStack, type StarfileStackProps } from '../infra/stack.js';

function synth(overrides: Partial<StarfileStackProps> = {}) {
  // Pula o esbuild: aqui só interessa o template.
  const app = new App({ context: { 'aws:cdk:bundling-stacks': [] } });
  const stack = new StarfileStack(app, 'Test', {
    allowedOrigins: [],
    retainData: true,
    fileRetentionDays: 30,
    ...overrides,
  });
  return Template.fromStack(stack);
}

type Statement = { Action: string | string[]; Resource: unknown };

function statementsOf(template: Template, functionLogicalIdPrefix: string): Statement[] {
  const policies = template.findResources('AWS::IAM::Policy');
  return Object.entries(policies)
    .filter(([id]) => id.startsWith(functionLogicalIdPrefix))
    .flatMap(([, policy]) => (policy as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement);
}

const actionsOf = (statements: Statement[]) => statements.flatMap((s) => [s.Action].flat());

describe('bucket', () => {
  const template = synth();

  it('bloqueia acesso público e exige HTTPS', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    template.hasResourceProperties('AWS::S3::BucketPolicy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Effect: 'Deny', Condition: { Bool: { 'aws:SecureTransport': 'false' } } }),
        ]),
      },
    });
  });

  it('expira pending/ em 1 dia e files/ depois da retenção', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      LifecycleConfiguration: {
        Rules: Match.arrayWith([
          Match.objectLike({ Prefix: 'pending/', ExpirationInDays: 1 }),
          Match.objectLike({ Prefix: 'files/', ExpirationInDays: 31 }),
        ]),
      },
    });
  });

  it('só tem CORS quando há origem configurada', () => {
    template.hasResourceProperties('AWS::S3::Bucket', { CorsConfiguration: Match.absent() });
    synth({ allowedOrigins: ['https://exemplo.com'] }).hasResourceProperties('AWS::S3::Bucket', {
      CorsConfiguration: { CorsRules: [Match.objectLike({ AllowedMethods: ['POST'], AllowedOrigins: ['https://exemplo.com'] })] },
    });
  });

  it('dispara a validação só em pending/', () => {
    template.hasResourceProperties('Custom::S3BucketNotifications', {
      NotificationConfiguration: {
        LambdaFunctionConfigurations: [
          Match.objectLike({
            Events: ['s3:ObjectCreated:*'],
            Filter: { Key: { FilterRules: [{ Name: 'prefix', Value: 'pending/' }] } },
          }),
        ],
      },
    });
  });
});

describe('tabela', () => {
  const template = synth();

  it('tem TTL, índice por token e backup contínuo', () => {
    template.hasResourceProperties('AWS::DynamoDB::GlobalTable', {
      TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      GlobalSecondaryIndexes: [Match.objectLike({ IndexName: 'byTokenHash' })],
      Replicas: [Match.objectLike({ PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true } })],
    });
  });

  it('é mantida em produção e apagada fora dela', () => {
    template.hasResource('AWS::DynamoDB::GlobalTable', { DeletionPolicy: 'Retain' });
    synth({ retainData: false }).hasResource('AWS::DynamoDB::GlobalTable', { DeletionPolicy: 'Delete' });
  });
});

describe('permissões', () => {
  const template = synth();

  it('nenhuma função tem curinga de ação', () => {
    const all = Object.values(template.findResources('AWS::IAM::Policy')).flatMap(
      (p) => (p as { Properties: { PolicyDocument: { Statement: Statement[] } } }).Properties.PolicyDocument.Statement,
    );
    for (const action of actionsOf(all)) expect(action).not.toMatch(/:\*$|^\*$/);
  });

  it('a API não apaga objeto nem faz scan na tabela', () => {
    const actions = actionsOf(statementsOf(template, 'ApiServiceRole'));
    expect(actions).toContain('s3:PutObject');
    expect(actions).toContain('s3:GetObject');
    expect(actions).not.toContain('s3:DeleteObject');
    expect(actions).not.toContain('dynamodb:Scan');
  });

  it('a validação só lê e apaga em pending/', () => {
    const statements = statementsOf(template, 'ValidateUploadServiceRole');
    const deletes = statements.find((s) => [s.Action].flat().includes('s3:DeleteObject'));
    expect(JSON.stringify(deletes?.Resource)).toContain('/pending/*');
    expect(actionsOf(statements)).not.toContain('dynamodb:PutItem');
  });
});

describe('API', () => {
  const template = synth();

  it('tem throttling e log de acesso sem headers', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: { ThrottlingRateLimit: 50, ThrottlingBurstLimit: 100 },
      AccessLogSettings: Match.objectLike({ Format: Match.stringLikeRegexp('sourceIp') }),
    });
    const stage = Object.values(template.findResources('AWS::ApiGatewayV2::Stage'))[0] as {
      Properties: { AccessLogSettings: { Format: string } };
    };
    expect(stage.Properties.AccessLogSettings.Format).not.toMatch(/header|authorization/i);
  });

  it('roda as funções em Node 22 ARM', () => {
    const functions = Object.values(template.findResources('AWS::Lambda::Function', { Properties: { Runtime: 'nodejs22.x' } }));
    expect(functions.length).toBeGreaterThanOrEqual(2);
    template.hasResourceProperties('AWS::Lambda::Function', { Architectures: ['arm64'], Handler: 'index.handler' });
  });

  it('manda falhas da validação pra uma fila com alarme', () => {
    template.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
      MaximumRetryAttempts: 2,
      DestinationConfig: { OnFailure: Match.objectLike({}) },
    });
    template.resourceCountIs('AWS::CloudWatch::Alarm', 1);
    template.resourceCountIs('AWS::SNS::Topic', 0);
    synth({ alarmEmail: 'eu@exemplo.com' }).resourceCountIs('AWS::SNS::Subscription', 1);
  });
});

describe('papel de deploy do GitHub', () => {
  const app = new App();
  const template = Template.fromStack(
    new GithubOidcStack(app, 'Oidc', { repository: 'dono/repo', environment: 'production' }),
  );

  it('só aceita token do repositório e do environment certos', () => {
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          Match.objectLike({
            Action: 'sts:AssumeRoleWithWebIdentity',
            Condition: {
              StringEquals: {
                'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
                'token.actions.githubusercontent.com:sub': 'repo:dono/repo:environment:production',
              },
            },
          }),
        ],
      },
    });
  });

  it('só pode assumir os papéis do cdk bootstrap', () => {
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Resource: { 'Fn::Join': ['', ['arn:aws:iam::', { Ref: 'AWS::AccountId' }, ':role/cdk-*']] },
          },
        ],
      },
    });
  });
});
