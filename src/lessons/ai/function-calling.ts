import { functionCallingCode, functionCallingSteps, REQUEST_IDS, TOOL_CHOICES } from '../../ai/scenarios/function-calling';
import type { LessonContent } from '../../types/lesson';

const defaults = { request: 'weather-paris', tools: 'all' };

// The model has asked for add with a string argument; the learner predicts what the check does.
const called = functionCallingSteps({ ...defaults, request: 'add-words' })[2]!;

const content: LessonContent = {
  overview:
    'A model can only write text, but many questions need live data or exact work: today\'s weather, a sum, a database lookup. Function calling lets the model ask your code to run a tool and then answer from the result. This lesson walks through one tool call with a rule-based stand-in as the model and two toy tools.',
  concept: [
    'Each tool is described to the model by a name, a description and a schema for its parameters.',
    'When a tool would help, the model writes a tool call: the tool\'s name and JSON arguments. It does not run anything itself.',
    'Your code checks the arguments against the schema, runs the tool, and sends the result back as a tool message.',
    'The model then writes the answer from the result. Real models learn when and how to call tools in training; the stand-in follows fixed rules, and the weather data is made up.',
  ],
  howItWorks: [
    'Send the user\'s request along with the tool descriptions.',
    'If the model replies with a tool call, check its arguments.',
    'Run the tool (or report the error) and add the result to the messages.',
    'Ask the model again; it answers from the result.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'request', label: 'Request', type: 'choice', sample: defaults.request, options: REQUEST_IDS, help: 'weather in Paris or on Mars, 17 + 25, 17 + "twenty", or hello.' },
      { name: 'tools', label: 'Tools offered', type: 'choice', sample: defaults.tools, options: TOOL_CHOICES },
    ],
    presets: [
      { label: 'Weather', values: defaults },
      { label: 'Add', values: { ...defaults, request: 'add' } },
      { label: 'No tool needed', values: { ...defaults, request: 'hello' } },
      { label: 'Unknown city', values: { ...defaults, request: 'weather-mars' } },
      { label: 'Bad arguments', values: { ...defaults, request: 'add-words' } },
      { label: 'No tools offered', values: { ...defaults, tools: 'none' } },
    ],
    generate: functionCallingSteps,
    codeLabel: 'Pseudocode',
  },
  code: functionCallingCode,
  prosCons: {
    pros: ['The model can use live data and exact computation', 'Your code stays in control: it decides what actually runs', 'One model can drive many tools by their descriptions'],
    cons: ['Every tool call is an extra round trip', 'Models sometimes pick the wrong tool or write bad arguments', 'A tool that changes things (sends, pays, deletes) needs care, since the model chose to call it'],
    useWhen: ['Questions that need fresh data, exact answers, or actions in other systems'],
    avoidWhen: ['Anything the model can answer from the prompt alone, where a tool only adds delay'],
  },
  applications: [
    'Assistants that check the weather, a calendar or an order status',
    'Coding agents that run tests and read files through tools',
    'Protocols such as MCP that let any app offer tools to a model (phase 3)',
  ],
  commonMistakes: [
    'Running tool arguments without checking them: the model can write a string where a number belongs.',
    'Thinking the model runs the tool: your code does, and decides whether it should.',
    'Not sending tool errors back, so the model invents a result.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The model asked for add({"a":17,"b":"twenty"}). What should your code do next?',
      view: called.view,
      options: ['Reject it: b must be a number', 'Run it and return 37', 'Run it and return "17twenty"', 'Ignore the call'],
      answer: 0,
      explanation: 'The schema says b is a number. The check fails, the tool does not run, and the error goes back to the model.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Who runs the tool?',
      options: ['Your code, after checking the call', 'The model, inside its weights', 'The user', 'Nobody: the model guesses the result'],
      answer: 0,
      explanation: 'The model only writes a structured request; your code decides whether and how to run it.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Why does this line send the result back to the model?',
      code: 'messages.push(assistant(out.toolCall), tool(result))',
      options: ['So the model can write the answer from it', 'To retrain the model', 'To delete the tool call', 'It is only for logging'],
      answer: 0,
      explanation: 'The next model call sees the tool message and turns the raw result into a reply.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'The weather tool returns "No weather for Mars". What should the final answer do?',
      options: ['Explain the error', 'Make up a forecast', 'Call the tool forever', 'Return nothing'],
      answer: 0,
      explanation: 'Passing the error back lets the model tell the user what went wrong instead of inventing data.',
    },
  ],
  summary: [
    'Tools are described to the model by name, description and parameter schema.',
    'The model writes a tool call; your code checks and runs it.',
    'The result goes back as a tool message, and the model answers from it.',
    'Always check arguments and pass errors back.',
  ],
};

export default content;
