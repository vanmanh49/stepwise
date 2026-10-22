import { messageQueuesCode, messageQueuesDrainTime, messageQueuesSteps } from '../../microservices/scenarios/message-queues';
import type { LessonContent } from '../../types/lesson';

const direct = { style: 'sync', workers: '1', jobs: '6', outage: 'on' };
const queued = { ...direct, style: 'queue' };

// The step just before the worker comes back: jobs are piled up in the queue, waiting.
const queuedSteps = messageQueuesSteps(queued);
const beforeBack = queuedSteps[queuedSteps.findIndex((s) => s.title === 'worker is back') - 1]!;

// When the last job is done with one worker and with three, read from the runs.
const oneWorker = messageQueuesDrainTime({ ...queued, outage: 'off' });
const threeWorkers = messageQueuesDrainTime({ ...queued, outage: 'off', workers: '3' });

const content: LessonContent = {
  overview:
    'Some work does not need an answer straight away: resizing an image, sending an email, writing a report. Calling the worker directly means the caller waits, and fails if the worker is down. A message queue sits in between: the producer hands the job over and moves on, and workers take jobs from the queue when they can. This lesson sends image-resize jobs to a worker that is down for a while, directly and through a queue.',
  concept: [
    'With a direct call, the caller and the worker must both be up at the same moment. If the worker is down, the call fails and the job is lost unless the caller tries again.',
    'With a queue, the broker stores the job and answers "stored" at once. The producer is done in milliseconds, whatever the worker is doing.',
    'Workers take one job at a time and ack it when it is done. If a delivery fails, the broker puts the job back and tries again later, so a job is not lost when a worker is down. That is at-least-once delivery.',
    'A queue also smooths bursts: jobs wait their turn. Adding workers (competing consumers) drains the queue faster, and each job still goes to exactly one worker.',
  ],
  howItWorks: [
    'The client sends POST /resize every 20 ms. A worker takes 60 ms per job, so jobs arrive faster than one worker can finish them.',
    'Style sync calls the worker directly. Style queue sends each job to the jobs broker, which stores it and hands it to a free worker instance.',
    'With the outage on, the worker refuses connections from 30 ms to 230 ms. The broker retries a failed delivery after 50 ms.',
    'In the table, each job has a row for the client\'s request and one for its delivery from the queue. "waiting" counts the jobs stored but not yet handed out.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'style', label: 'Style', type: 'choice', sample: direct.style, options: ['sync', 'queue'] },
      { name: 'workers', label: 'Workers', type: 'number', sample: direct.workers, help: 'Worker instances, from 1 to 3.' },
      { name: 'jobs', label: 'Jobs', type: 'number', sample: direct.jobs, help: 'From 1 to 10, one every 20 ms.' },
      { name: 'outage', label: 'Worker outage', type: 'choice', sample: direct.outage, options: ['off', 'on'], help: 'The worker is down from 30 ms to 230 ms.' },
    ],
    presets: [
      { label: 'Direct call, worker down', values: direct },
      { label: 'Queue, worker down', values: queued },
      { label: 'Queue, one worker', values: { ...queued, outage: 'off' } },
      { label: 'Queue, three workers', values: { ...queued, outage: 'off', workers: '3' } },
    ],
    generate: messageQueuesSteps,
    codeLabel: 'Pseudocode',
  },
  code: messageQueuesCode,
  prosCons: {
    pros: ['The producer is done as soon as the job is stored', 'Jobs survive a worker outage and are processed later', 'Bursts wait in the queue, and more workers drain it faster'],
    cons: ['The producer does not get the result straight away', 'A job may be processed more than once after a redelivery', 'The broker is one more system to run and watch'],
    useWhen: ['The work can finish later: emails, images, reports, imports', 'Producers and workers run at different speeds or fail at different times'],
    avoidWhen: ['The caller needs the result to answer its own request right now'],
  },
  applications: [
    'RabbitMQ, Amazon SQS and Google Pub/Sub work queues',
    'Background jobs in web apps, such as sending sign-up emails',
    'Video and image processing pipelines',
  ],
  commonMistakes: [
    'Assuming each job is processed exactly once: after a redelivery it can run twice.',
    'Acking a job before the work is done, so a crash loses it.',
    'Letting the queue grow without limit and never noticing the workers are behind.',
    'Using a queue when the caller really needs the answer straight away.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Jobs are waiting in the queue while the worker is down. What happens to them when the worker comes back at 230 ms?',
      view: beforeBack.view,
      options: ['The broker hands them to the worker one at a time, oldest first', 'They are lost, because the worker was down', 'The client must send them again', 'They all go to the worker at once'],
      answer: 0,
      explanation: 'The broker kept every job. Once the worker answers again, it gets the oldest job, and the next one after it acks.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'With the queue, how long does the client wait for each job while the worker is down?',
      options: ['About 12 ms: only until the broker stores it', 'Until the worker comes back', 'The full 60 ms of work', 'Forever: the job fails'],
      answer: 0,
      explanation: 'The broker answers "stored" 12 ms after the job is sent (5 ms there, 2 ms to store, 5 ms back). The worker\'s outage does not touch the producer.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes sure a job is not lost when the worker fails?',
      code: 'try {\n  await resize(job)\n  ack(job)\n} catch (err) {\n  queue.unshift(job)\n}',
      options: ['queue.unshift(job)', 'ack(job)', 'await resize(job)', 'None: failed jobs are dropped'],
      answer: 0,
      explanation: 'A failed job goes back to the front of the queue, so it will be delivered again.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'One worker takes 60 ms per job, and a job arrives every 20 ms. What does a second and third worker change?',
      options: ['Each job still goes to one worker, and the queue drains sooner', 'Every worker processes every job', 'Jobs are stored faster', 'Nothing: the queue sends to one worker only'],
      answer: 0,
      explanation: `Workers compete for jobs, and each job goes to exactly one free worker. In this run the last job is done at ${threeWorkers} ms with three workers, instead of ${oneWorker} ms with one.`,
    },
  ],
  summary: [
    'A queue lets the producer hand work over and move on.',
    'Stored jobs survive a worker outage and are processed when it returns.',
    'Failed deliveries go back in the queue, so a job may run more than once.',
    'More workers drain the queue faster; each job goes to one worker.',
  ],
};

export default content;
