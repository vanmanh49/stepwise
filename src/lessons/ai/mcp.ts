import { CALLS, mcpCode, mcpSteps, SERVER_NAMES } from '../../ai/scenarios/mcp';
import type { LessonContent } from '../../types/lesson';

const defaults = { server: 'office', call: 'call' };

// The tools are listed: the learner predicts the server's reply to bad arguments.
const listed = mcpSteps({ ...defaults, call: 'bad-args' })[2]!;

const content: LessonContent = {
  overview:
    'Every app used to wire up its tools in its own way. The Model Context Protocol (MCP) is a shared standard: a server publishes tools with names, descriptions and input schemas, and any MCP client can list and call them with JSON-RPC 2.0 messages. This lesson sends real-shaped MCP messages to a toy server, then lets an agent use whatever tools the server offers.',
  concept: [
    'A tool server answers JSON-RPC requests: tools/list returns each tool\'s input schema, and tools/call runs one.',
    'The 2026-07-28 revision is stateless: there is no initialize handshake, and every request carries its protocol version in _meta. A client may probe with server/discover. Older revisions opened each session with initialize.',
    'Protocol errors use JSON-RPC codes: -32601 for an unknown method, -32602 for an unknown tool or arguments that fail the schema.',
    'A tool that runs and fails returns a normal result marked isError, so the model can read it and try again. Real MCP runs over stdio or HTTP; here a function call stands in.',
  ],
  howItWorks: [
    'Optionally probe the server with server/discover.',
    'List its tools with tools/list.',
    'Call a tool with tools/call and its arguments.',
    'Read the result: content, an isError result, or a JSON-RPC error.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'server', label: 'Server', type: 'choice', sample: defaults.server, options: SERVER_NAMES, help: 'office: all 8 tools; weather: get_weather only.' },
      { name: 'call', label: 'Call', type: 'choice', sample: defaults.call, options: CALLS },
    ],
    presets: [
      { label: 'List tools', values: { ...defaults, call: 'list' } },
      { label: 'Call a tool', values: defaults },
      { label: 'Unknown method', values: { ...defaults, call: 'unknown-method' } },
      { label: 'Unknown tool', values: { ...defaults, call: 'unknown-tool' } },
      { label: 'Bad arguments', values: { ...defaults, call: 'bad-args' } },
      { label: 'Tool error', values: { ...defaults, call: 'tool-error' } },
      { label: 'Weather server', values: { server: 'weather', call: 'list' } },
    ],
    generate: mcpSteps,
    codeLabel: 'Pseudocode',
  },
  code: mcpCode,
  prosCons: {
    pros: ['Write a tool server once, and every MCP client can use it', 'Clients discover tools at run time from their schemas', 'Clear errors separate bad requests from failing tools'],
    cons: ['Another moving part: a server to run, secure and keep up to date', 'A tool description can be misleading, and the model will trust it', 'Agents depend on what the server chooses to offer'],
    useWhen: ['Sharing tools across apps and agents: files, databases, issue trackers, internal APIs'],
    avoidWhen: ['One app with one built-in function, where a protocol adds no value'],
  },
  applications: [
    'Coding assistants that connect to file, git and database servers',
    'Chat apps that add company tools without changing the app',
    'Agent frameworks that load tools from any MCP server',
  ],
  commonMistakes: [
    'Treating a tool failure as a protocol error, so the model never sees what went wrong.',
    'Connecting to an untrusted server: its tools and descriptions reach the model.',
    'Assuming the old initialize handshake: current clients send the protocol version on every request.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client now calls add with { "a": 17, "b": "twenty" }. What does the server reply?',
      view: listed.view,
      options: ['A JSON-RPC error -32602: the arguments fail the schema', 'A result with 37', 'A result marked isError', 'Error -32601: method not found'],
      answer: 0,
      explanation: 'b must be a number, so the request\'s parameters are invalid. The server rejects it before running the tool.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'get_weather for Mars ran but found no weather. How does MCP report that?',
      options: ['As a normal result marked isError', 'As error -32601', 'As error -32602', 'It returns nothing'],
      answer: 0,
      explanation: 'A tool that runs and fails returns isError, so the model can read the message and adjust.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Where does the client learn each tool\'s arguments?',
      code: "tools = send({ method: 'tools/list' }).tools   // names, descriptions, input schemas",
      options: ['From the input schemas tools/list returns', 'From the user', 'From the protocol version', 'It guesses them'],
      answer: 0,
      explanation: 'Each listed tool carries a JSON schema for its arguments.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Over the weather server, why didn\'t the agent email Sam?',
      options: ['The server never listed a send_email tool', 'Sam was not in the notes', 'The email failed', 'MCP forbids email'],
      answer: 0,
      explanation: 'An agent can only use the tools the server offers; it finished the comparison and said it could not email.',
    },
  ],
  summary: [
    'MCP lets any client list and call any server\'s tools over JSON-RPC.',
    'Tools carry input schemas; the current revision needs no handshake.',
    '-32601 is an unknown method, -32602 bad params; tool failures are isError results.',
    'An agent can only use the tools a server offers.',
  ],
};

export default content;
