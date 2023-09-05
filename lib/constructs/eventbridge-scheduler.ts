import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface EventBridgeSchedulerProps {
  name: string;
  targetStateMachineArn: string;
  role: cdk.aws_iam.Role;
  scheduleExpression: string;
  input: any;
}

export class EventBridgeScheduler extends Construct {
  constructor(scope: Construct, id: string, props: EventBridgeSchedulerProps) {
    super(scope, id);

    new cdk.aws_scheduler.CfnSchedule(this, "Default", {
      flexibleTimeWindow: {
        mode: "OFF",
      },
      scheduleExpression: props.scheduleExpression,
      target: {
        arn: props.targetStateMachineArn,
        roleArn: props.role.roleArn,
        input: JSON.stringify(props.input),
        retryPolicy: {
          maximumEventAgeInSeconds: 60,
          maximumRetryAttempts: 0,
        },
      },
      name: props.name,
      scheduleExpressionTimezone: "Asia/Tokyo",
      state: "ENABLED",
    });
  }
}
