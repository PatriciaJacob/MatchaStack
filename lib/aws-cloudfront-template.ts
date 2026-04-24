interface AwsTemplateOptions {
  propsEndpoint: string;
  ssrRoutes: string[];
}

export function renderAwsCloudFrontTemplate({ propsEndpoint, ssrRoutes }: AwsTemplateOptions) {
  const lambdaBehaviors = [
    { pathPattern: `${propsEndpoint}*`, description: 'SSR props endpoint' },
    ...ssrRoutes
      .filter((route) => route !== '/')
      .map((route) => ({
        pathPattern: `${route}${route.endsWith('*') ? '' : '*'}`,
        description: `SSR route ${route}`,
      })),
  ];

  const cacheBehaviors = lambdaBehaviors.map((behavior) => {
    return [
      `          - PathPattern: '${behavior.pathPattern}'`,
      `            TargetOriginId: LambdaOrigin`,
      `            ViewerProtocolPolicy: redirect-to-https`,
      `            AllowedMethods: [GET, HEAD, OPTIONS]`,
      `            CachedMethods: [GET, HEAD]`,
      `            CachePolicyId: !Ref DynamicCachePolicy`,
      `            OriginRequestPolicyId: !Ref DynamicOriginRequestPolicy`,
      `            Compress: true`,
    ].join('\n');
  }).join('\n');

  const cacheBehaviorsBlock = cacheBehaviors.length > 0
    ? `        CacheBehaviors:\n${cacheBehaviors}`
    : `        CacheBehaviors: []`;

  return `AWSTemplateFormatVersion: '2010-09-09'
Description: MatchaStack CloudFront distribution for S3 static assets plus Lambda SSR.

Parameters:
  SsrLambdaUrlDomainName:
    Type: String
    Description: Lambda Function URL domain name without protocol, for example abcdef.lambda-url.eu-west-2.on.aws

Resources:
  StaticSiteBucket:
    Type: AWS::S3::Bucket
    Properties:
      PublicAccessBlockConfiguration:
        BlockPublicAcls: true
        BlockPublicPolicy: true
        IgnorePublicAcls: true
        RestrictPublicBuckets: true

  CloudFrontOriginAccessControl:
    Type: AWS::CloudFront::OriginAccessControl
    Properties:
      OriginAccessControlConfig:
        Name: !Sub '\${AWS::StackName}-static-oac'
        OriginAccessControlOriginType: s3
        SigningBehavior: always
        SigningProtocol: sigv4

  StaticBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: !Ref StaticSiteBucket
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Sid: AllowCloudFrontRead
            Effect: Allow
            Principal:
              Service: cloudfront.amazonaws.com
            Action: s3:GetObject
            Resource: !Sub '\${StaticSiteBucket.Arn}/*'
            Condition:
              StringEquals:
                AWS:SourceArn: !Sub 'arn:aws:cloudfront::\${AWS::AccountId}:distribution/\${Distribution}'

  StaticRewriteFunction:
    Type: AWS::CloudFront::Function
    Properties:
      Name: !Sub '\${AWS::StackName}-static-rewrite'
      AutoPublish: true
      FunctionConfig:
        Comment: Rewrite extensionless S3 paths to index.html
        Runtime: cloudfront-js-1.0
      FunctionCode: |
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          if (uri.endsWith('/')) {
            request.uri += 'index.html';
            return request;
          }
          if (!uri.includes('.')) {
            request.uri += '/index.html';
          }
          return request;
        }

  StaticCachePolicy:
    Type: AWS::CloudFront::CachePolicy
    Properties:
      CachePolicyConfig:
        Name: !Sub '\${AWS::StackName}-static-cache'
        DefaultTTL: 31536000
        MaxTTL: 31536000
        MinTTL: 0
        ParametersInCacheKeyAndForwardedToOrigin:
          CookiesConfig:
            CookieBehavior: none
          HeadersConfig:
            HeaderBehavior: none
          QueryStringsConfig:
            QueryStringBehavior: none
          EnableAcceptEncodingBrotli: true
          EnableAcceptEncodingGzip: true

  DynamicCachePolicy:
    Type: AWS::CloudFront::CachePolicy
    Properties:
      CachePolicyConfig:
        Name: !Sub '\${AWS::StackName}-dynamic-cache'
        DefaultTTL: 0
        MaxTTL: 0
        MinTTL: 0
        ParametersInCacheKeyAndForwardedToOrigin:
          CookiesConfig:
            CookieBehavior: all
          HeadersConfig:
            HeaderBehavior: whitelist
            Headers:
              - Accept
              - Authorization
              - CloudFront-Forwarded-Proto
              - Host
          QueryStringsConfig:
            QueryStringBehavior: all
          EnableAcceptEncodingBrotli: true
          EnableAcceptEncodingGzip: true

  DynamicOriginRequestPolicy:
    Type: AWS::CloudFront::OriginRequestPolicy
    Properties:
      OriginRequestPolicyConfig:
        Name: !Sub '\${AWS::StackName}-dynamic-origin'
        CookiesConfig:
          CookieBehavior: all
        HeadersConfig:
          HeaderBehavior: allViewerExceptHostHeader
        QueryStringsConfig:
          QueryStringBehavior: all

  Distribution:
    Type: AWS::CloudFront::Distribution
    Properties:
      DistributionConfig:
        Enabled: true
        HttpVersion: http2
        DefaultRootObject: index.html
        Origins:
          - Id: StaticOrigin
            DomainName: !GetAtt StaticSiteBucket.RegionalDomainName
            S3OriginConfig: {}
            OriginAccessControlId: !Ref CloudFrontOriginAccessControl
          - Id: LambdaOrigin
            DomainName: !Ref SsrLambdaUrlDomainName
            CustomOriginConfig:
              OriginProtocolPolicy: https-only
              OriginSSLProtocols:
                - TLSv1.2
        DefaultCacheBehavior:
          TargetOriginId: StaticOrigin
          ViewerProtocolPolicy: redirect-to-https
          AllowedMethods: [GET, HEAD, OPTIONS]
          CachedMethods: [GET, HEAD]
          CachePolicyId: !Ref StaticCachePolicy
          Compress: true
          FunctionAssociations:
            - EventType: viewer-request
              FunctionARN: !GetAtt StaticRewriteFunction.FunctionMetadata.FunctionARN
${cacheBehaviorsBlock}

Outputs:
  StaticBucketName:
    Value: !Ref StaticSiteBucket
  CloudFrontDistributionId:
    Value: !Ref Distribution
  CloudFrontDomainName:
    Value: !GetAtt Distribution.DomainName
`;
}

export function renderAwsDeployReadme({ propsEndpoint, ssrRoutes }: AwsTemplateOptions) {
  const listedRoutes = ssrRoutes.length > 0 ? ssrRoutes.map((route) => `- \`${route}\``).join('\n') : '- None';

  return `# AWS deploy artifacts

This build is split for AWS:

- Upload \`dist/public\` to the S3 bucket created by \`cloudfront-template.yaml\`
- Zip the contents of \`dist/server\` and deploy them to a Lambda function
- Configure the Lambda handler as \`lambda-handler.handler\`
- Create a Lambda Function URL and pass its domain name into the CloudFormation stack parameter \`SsrLambdaUrlDomainName\`

The CloudFront template routes these dynamic paths to Lambda:

- \`${propsEndpoint}\`
${listedRoutes}

The default CloudFront behavior serves \`dist/public\` from S3 and rewrites extensionless paths like \`/about\` to \`/about/index.html\`.
`;
}
