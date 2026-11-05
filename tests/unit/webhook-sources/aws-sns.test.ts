import { describe, it, expect } from "vitest";
import { awsSnsSource } from "@/lib/webhook-extract/sources/aws-sns";

const TOPIC = "arn:aws:sns:us-east-1:123456789012:orders-prod";
const SNS_HEADERS = { "x-amz-sns-message-type": "Notification" };

const subscriptionConfirmation = {
  Type: "SubscriptionConfirmation",
  MessageId: "165545c9-2a5c-472c-8df2-7ff2be2b3b1b",
  Token: "2336412f37fb687f5d51e6e241d09c805a5a57b30d712f794eca2b4f1a4a6e5d",
  TopicArn: TOPIC,
  Message:
    "You have chosen to subscribe to the topic " +
    TOPIC +
    ".\nTo confirm the subscription, visit the SubscribeURL included in this message.",
  SubscribeURL:
    "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&TopicArn=arn:aws:sns:us-east-1:123456789012:orders-prod&Token=abc123",
  Timestamp: "2026-11-05T10:00:00.000Z",
  SignatureVersion: "1",
  Signature: "EXAMPLE",
  SigningCertURL: "https://sns.us-east-1.amazonaws.com/cert.pem",
};

const plainNotification = {
  Type: "Notification",
  MessageId: "22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324",
  TopicArn: TOPIC,
  Subject: "Order shipped",
  Message: "Order 1001 shipped to alice@example.com",
  Timestamp: "2026-11-05T10:05:00.000Z",
  UnsubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=Unsubscribe",
};

const alarmNotification = (state: string, reason = "Threshold Crossed: 1 datapoint") => ({
  Type: "Notification",
  MessageId: "33c91c03-0000-4000-8000-000000000001",
  TopicArn: "arn:aws:sns:eu-west-1:123456789012:ops-alerts",
  Subject: 'ALARM: "api-5xx" in EU (Ireland)',
  Message: JSON.stringify({
    AlarmName: "api-5xx",
    AlarmDescription: "5xx rate too high",
    NewStateValue: state,
    NewStateReason: reason,
    Region: "EU (Ireland)",
    AWSAccountId: "123456789012",
  }),
  Timestamp: "2026-11-05T10:10:00.000Z",
});

const unsubscribeConfirmation = {
  Type: "UnsubscribeConfirmation",
  MessageId: "44d02d14-0000-4000-8000-000000000002",
  Token: "9f8e7d",
  TopicArn: TOPIC,
  Message: "You have chosen to deactivate subscription arn:aws:sns:us-east-1:123456789012:orders-prod:abc.",
  SubscribeURL: "https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription&Token=9f8e7d",
  Timestamp: "2026-11-05T11:00:00.000Z",
};

describe("awsSnsSource", () => {
  describe("detect", () => {
    it("matches by x-amz-sns-message-type header", () => {
      expect(awsSnsSource.detect({}, SNS_HEADERS)).toBe(true);
    });

    it("matches by Type + TopicArn + MessageId shape", () => {
      expect(awsSnsSource.detect(plainNotification, {})).toBe(true);
      expect(awsSnsSource.detect(subscriptionConfirmation, {})).toBe(true);
      expect(awsSnsSource.detect(unsubscribeConfirmation, {})).toBe(true);
    });

    it("does not match a generic title/message payload", () => {
      expect(awsSnsSource.detect({ title: "Hi", message: "Yo" }, {})).toBe(false);
    });

    it("does not match a GitHub-like payload", () => {
      expect(
        awsSnsSource.detect({ action: "opened", repository: { full_name: "a/b" } }, {})
      ).toBe(false);
    });
  });

  describe("extract", () => {
    it("asks to confirm a subscription with the SubscribeURL, priority 4", () => {
      expect(awsSnsSource.extract(subscriptionConfirmation, SNS_HEADERS)).toEqual({
        title: "Confirm AWS SNS subscription for orders-prod",
        message: [
          subscriptionConfirmation.Message,
          subscriptionConfirmation.SubscribeURL,
        ].join("\n"),
        priority: 4,
        tags: ["aws-sns", "subscriptionconfirmation", "orders-prod"],
      });
    });

    it("uses the Subject as title for a plain notification", () => {
      expect(awsSnsSource.extract(plainNotification, SNS_HEADERS)).toEqual({
        title: "Order shipped",
        message: "Order 1001 shipped to alice@example.com",
        priority: null,
        tags: ["aws-sns", "notification", "orders-prod"],
      });
    });

    it("falls back to the topic name when there is no Subject", () => {
      const result = awsSnsSource.extract({ ...plainNotification, Subject: undefined }, SNS_HEADERS);
      expect(result.title).toBe("orders-prod");
    });

    it("formats a CloudWatch alarm entering ALARM as priority 4", () => {
      const result = awsSnsSource.extract(alarmNotification("ALARM"), SNS_HEADERS);
      expect(result).toEqual({
        title: "api-5xx is ALARM",
        message: "Threshold Crossed: 1 datapoint\nRegion: EU (Ireland)",
        priority: 4,
        tags: ["aws-sns", "notification", "cloudwatch-alarm", "alarm", "ops-alerts"],
      });
    });

    it("formats a CloudWatch alarm recovering to OK as priority 2", () => {
      const result = awsSnsSource.extract(
        alarmNotification("OK", "Threshold no longer crossed"),
        SNS_HEADERS
      );
      expect(result.title).toBe("api-5xx is OK");
      expect(result.message).toBe("Threshold no longer crossed\nRegion: EU (Ireland)");
      expect(result.priority).toBe(2);
    });

    it("formats INSUFFICIENT_DATA alarms with no priority", () => {
      const result = awsSnsSource.extract(alarmNotification("INSUFFICIENT_DATA"), SNS_HEADERS);
      expect(result.title).toBe("api-5xx is INSUFFICIENT_DATA");
      expect(result.priority).toBeNull();
    });

    it("treats a non-JSON Message as a plain notification", () => {
      const result = awsSnsSource.extract(
        { ...plainNotification, Subject: undefined, Message: "{not json" },
        SNS_HEADERS
      );
      expect(result.title).toBe("orders-prod");
      expect(result.message).toBe("{not json");
      expect(result.priority).toBeNull();
    });

    it("describes an unsubscribe confirmation as info", () => {
      expect(awsSnsSource.extract(unsubscribeConfirmation, SNS_HEADERS)).toEqual({
        title: "AWS SNS subscription removed for orders-prod",
        message: unsubscribeConfirmation.Message,
        priority: null,
        tags: ["aws-sns", "unsubscribeconfirmation", "orders-prod"],
      });
    });

    it("uses a generic title for an unknown Type", () => {
      const result = awsSnsSource.extract({ Type: "Mystery", TopicArn: TOPIC }, SNS_HEADERS);
      expect(result.title).toBe("AWS SNS Mystery");
      expect(result.priority).toBeNull();
    });

    it("does not throw on malformed payloads", () => {
      const malformed: unknown[] = [
        {},
        { Type: 42, TopicArn: null, Message: { nested: true } },
        { Type: "Notification", TopicArn: TOPIC, Message: '"just a string"' },
        { Type: "Notification", TopicArn: TOPIC, Message: "null" },
        { Type: "Notification", TopicArn: TOPIC, Message: '{"AlarmName":"x","NewStateValue":5}' },
        { Type: "SubscriptionConfirmation", SubscribeURL: ["not", "a", "string"] },
      ];
      for (const body of malformed) {
        expect(() => awsSnsSource.extract(body as Record<string, unknown>, {})).not.toThrow();
      }
      const result = awsSnsSource.extract({ Type: 42, Message: { nested: true } }, {});
      expect(result.title).toBe("AWS SNS message");
      expect(result.title).not.toContain("undefined");
    });
  });
});
