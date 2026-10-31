import { commandInjectionCode, commandInjectionSteps, DEFENSE_OPTIONS, FEATURE_OPTIONS } from '../../security/scenarios/command-injection';
import type { LessonContent } from '../../types/lesson';
import type { PanelsView } from '../../types/visualization';

const [PING, DOWNLOAD] = FEATURE_OPTIONS;
const [SHELL, BLOCKLIST, NO_SHELL] = DEFENSE_OPTIONS;
const defaults = { feature: PING!, input: '8.8.8.8; cat /app/.env', defense: SHELL! };
// Only the input's path: the wire panel of this step already shows the status.
const blocklisted = (commandInjectionSteps({ feature: DOWNLOAD!, input: '....//....//etc/passwd', defense: BLOCKLIST! }).at(-2)!.view as PanelsView).panels.find((panel) => panel.label === 'On the server')!;

const content: LessonContent = {
  overview:
    'Some apps pass user input to the operating system: a ping tool runs a command, and a download page opens a file. If the input is read as more than data, a small form becomes a way to run commands or read any file. Here you type into both, and a small fake shell over a fake filesystem shows what the server would really do. Nothing runs on your computer.',
  concept: [
    'A shell is a language. ; ends one command and starts another, && runs the next if the first worked, | feeds one command into another, and $(...) runs a command and pastes in its output. Any of these in the input changes what runs.',
    'So ping -c 1 8.8.8.8; cat /app/.env is two commands, not one odd host name. The second runs with the rights of the web app, which is often enough to read every secret it holds.',
    'Path traversal is the same mistake with file paths. Each .. goes up a folder, so ../../etc/passwd leaves the downloads folder. Joining strings can\'t see that. You have to work out the final path, then check it.',
    'Blocklists fail here too. Refusing ; and && leaves |. Stripping ../ once turns ....// back into ../, and a filter that runs before decoding never sees %2e%2e%2f at all.',
    'The fix for commands is to skip the shell. Pass the program and its arguments apart, so nothing parses the input, and check the input against the shape you expect. The fix for paths is to resolve first, then compare with the folder.',
    'A check that the input is a host name also stops a value that starts with a dash, which a program would read as an option. In production, use a library rather than a command where one exists, run the app as a user with few rights, and keep secrets out of files the app can reach. A symbolic link can still lead outside a folder, so real checks use the resolved path on disk.',
  ],
  howItWorks: [
    'The shop takes text from a form.',
    'With a shell string, it joins the text into one command line, and a shell parses all of it.',
    'With a file name, it joins the text onto a folder, and each .. climbs out.',
    'A blocklist removes some of the dangerous text, and misses the rest.',
    'With no shell, the text is one argument. With an allow-list, only known shapes get through.',
  ],
  visualization: {
    kind: 'form',
    fields: [
      { name: 'feature', label: 'Feature', type: 'choice', sample: defaults.feature, options: FEATURE_OPTIONS, help: 'Ping asks for a host. Download asks for a file name, such as invoice.txt.' },
      { name: 'input', label: 'Input', type: 'text', sample: defaults.input, help: '1 to 120 bytes. It goes straight into the fake server, so try your own.' },
      { name: 'defense', label: 'Defense', type: 'choice', sample: defaults.defense, options: DEFENSE_OPTIONS, help: 'How the shop handles the input.' },
    ],
    presets: [
      { label: 'A second command', values: defaults },
      { label: 'A pipe past the blocklist', values: { ...defaults, input: '8.8.8.8 | cat /app/.env', defense: BLOCKLIST! } },
      { label: 'Substitution', values: { ...defaults, input: '8.8.8.8 $(whoami)' } },
      { label: 'Leave the folder', values: { feature: DOWNLOAD!, input: '../../etc/passwd', defense: SHELL! } },
      { label: 'Encoded', values: { feature: DOWNLOAD!, input: '%2e%2e%2f%2e%2e%2fetc/passwd', defense: BLOCKLIST! } },
      { label: 'Strip once', values: { feature: DOWNLOAD!, input: '....//....//etc/passwd', defense: BLOCKLIST! } },
      { label: 'No shell', values: { ...defaults, defense: NO_SHELL! } },
    ],
    generate: commandInjectionSteps,
    codeLabel: 'Pseudocode',
  },
  code: commandInjectionCode,
  prosCons: {
    pros: ['Skipping the shell removes the whole class of bug', 'Resolving a path first needs only a few lines', 'An allow-list refuses what nobody thought of'],
    cons: ['One shell string is enough to run anything the app may run', 'An allow-list must be kept up to date', 'Paths can still escape through links on disk'],
    useWhen: ['Any time input reaches a program or a file path'],
    avoidWhen: ['Building a command line from strings', 'Filtering for dangerous characters instead of checking the shape'],
  },
  applications: [
    'Network tools in admin pages',
    'File downloads and image resizers',
    'Build and deploy dashboards that call command-line tools',
  ],
  commonMistakes: [
    'Removing ../ once and assuming none are left.',
    'Filtering before decoding, so the filter never sees the real text.',
    'Running the web app as a user who can read every secret on the machine.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The blocklist removed ../ once from ....//....//etc/passwd, and this is the path it left. Does the shop serve the file?',
      view: blocklisted.view,
      options: ['Yes: the page shows /etc/passwd', 'No: the blocklist removed every ../', 'No: the file is not in the fake filesystem', 'No: the request gets a 400'],
      answer: 0,
      explanation: 'Removing the inner ../ joins the outer dots and slashes into a new ../, so the path still climbs out of the folder.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Why does passing arguments with no shell stop command injection?',
      options: ['Nothing parses the text, so ; and | are only characters', 'It runs the command faster', 'It removes the dangerous characters', 'It runs as another user'],
      answer: 0,
      explanation: 'Those characters only mean something to a shell.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'What is wrong with this check?',
      code: "if (file.includes('../')) return 403\nreturn read(join(root, decode(file)))",
      options: ['It runs before decoding, so %2e%2e%2f gets past it', 'It blocks every file', 'join can\'t take two strings', 'Nothing'],
      answer: 0,
      explanation: 'Check the final path, after decoding and resolving, never the raw input.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Which of these runs a second command in a shell?',
      options: ['8.8.8.8 | cat /app/.env', '8.8.8.8', 'www.example.com', 'host-1.example'],
      answer: 0,
      explanation: 'A pipe starts a second command. The others are one word, with no shell syntax in them.',
    },
  ],
  summary: [
    'A shell parses text, so input can add commands.',
    '.. climbs out of a folder that a joined string can\'t see.',
    'Blocklists miss |, encodings and ....//.',
    'Pass arguments with no shell, and allow only known shapes.',
    'Resolve the path first, then check it is still inside.',
  ],
};

export default content;
