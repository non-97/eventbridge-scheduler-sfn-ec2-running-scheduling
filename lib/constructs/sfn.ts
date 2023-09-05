import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";

export interface SfnProps {}

export class Sfn extends Construct {
  readonly stateMachine: cdk.aws_stepfunctions.StateMachine;

  constructor(scope: Construct, id: string, props?: SfnProps) {
    super(scope, id);

    // 複数のタグが付与されている場合はループさせる
    // ループされた結果はフラットな配列に変換
    // インスタンスIDはユニークになるように設定
    // マッチするインスタンスが存在したかどうか判断するために length を結果に追加
    const mapTags = new cdk.aws_stepfunctions.Map(this, "MapTags", {
      itemsPath: cdk.aws_stepfunctions.JsonPath.stringAt("$.Tags.or"),
      resultSelector: {
        InstanceIds: cdk.aws_stepfunctions.JsonPath.stringAt(
          "States.ArrayUnique($[*][*][*])"
        ),
        length: cdk.aws_stepfunctions.JsonPath.stringAt(
          "States.ArrayLength(States.ArrayUnique($[*][*][*]))"
        ),
      },
    });

    // 指定したタグが付与されているEC2 InstanceのID取得
    const instanceIdsTagSummation =
      new cdk.aws_stepfunctions_tasks.CallAwsService(
        this,
        "DescribeInstancesTagSummation",
        {
          service: "ec2",
          action: "describeInstances",
          iamResources: ["*"],
          resultSelector: {
            InstanceIds: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.Reservations[*].Instances[*].InstanceId"
            ),
          },
          parameters: {
            Filters: [
              {
                Name: cdk.aws_stepfunctions.JsonPath.stringAt(
                  "States.Format('tag:{}', $.Key)"
                ),
                Values: cdk.aws_stepfunctions.JsonPath.stringAt("$.Values"),
              },
            ],
          },
        }
      );

    // 複数の指定したタグが付与されているEC2 InstanceのID取得
    const instanceIdsTagProduct =
      new cdk.aws_stepfunctions_tasks.CallAwsService(
        this,
        "DescribeInstancesTagProduct",
        {
          service: "ec2",
          action: "describeInstances",
          iamResources: ["*"],
          resultSelector: {
            InstanceIds: cdk.aws_stepfunctions.JsonPath.stringAt(
              "$.Reservations[*].Instances[*].InstanceId"
            ),
            length: cdk.aws_stepfunctions.JsonPath.stringAt(
              "States.ArrayLength($.Reservations[*].Instances[*].InstanceId)"
            ),
          },
          parameters: {
            Filters: cdk.aws_stepfunctions.JsonPath.stringAt("$.Tags.and"),
          },
        }
      );

    // タグがAND か OR かの判定
    const choiceTag = new cdk.aws_stepfunctions.Choice(this, "ChoiceTag")
      .when(cdk.aws_stepfunctions.Condition.isPresent("$.Tags.or"), mapTags)
      .when(
        cdk.aws_stepfunctions.Condition.isPresent("$.Tags.and"),
        instanceIdsTagProduct
      );

    // EC2 Instanceの停止
    const stopInstances = new cdk.aws_stepfunctions_tasks.CallAwsService(
      this,
      "StopInstances",
      {
        service: "ec2",
        action: "stopInstances",
        iamResources: ["*"],
        parameters: {
          InstanceIds: cdk.aws_stepfunctions.JsonPath.stringAt("$.InstanceIds"),
        },
      }
    );

    // EC2 Instanceの起動
    const startInstances = new cdk.aws_stepfunctions_tasks.CallAwsService(
      this,
      "StartInstances",
      {
        service: "ec2",
        action: "startInstances",
        iamResources: ["*"],
        parameters: {
          InstanceIds: cdk.aws_stepfunctions.JsonPath.stringAt("$.InstanceIds"),
        },
      }
    );

    // 指定した条件にマッチするEC2 Instanceが存在しない場合用のステート
    const pass = new cdk.aws_stepfunctions.Pass(this, "Pass");

    // EC2 Instanceの起動 or 停止
    const choiceAction = new cdk.aws_stepfunctions.Choice(this, "ChoiceAction")
      .when(
        // cdk.aws_stepfunctions.Condition.stringEquals("$.InstanceIds", ""),
        cdk.aws_stepfunctions.Condition.numberEquals("$.length", 0),
        pass
      )
      .when(
        cdk.aws_stepfunctions.Condition.stringEquals(
          "$$.Execution.Input.Action",
          "Stop"
        ),
        stopInstances
      )
      .when(
        cdk.aws_stepfunctions.Condition.stringEquals(
          "$$.Execution.Input.Action",
          "Start"
        ),
        startInstances
      );

    // ワークフローの定義
    const definition = choiceTag;
    mapTags.iterator(instanceIdsTagSummation).next(choiceAction);
    instanceIdsTagProduct.next(choiceAction);
    pass.endStates;

    // StepFunctions ステートマシンの作成
    this.stateMachine = new cdk.aws_stepfunctions.StateMachine(
      this,
      "Default",
      {
        definitionBody:
          cdk.aws_stepfunctions.DefinitionBody.fromChainable(definition),
        timeout: cdk.Duration.minutes(5),
      }
    );
  }
}
