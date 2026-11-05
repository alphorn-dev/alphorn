// AWS SNS HTTP(S) subscription messages.
// Docs: https://docs.aws.amazon.com/sns/latest/dg/http-notification-json.html
//       https://docs.aws.amazon.com/sns/latest/dg/sns-message-and-json-formats.html
import {
  str,
  lines,
  tags,
  excerpt,
  type AutoSource,
  type Body,
  type AutoResult,
  lookup,
} from "./util";

const SNS_TYPES = ["Notification", "SubscriptionConfirmation", "UnsubscribeConfirmation"];

// Topic name is the last segment of arn:aws:sns:<region>:<account>:<name>.
function topicName(body: Body): string {
  return str(body, "TopicArn").split(":").pop() || "unknown topic";
}

// CloudWatch alarms publish a JSON document as the SNS Message string.
function parseAlarm(message: string): unknown {
  try {
    return JSON.parse(message);
  } catch {
    return undefined;
  }
}

const ALARM_PRIORITY: Record<string, number> = { ALARM: 4, OK: 2 };

function awsSns(body: Body): AutoResult {
  const type = str(body, "Type");
  const topic = topicName(body);

  if (type === "SubscriptionConfirmation") {
    return {
      title: `Confirm AWS SNS subscription for ${topic}`,
      message: lines(str(body, "Message"), str(body, "SubscribeURL")),
      priority: 4,
      tags: tags("aws-sns", type.toLowerCase(), topic.toLowerCase()),
    };
  }

  if (type === "UnsubscribeConfirmation") {
    return {
      title: `AWS SNS subscription removed for ${topic}`,
      message: excerpt(str(body, "Message")),
      priority: null,
      tags: tags("aws-sns", type.toLowerCase(), topic.toLowerCase()),
    };
  }

  if (type === "Notification") {
    const alarm = parseAlarm(str(body, "Message"));
    const alarmName = str(alarm, "AlarmName");
    const state = str(alarm, "NewStateValue");
    if (alarmName && state) {
      const region = str(alarm, "Region");
      return {
        title: `${alarmName} is ${state}`,
        message: lines(
          excerpt(str(alarm, "NewStateReason")),
          region ? `Region: ${region}` : ""
        ),
        priority: lookup(ALARM_PRIORITY, state) ?? null,
        tags: tags("aws-sns", type.toLowerCase(), "cloudwatch-alarm", state.toLowerCase(), topic.toLowerCase()),
      };
    }
    return {
      title: str(body, "Subject") || topic,
      message: excerpt(str(body, "Message")),
      priority: null,
      tags: tags("aws-sns", type.toLowerCase(), topic.toLowerCase()),
    };
  }

  return {
    title: `AWS SNS ${type || "message"}`,
    message: "",
    priority: null,
    tags: tags("aws-sns", type.toLowerCase()),
  };
}

export const awsSnsSource: AutoSource = {
  id: "aws-sns",
  detect: (body, headers) =>
    Boolean(headers["x-amz-sns-message-type"]) ||
    (SNS_TYPES.includes(str(body, "Type")) &&
      Boolean(str(body, "TopicArn")) &&
      Boolean(str(body, "MessageId"))),
  extract: (body) => awsSns(body),
};
