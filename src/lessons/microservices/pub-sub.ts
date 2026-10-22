import { pubSubCode, pubSubSteps } from '../../microservices/scenarios/pub-sub';
import type { LessonContent } from '../../types/lesson';

const topic = { subscribers: '3', mode: 'topic', emailDown: 'off', orders: '3' };

// The step just before the broker stores the first event: orders has published, nobody has a copy yet.
const topicSteps = pubSubSteps(topic);
const beforeStore = topicSteps[topicSteps.findIndex((s) => s.title.startsWith('The broker stores #1')) - 1]!;

const content: LessonContent = {
  overview:
    'When an order is placed, several parts of a shop care: email sends a receipt, stock reserves the items, analytics counts the sale. If orders called each of them, it would have to know them all, wait for them all, and fail when any one is down. With publish/subscribe, orders announces one event, OrderPlaced, and every interested service gets its own copy. This lesson publishes orders to three subscribers, takes email down, and compares a topic with a plain queue.',
  concept: [
    'An event says that something happened, such as "order #3 was placed". The publisher does not say who should react, or how.',
    'Each subscriber has its own queue on the topic, and every event is copied into every queue. Subscribers work at their own pace and never block each other.',
    'Adding a subscriber needs no change to the publisher. orders publishes the same event whether one service listens or ten.',
    'A plain queue is different: each message goes to one consumer. Use a queue to share work, and a topic to tell everyone.',
  ],
  howItWorks: [
    'The client sends POST /orders every 40 ms. orders saves the order, publishes OrderPlaced to the events broker, and answers once the event is stored.',
    'In topic mode the broker keeps one queue per subscriber: email, stock and analytics. Each takes 30 ms per event.',
    'With email down, email refuses connections from 20 ms to 300 ms. Its copies wait in its own queue.',
    'In queue mode the three subscribers share one queue, so each event reaches only one of them.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'subscribers', label: 'Subscribers', type: 'number', sample: topic.subscribers, help: 'From 1 to 3: email, then stock, then analytics.' },
      { name: 'mode', label: 'Mode', type: 'choice', sample: topic.mode, options: ['topic', 'queue'] },
      { name: 'emailDown', label: 'Email down', type: 'choice', sample: topic.emailDown, options: ['off', 'on'], help: 'From 20 ms to 300 ms.' },
      { name: 'orders', label: 'Orders', type: 'number', sample: topic.orders, help: 'From 1 to 5, one every 40 ms.' },
    ],
    presets: [
      { label: 'Every subscriber gets a copy', values: topic },
      { label: 'Email is down', values: { ...topic, emailDown: 'on' } },
      { label: 'Only email subscribes', values: { ...topic, subscribers: '1' } },
      { label: 'Queue instead of topic', values: { ...topic, mode: 'queue' } },
    ],
    generate: pubSubSteps,
    codeLabel: 'Pseudocode',
  },
  code: pubSubCode,
  prosCons: {
    pros: ['The publisher does not know or wait for its subscribers', 'New subscribers join without changing the publisher', 'A subscriber that is down catches up later without holding up the others'],
    cons: ['Nobody sees the whole flow in one place, which makes it harder to follow', 'Subscribers can see events late, so data is only eventually consistent', 'Events become a contract: changing their shape can break subscribers'],
    useWhen: ['Several services react to the same thing happening', 'The publisher should not depend on who reacts'],
    avoidWhen: ['The caller needs an answer from one specific service before it can continue'],
  },
  applications: [
    'Apache Kafka topics, Amazon SNS and Google Pub/Sub',
    'Order, payment and shipping events in online shops',
    'Updating search indexes and caches when data changes',
  ],
  commonMistakes: [
    'Using a queue when every service needs the event, so each one sees only some of them.',
    'Putting commands ("send this email") in events instead of facts ("order placed").',
    'Changing an event\'s fields without checking who subscribes to it.',
    'Assuming subscribers have processed an event as soon as it is published.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'orders has published OrderPlaced for #1 to the events broker. Three services subscribe. What does the broker do with it?',
      view: beforeStore.view,
      options: ['Stores a copy in each subscriber\'s queue', 'Sends it to one subscriber chosen at random', 'Waits until all three subscribers have handled it before storing it', 'Sends it back to orders'],
      answer: 0,
      explanation: 'A topic copies every event into every subscriber\'s queue, so email, stock and analytics each get #1.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Email is down for 280 ms. What happens to the time orders takes to answer the customer?',
      options: ['Nothing: orders only waits for the broker to store the event', 'It grows by 280 ms', 'Orders fail until email is back', 'It halves, because email does nothing'],
      answer: 0,
      explanation: 'orders answers as soon as the event is stored. Email\'s copies wait in its own queue, and it catches up after it recovers.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line gives every subscriber its own copy?',
      code: 'function onPublish(event) {\n  for (const queue of subscribers) queue.push(event)\n}',
      options: ['for (const queue of subscribers) queue.push(event)', 'function onPublish(event) {', 'None: subscribers share one copy', 'publish(event)'],
      answer: 0,
      explanation: 'The broker pushes the event into each subscriber\'s queue, so each one reads it independently.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'In queue mode, 3 orders are placed with 3 subscribers. How many deliveries are there?',
      options: ['3: each event goes to one of the subscribers', '9: one per subscriber per order', '1: only the first event', '0: queues do not deliver'],
      answer: 0,
      explanation: 'A queue gives each message to one consumer. That is right for sharing work, but wrong when every service needs to know.',
    },
  ],
  summary: [
    'An event announces that something happened, without naming who reacts.',
    'A topic gives every subscriber its own copy in its own queue.',
    'The publisher stays fast and unchanged when subscribers fail or are added.',
    'A queue shares work: each message reaches only one consumer.',
  ],
};

export default content;
