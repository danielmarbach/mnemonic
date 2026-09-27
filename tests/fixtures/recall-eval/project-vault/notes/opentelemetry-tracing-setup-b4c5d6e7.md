---
title: OpenTelemetry tracing setup
tags:
  - observability
  - tracing
  - opentelemetry
lifecycle: permanent
createdAt: '2026-04-22T09:00:00.000Z'
updatedAt: '2026-08-15T10:00:00.000Z'
project: https-github-com-acme-alpha
projectName: alpha
---

Alpha exports traces over OTLP to the shared collector; HTTP, Postgres and RabbitMQ spans come from auto-instrumentation.

The exporter endpoint is configured with `otel-collector-endpoint` in the deployment values. Message publishing injects the trace context into AMQP headers so a consumer span links back to the order request. Sampling is parent-based with 10% head sampling for requests that arrive without a sampled parent. Tail sampling at the collector keeps every trace with an error.
