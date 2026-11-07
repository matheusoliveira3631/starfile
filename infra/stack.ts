import { CfnOutput, Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import { CfnStage, HttpApi, CorsHttpMethod } from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Alarm, ComparisonOperator, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { AttributeType, Billing, ProjectionType, TableV2 } from 'aws-cdk-lib/aws-dynamodb';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { SqsDestination } from 'aws-cdk-lib/aws-lambda-destinations';
import { NodejsFunction, OutputFormat, type NodejsFunctionProps } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { BlockPublicAccess, Bucket, BucketEncryption, EventType, HttpMethods, ObjectOwnership } from 'aws-cdk-lib/aws-s3';
import { LambdaDestination } from 'aws-cdk-lib/aws-s3-notifications';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Queue, QueueEncryption } from 'aws-cdk-lib/aws-sqs';
import type { Construct } from 'constructs';

export interface StarfileStackProps extends StackProps {
  /** Origens que podem mandar arquivo pelo navegador (CORS do bucket e da API). Vazio: só CLI/script. */
  allowedOrigins: string[];
  /** Mantém bucket e tabela se a stack for apagada. Ligado em produção. */
  retainData: boolean;
  fileRetentionDays: number;
  alarmEmail?: string | undefined;
}

const TOKEN_INDEX = 'byTokenHash';

export class StarfileStack extends Stack {
  constructor(scope: Construct, id: string, props: StarfileStackProps) {
    super(scope, id, props);

    const removalPolicy = props.retainData ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;

    // ---------- Armazenamento ----------

    const bucket = new Bucket(this, 'Files', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      objectOwnership: ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy,
      autoDeleteObjects: !props.retainData,
      lifecycleRules: [
        // Upload que nunca foi validado (Lambda falhou e caiu na DLQ, por exemplo).
        { id: 'pending', prefix: 'pending/', expiration: Duration.days(1) },
        // Um dia de folga sobre a retenção: quem manda é a data no DynamoDB, o S3 só faz a faxina.
        { id: 'files', prefix: 'files/', expiration: Duration.days(props.fileRetentionDays + 1) },
        { id: 'multipart', abortIncompleteMultipartUploadAfter: Duration.days(1) },
      ],
      cors: props.allowedOrigins.length
        ? [{ allowedMethods: [HttpMethods.POST], allowedOrigins: props.allowedOrigins, allowedHeaders: ['*'] }]
        : [],
    });

    const table = new TableV2(this, 'Table', {
      partitionKey: { name: 'pk', type: AttributeType.STRING },
      sortKey: { name: 'sk', type: AttributeType.STRING },
      billing: Billing.onDemand(),
      timeToLiveAttribute: 'expiresAt',
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy,
      globalSecondaryIndexes: [
        {
          indexName: TOKEN_INDEX,
          partitionKey: { name: 'tokenHash', type: AttributeType.STRING },
          projectionType: ProjectionType.ALL,
        },
      ],
    });

    // ---------- Lambdas ----------

    const environment = {
      NODE_ENV: 'production',
      NODE_OPTIONS: '--enable-source-maps',
      BUCKET_NAME: bucket.bucketName,
      TABLE_NAME: table.tableName,
      FILE_RETENTION_DAYS: String(props.fileRetentionDays),
    };

    const common = (name: string, entry: string): NodejsFunctionProps => ({
      entry,
      runtime: Runtime.NODEJS_22_X,
      architecture: Architecture.ARM_64,
      logGroup: new LogGroup(this, `${name}Logs`, { retention: RetentionDays.ONE_MONTH, removalPolicy: RemovalPolicy.DESTROY }),
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        minify: true,
        sourceMap: true,
        mainFields: ['module', 'main'],
        // Por padrão o CDK deixa @aws-sdk/* fora do bundle, contando com o SDK do runtime.
        // Só que o runtime não traz todos os pacotes (o s3-presigned-post, por exemplo) e a
        // versão dele muda sem aviso. Empacotando tudo, o que roda é o que foi testado.
        externalModules: [],
        // Algumas dependências ainda usam require; num bundle ESM ele precisa existir.
        banner: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
      },
    });

    const api = new NodejsFunction(this, 'Api', {
      ...common('Api', 'src/handlers/api.ts'),
      memorySize: 512,
      timeout: Duration.seconds(10),
      environment,
    });

    const deadLetters = new Queue(this, 'ValidateUploadDlq', {
      retentionPeriod: Duration.days(14),
      encryption: QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
    });

    const validator = new NodejsFunction(this, 'ValidateUpload', {
      ...common('ValidateUpload', 'src/handlers/validate-upload.ts'),
      memorySize: 256,
      timeout: Duration.seconds(30),
      environment,
      // Evento do S3 é invocação assíncrona: o Lambda tenta de novo 2 vezes e depois manda pra fila.
      retryAttempts: 2,
      onFailure: new SqsDestination(deadLetters),
    });

    bucket.addEventNotification(EventType.OBJECT_CREATED, new LambdaDestination(validator), { prefix: 'pending/' });

    // ---------- Permissões ----------
    // Nada de grantReadWrite: cada função só pode o que usa, em cada prefixo.

    const tableArns = [table.tableArn, `${table.tableArn}/index/${TOKEN_INDEX}`];

    api.addToRolePolicy(
      new PolicyStatement({
        actions: ['dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:Query'],
        resources: tableArns,
      }),
    );
    // A URL assinada usa as permissões de quem assinou: PutObject pro formulário de upload,
    // GetObject pro download. Cada uma só no seu prefixo.
    api.addToRolePolicy(new PolicyStatement({ actions: ['s3:PutObject'], resources: [bucket.arnForObjects('pending/*')] }));
    api.addToRolePolicy(new PolicyStatement({ actions: ['s3:GetObject'], resources: [bucket.arnForObjects('files/*')] }));

    validator.addToRolePolicy(
      new PolicyStatement({ actions: ['dynamodb:GetItem', 'dynamodb:UpdateItem'], resources: [table.tableArn] }),
    );
    validator.addToRolePolicy(
      new PolicyStatement({ actions: ['s3:GetObject', 's3:DeleteObject'], resources: [bucket.arnForObjects('pending/*')] }),
    );
    validator.addToRolePolicy(new PolicyStatement({ actions: ['s3:PutObject'], resources: [bucket.arnForObjects('files/*')] }));
    // Sem ListBucket, o HeadObject de uma key que não existe volta 403 em vez de 404, e a
    // validação trataria "o arquivo já foi processado" como erro de permissão.
    validator.addToRolePolicy(new PolicyStatement({ actions: ['s3:ListBucket'], resources: [bucket.bucketArn] }));

    // ---------- API Gateway ----------

    const httpApi = new HttpApi(this, 'HttpApi', {
      defaultIntegration: new HttpLambdaIntegration('ApiIntegration', api),
      ...(props.allowedOrigins.length && {
        corsPreflight: {
          allowOrigins: props.allowedOrigins,
          allowMethods: [CorsHttpMethod.GET, CorsHttpMethod.POST, CorsHttpMethod.DELETE],
          allowHeaders: ['authorization', 'content-type'],
          maxAge: Duration.hours(1),
        },
      }),
    });

    // A Lambda monta os links públicos com a URL da própria API.
    api.addEnvironment('PUBLIC_BASE_URL', httpApi.apiEndpoint);

    const accessLogs = new LogGroup(this, 'ApiAccessLogs', {
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Throttling antes de chegar na Lambda: segura pico e abuso de graça, sem invocar nada.
    // O rate limit da aplicação continua valendo por dono e por IP.
    const stage = httpApi.defaultStage?.node.defaultChild as CfnStage;
    stage.defaultRouteSettings = { throttlingRateLimit: 50, throttlingBurstLimit: 100 };
    // Log de acesso sem header nenhum. A v1 logava todos, cookies inclusos.
    stage.accessLogSettings = {
      destinationArn: accessLogs.logGroupArn,
      format: JSON.stringify({
        requestId: '$context.requestId',
        ip: '$context.identity.sourceIp',
        method: '$context.httpMethod',
        route: '$context.routeKey',
        status: '$context.status',
        latencyMs: '$context.responseLatency',
        integrationError: '$context.integrationErrorMessage',
      }),
    };

    // ---------- Alarme ----------

    const dlqAlarm = new Alarm(this, 'ValidateUploadFailures', {
      alarmDescription: 'Uploads que a validação não conseguiu processar depois de 3 tentativas',
      metric: deadLetters.metricApproximateNumberOfMessagesVisible({ period: Duration.minutes(5) }),
      threshold: 0,
      comparisonOperator: ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    });
    if (props.alarmEmail) {
      const topic = new Topic(this, 'Alarms');
      topic.addSubscription(new EmailSubscription(props.alarmEmail));
      dlqAlarm.addAlarmAction(new SnsAction(topic));
    }

    new CfnOutput(this, 'ApiUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'BucketName', { value: bucket.bucketName });
    new CfnOutput(this, 'TableName', { value: table.tableName });
  }
}
