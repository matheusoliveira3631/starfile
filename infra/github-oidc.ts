import { CfnOutput, Duration, Stack, type StackProps } from 'aws-cdk-lib';
import { OpenIdConnectProvider, PolicyStatement, Role, WebIdentityPrincipal } from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface GithubOidcStackProps extends StackProps {
  /** owner/repo */
  repository: string;
  /** Environment do GitHub Actions que pode assumir o papel. */
  environment: string;
}

// Papel que o GitHub Actions assume pra fazer deploy, sem chave de acesso guardada em secret.
// Deploy dessa stack é manual e uma vez só: npx cdk deploy StarfileGithubOidc
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    const provider = new OpenIdConnectProvider(this, 'Github', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });

    const role = new Role(this, 'DeployRole', {
      description: `Deploy do ${props.repository} pelo GitHub Actions`,
      maxSessionDuration: Duration.hours(1),
      // Só tokens deste repositório E deste environment. Um workflow em outra branch,
      // num fork ou num PR não consegue assumir o papel.
      assumedBy: new WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${props.repository}:environment:${props.environment}`,
        },
      }),
    });

    // O papel não mexe em recurso nenhum diretamente: só assume os papéis que o
    // cdk bootstrap criou (deploy, publicação de assets, lookup), que é como o CDK trabalha.
    role.addToPolicy(
      new PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new CfnOutput(this, 'DeployRoleArn', { value: role.roleArn });
  }
}
