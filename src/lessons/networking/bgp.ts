import { bgpCode, bgpSteps, SCENES } from '../../networking/scenarios/bgp';
import type { LessonContent } from '../../types/lesson';

const defaults = { scene: SCENES[0]! };
const update = bgpSteps(defaults).find((step) => step.title.startsWith('AS 65010 picks 65001'))!;

const content: LessonContent = {
  overview:
    'The internet is about 75,000 networks run by different companies, none of them in charge. Each is an autonomous system, with a number. BGP is how they tell each other what they can reach. This lesson runs a real path-vector exchange between six ASes, with their business rules, and sends a probe along the routes they choose.',
  concept: [
    'An AS announces its networks to its neighbours. Each neighbour adds its own number to the front of AS_PATH and passes the route on. So every AS learns not a distance but the whole list of networks a route goes through.',
    'If a route arrives holding an AS\'s own number, it would make a loop, so it is rejected. That one rule keeps the whole internet loop-free, with nobody having a map of it.',
    'Best path is not shortest path. Money comes first: a route from a customer pays, a peer\'s is free, and a provider\'s costs money. So local preference is 200, 150 and 100 here. Only then comes the shortest AS_PATH, and after that the lowest neighbour AS.',
    'Export rules follow the money too. A customer\'s routes go to everyone, because carrying them earns money. A route from a peer or a provider goes to customers only, because nobody carries traffic between two others for free.',
    'When a route fails, the AS chooses again. It sends a WITHDRAW to a neighbour it can no longer offer anything, and an UPDATE with the new path to the rest, and they choose again from all they have heard. Prepending is a request: an AS adds its number extra times so a path looks longer. And because traffic always follows the longest matching prefix, anyone who announces a more specific prefix can take the traffic. That is a BGP hijack, and only RPKI and careful filters stop it.',
    'The numbers are round on purpose: six ASes, private AS numbers and a 5 ms link. Real BGP runs over TCP port 179 with keepalives and a hold timer, and here a command stands in for that timer and messages cross links directly. iBGP, route reflectors, communities and RPKI are left out. To see this on a real machine, run traceroute and then look up a prefix on a public looking glass.',
  ],
  howItWorks: [
    'Origin announces its prefix to its neighbours.',
    'Each AS adds its number to AS_PATH and passes on its best route.',
    'A path holding this AS is rejected, so loops can\'t form.',
    'Best is highest local preference, then shortest path, then lowest neighbour AS.',
    'Traffic follows the longest matching prefix, hop by hop.',
  ],
  visualization: {
    kind: 'form',
    fields: [{ name: 'scene', label: 'Scene', type: 'choice', sample: defaults.scene, options: SCENES }],
    presets: SCENES.map((scene) => ({ label: scene, values: { scene } })),
    generate: bgpSteps,
    codeLabel: 'Pseudocode',
  },
  code: bgpCode,
  prosCons: {
    pros: ['No central authority or global map', 'Each network sets its own policy', 'Routes around failures on its own'],
    cons: ['Trusts what neighbours announce', 'Can take minutes to settle after a change', 'Best path follows money, not speed'],
    useWhen: ['Connecting networks run by different organisations'],
    avoidWhen: ['Inside one network, where OSPF or IS-IS converge faster'],
  },
  applications: [
    'Every ISP and large cloud announces its prefixes with BGP',
    'Anycast services announce one prefix from many places',
    'Companies with two ISPs use it to survive an outage',
  ],
  commonMistakes: [
    'Thinking BGP finds the fastest path. It knows nothing about speed.',
    'Assuming prepending always works. Local preference comes first.',
    'Believing an announced route is authorised. Without RPKI, anyone can claim a prefix.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'Transit A has chosen its route to Origin. When it tells the ISP, what will AS_PATH begin with?',
      view: update.view,
      options: ['65010', '65200', '65001', '65020'],
      answer: 0,
      explanation: 'The newest number goes on the front, and that is Transit A, AS 65010.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'A customer offers a 4-AS path, and a peer offers a 2-AS path. Which wins?',
      options: ['The customer, on local preference', 'The peer, on path length', 'Whichever arrived first', 'Both, sharing the traffic'],
      answer: 0,
      explanation: 'Local preference is checked before path length, and a customer pays.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line stops routing loops?',
      options: ['if the path holds this AS: reject it', 'best = highest local preference', 'anyone else\'s goes to customers only', 'follow the longest matching prefix'],
      answer: 0,
      explanation: 'A path holding your own number has already been through you.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does a hijacker\'s /25 beat the owner\'s /24?',
      options: ['Traffic follows the longest matching prefix', 'Its AS_PATH is shorter', 'It was announced later', 'A /25 costs less to carry'],
      answer: 0,
      explanation: 'Longest prefix comes before any BGP choice, because the two are different routes.',
    },
  ],
  summary: [
    'BGP passes whole paths between autonomous systems.',
    'A path holding your own AS is rejected, so loops can\'t form.',
    'Business comes first: local preference, then path length.',
    'The longest prefix wins, so a more specific route can steal traffic.',
  ],
};

export default content;
