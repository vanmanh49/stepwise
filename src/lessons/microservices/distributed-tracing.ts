import { distributedTracingCode, distributedTracingSteps, SAMPLING, SLOW } from '../../microservices/scenarios/distributed-tracing';
import type { LessonContent } from '../../types/lesson';

const findSlow = { slow: 'payments', propagate: 'on', sampling: 'all', requests: '5' };

// The step where #3 reaches payments, which has just become slow.
const tracingRun = distributedTracingSteps(findSlow);
const slowStart = tracingRun[tracingRun.findIndex((s) => s.title === 'payments-1 starts on #3')]!;

const content: LessonContent = {
  overview:
    'One click on "my orders" can touch five services. When it is slow, which one is to blame? Each service\'s own logs only show its part. Distributed tracing gives every request a trace id, records a span for each piece of work, and links each span to the span that called it. Drawn as a waterfall, the trace shows where the time went. This lesson slows one service and looks for it, then breaks propagation and sampling to see what gets lost.',
  concept: [
    'A trace is the whole journey of one request. A span is one piece of it: a service handling the request, or a database query, with a start time and a length.',
    'Context propagation: each call carries the trace id and the caller\'s span id, usually in a traceparent header. The callee starts its span as a child, which builds the tree.',
    'Without propagation, each service starts a new trace. Every span is still recorded, but nothing links them, so you can\'t tell which request a slow query belonged to.',
    'Sampling keeps a fraction of traces to save cost. Head sampling decides at the edge, before anyone knows whether the request will be slow, so rare slow requests are easy to miss.',
  ],
  howItWorks: [
    'The client sends GET /orders every 60 ms. The gateway routes it to orders, which calls payments and inventory at the same time, and each queries its own database.',
    'Slow service makes payments or inventory take 200 ms per request from #3 on.',
    'The waterfall shows the trace of the request the step is about: one row per span, indented under its parent, its bar placed on the run\'s timeline. The span that spent the most time itself is highlighted.',
    'Propagate context off gives every span its own trace. Sampling 10% keeps a trace only when that request\'s seeded draw is under 0.1. "slowest span" names the highlighted span.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'slow', label: 'Slow service', type: 'choice', sample: findSlow.slow, options: [...SLOW], help: '200 ms per request from #3 on.' },
      { name: 'propagate', label: 'Propagate context', type: 'choice', sample: findSlow.propagate, options: ['off', 'on'] },
      { name: 'sampling', label: 'Sampling', type: 'choice', sample: findSlow.sampling, options: [...SAMPLING] },
      { name: 'requests', label: 'Requests', type: 'number', sample: findSlow.requests, help: 'From 1 to 5, one every 60 ms.' },
    ],
    presets: [
      { label: 'Find the slow service', values: findSlow },
      { label: 'No propagation', values: { ...findSlow, propagate: 'off' } },
      { label: '10 % sampling', values: { ...findSlow, sampling: '10%' } },
      { label: 'Nothing slow', values: { ...findSlow, slow: 'none' } },
    ],
    generate: distributedTracingSteps,
    codeLabel: 'Pseudocode',
  },
  code: distributedTracingCode,
  prosCons: {
    pros: ['Shows exactly which service and call made a request slow', 'Reveals the real call graph, including calls nobody documented', 'Links logs and errors from many services to one request'],
    cons: ['Every service must propagate the context, or the trace breaks', 'Recording every span costs storage, so most systems sample', 'Sampled traces can miss the rare slow or failing request'],
    useWhen: ['Requests cross several services and latency matters', 'You need to find which dependency causes errors or slowness'],
    avoidWhen: ['A single service with no downstream calls: its own logs and metrics are enough'],
  },
  applications: [
    'OpenTelemetry instrumentation sending spans to Jaeger, Zipkin or Grafana Tempo',
    'The W3C traceparent header passed between services',
    'Tail-based sampling that keeps every slow or failed trace',
  ],
  commonMistakes: [
    'Forgetting to pass the context on through queues and background jobs, which breaks the trace.',
    'Blaming the longest span: a parent is always longer than its children. Look for time a span spent itself.',
    'Sampling so little that the slow requests you care about are never kept.',
    'Starting a span but never ending it, which leaves it open forever.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'payments has just started on #3 and now takes 200 ms per request. How will its span compare to inventory\'s in #3\'s trace?',
      view: slowStart.view,
      options: ['Much longer, and orders\' span grows to cover it', 'About the same', 'Shorter, because it runs in parallel', 'It won\'t appear in the trace'],
      answer: 0,
      explanation: 'orders waits for both calls, so its span stretches to cover the slowest child. payments\' own work is where the time goes.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without context propagation, what do you lose?',
      options: ['The links between spans: each one is its own trace', 'All the spans', 'The span lengths', 'Nothing'],
      answer: 0,
      explanation: 'Spans are still recorded, but nothing says which request they belong to or who called them.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line passes the trace on to the next service?',
      code: "const span = tracer.startSpan(req.path, { parent })\nheaders.traceparent = span.context()\nspan.end()",
      options: ['headers.traceparent = span.context()', 'const span = tracer.startSpan(req.path, { parent })', 'span.end()', 'None of them'],
      answer: 0,
      explanation: 'The header carries the trace id and this span\'s id, so the callee can start a child span.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'With 10 % head sampling, why can the slowdown from #3 on leave no trace at all?',
      options: ['The keep-or-drop choice is made before anyone knows the request will be slow', 'Slow requests are never sampled', 'The tracer drops spans over 100 ms', 'Sampling only keeps the first two requests'],
      answer: 0,
      explanation: 'Head sampling decides at the edge, by chance. Here only #1 and #2 were kept, and both were fast.',
    },
  ],
  summary: [
    'A trace follows one request through every service; each piece of work is a span.',
    'Passing the trace context on each call links spans into one tree.',
    'Look for the span that spent the most time itself, not just the longest one.',
    'Sampling saves cost but can miss the requests you most want to see.',
  ],
};

export default content;
