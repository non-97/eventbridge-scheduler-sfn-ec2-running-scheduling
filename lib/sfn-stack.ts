import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import { Vpc } from "./constructs/vpc";
import { Ec2Instance } from "./constructs/ec2-instance";
import { Sfn } from "./constructs/sfn";
import { EventBridgeScheduler } from "./constructs/eventbridge-scheduler";

export class SfnStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const tags = [
      {
        key: "Instance",
        value: "Instance A",
      },
      {
        key: "Instance",
        value: "Instance B",
      },
      {
        key: "Instance",
        value: "Instance C",
      },
    ];

    // VPC
    const vpc = new Vpc(this, "Vpc");

    // EC2 Instance
    tags.forEach((tag) => {
      const instance = new Ec2Instance(this, tag.value, {
        vpc: vpc.vpc,
      });
      cdk.Tags.of(instance).add(tag.key, tag.value);
      cdk.Tags.of(instance).add("test key", "test value");
    });

    // State Machine
    const sfn = new Sfn(this, "Sfn");

    // EventBridge Scheduler Role
    const schedulerRole = new cdk.aws_iam.Role(this, "SchedulerRole", {
      assumedBy: new cdk.aws_iam.ServicePrincipal("scheduler.amazonaws.com"),
      managedPolicies: [
        new cdk.aws_iam.ManagedPolicy(this, "StartExecution", {
          statements: [
            new cdk.aws_iam.PolicyStatement({
              effect: cdk.aws_iam.Effect.ALLOW,
              resources: [sfn.stateMachine.stateMachineArn],
              actions: ["states:StartExecution"],
            }),
          ],
        }),
      ],
    });

    // EventBridge Scheduler
    new EventBridgeScheduler(this, "StopInstanceScheduler", {
      name: "stop-instances",
      targetStateMachineArn: sfn.stateMachine.stateMachineArn,
      role: schedulerRole,
      scheduleExpression: "cron(0/10 * * * ? *)",
      input: {
        Tags: {
          or: [
            {
              Key: "Instance",
              Values: ["Instance A"],
            },
            {
              Key: "test key",
              Values: ["test value"],
            },
          ],
        },
        Action: "Stop",
      },
    });

    new EventBridgeScheduler(this, "StartInstanceScheduler", {
      name: "start-instances",
      targetStateMachineArn: sfn.stateMachine.stateMachineArn,
      role: schedulerRole,
      scheduleExpression: "cron(5/10 * * * ? *)",
      input: {
        Tags: {
          and: [
            {
              Name: "tag:Instance",
              Values: ["Instance A"],
            },
            {
              Name: "tag:test key",
              Values: ["test value"],
            },
          ],
        },
        Action: "Start",
      },
    });
  }
}
