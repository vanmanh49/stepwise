import { slidingWindowCode, slidingWindowSteps } from '../../algorithms/techniques/slidingWindow';
import type { LessonContent } from '../../types/lesson';

const content: LessonContent = {
  overview:
    'A sliding window looks at a run of neighbouring values and moves along the list one position at a time. Because two neighbouring windows share almost all of their values, the result for the next window can be updated from the previous one instead of being recalculated. This lesson finds the k neighbouring values with the largest sum.',
  concept: [
    'Suppose you want the best 3-day sales total in a year of daily figures. The direct approach adds up days 1–3, then days 2–4, then days 3–5, and so on. Each total is computed from scratch even though days 2 and 3 were just added a moment ago.',
    'Picture a window frame laid over the list. Sliding it one step right lets one new value in on the right and pushes one old value out on the left. So the new total is the old total, plus the value that entered, minus the value that left.',
    'That update costs two operations whether the window is 3 wide or 3,000 wide. The whole scan becomes a single pass.',
    'This lesson uses a fixed-size window. A variable-size window, which grows and shrinks to satisfy a condition, uses the same idea and solves problems such as "shortest run that adds up to at least 100".',
  ],
  howItWorks: [
    'Add up the first k values. This is the first window, and the best sum so far.',
    'Slide one position right: add the value that enters and subtract the value that leaves.',
    'If the new sum beats the best so far, remember it.',
    'Repeat until the window reaches the end of the list.',
    'Return the best sum.',
  ],
  visualization: {
    kind: 'search',
    initial: [2, 1, 5, 1, 3, 2, 6, 1],
    target: 3,
    needsSorted: false,
    targetLabel: 'Window size k',
    targetHelp: '1–12 whole numbers, separated by commas, and a window size from 1 to the length of the list.',
    randomTarget: (values) => Math.min(3, values.length),
    generate: slidingWindowSteps,
  },
  code: slidingWindowCode,
  prosCons: {
    pros: ['One pass over the data', 'Cost does not depend on the window size', 'No extra memory'],
    cons: ['Only works on runs of neighbouring values, not arbitrary selections', 'The update rule must be reversible: removing a value has to be as easy as adding one'],
    useWhen: ['You need the best, worst or average over every run of k neighbours', 'The question is about a contiguous stretch of a list or string'],
    avoidWhen: ['The values you want are not next to each other', 'You need many range sums of different sizes (use prefix sums)'],
  },
  applications: [
    'Moving averages in stock charts and sensor readings',
    'Rate limiting: how many requests arrived in the last 60 seconds',
    'Finding the longest stretch of a string without repeated characters',
    'Network protocols such as TCP, which send data in a sliding window',
  ],
  commonMistakes: [
    'Recomputing the whole window sum on every slide, which throws away the benefit.',
    'Off-by-one errors: the value leaving is at index i − k, not i − k + 1.',
    'Not handling a window larger than the list.',
    'Starting the best sum at 0, which is wrong when every value is negative. Start with the first window.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The window size is 3 and the first window (2, 1, 5) sums to 8. The window slides one step right. What is the new sum?',
      view: slidingWindowSteps([2, 1, 5, 1, 3, 2, 6, 1], 3)[3]!.view,
      options: ['7', '9', '8', '10'],
      answer: 0,
      explanation: 'The value 1 enters and the value 2 leaves: 8 + 1 − 2 = 7. Nothing else in the window changed.',
    },
    {
      id: 'q2',
      type: 'complexity',
      prompt: 'What is the time complexity of finding the best window of size k in a list of n values with a sliding window?',
      options: ['O(n)', 'O(n × k)', 'O(k)', 'O(n²)'],
      answer: 0,
      explanation: 'Every slide costs one addition and one subtraction regardless of k, and there are fewer than n slides.',
    },
    {
      id: 'q3',
      type: 'multiple-choice',
      prompt: 'What makes the sliding window faster than adding up every window separately?',
      options: [
        'It reuses the previous sum and only accounts for the value entering and the value leaving',
        'It skips every other window',
        'It sorts the list first',
        'It only checks windows that contain the largest value',
      ],
      answer: 0,
      explanation: 'Neighbouring windows overlap in k − 1 values, so only the two values at the edges need any work.',
    },
    {
      id: 'q4',
      type: 'code',
      prompt: 'What does this return?',
      code: `maxWindowSum([4, 2, 1, 7, 8], 2);`,
      options: ['15', '8', '9', '22'],
      answer: 0,
      explanation: 'The windows of size 2 sum to 6, 3, 8 and 15. The largest is 7 + 8 = 15.',
    },
  ],
  summary: [
    'A sliding window moves across neighbouring values one position at a time.',
    'Update the result with the value entering and the value leaving, instead of recomputing.',
    'The scan is O(n) no matter how wide the window is.',
    'It applies to contiguous runs only.',
  ],
};

export default content;
