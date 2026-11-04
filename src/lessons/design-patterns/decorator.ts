import { decoratorLesson as lesson } from '../../patterns/decorator/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', layers: 'Logging + Compression' });
const logged = steps.findIndex((step) => step.title.startsWith('client calls LoggingSink#1.write('));

const content: LessonContent = {
  overview:
    'Extra behaviour such as logging, compression or encryption often needs to be switched on in any mix. The Decorator pattern wraps an object in layers that share its methods, so you stack only the layers you want. This lesson writes 24 bytes to a file through those layers, then adds encryption.',
  concept: [
    'In the naive design, every mix is its own subclass of FileSink: LoggingSink, CompressingSink and LoggingCompressingSink. That is 4 classes for 2 optional features, because subclasses can\'t be combined after the fact.',
    'With the pattern, each layer is a small class that holds an inner sink and has the same write method. LoggingSink writes a log line and calls inner.write. CompressingSink compresses the data and calls inner.write. You build the mix at runtime: new LoggingSink(new CompressingSink(new FileSink())). The sequence shows each call nested one level deeper.',
    'Adding encryption shows the cost. The naive design needs 4 new classes, one for each new mix, which takes it from 4 to 8 classes and 26 new lines. The pattern adds 1 class, EncryptingSink, in 10 lines, and it combines with every other layer.',
    'Layers also let you choose the order, and order matters. Compressing first stores 6 bytes, because the runs aaaaaaaa compress to a8. Encrypting first scrambles the runs, so compression finds nothing to squeeze and the file holds 48 bytes. The naive classes fix one order inside each class. The encryption here is a toy XOR with a short key, not real encryption.',
    'In real code, Java\'s I/O streams stack this way, as in new BufferedReader(new InputStreamReader(input)), and Node.js pipes data through zlib and crypto streams the same way.',
  ],
  howItWorks: [
    'Agree on the method every layer has, such as write.',
    'Each layer holds the object it wraps.',
    'A layer does its own work, then calls the same method on the inner object.',
    'Build the stack by wrapping objects inside each other.',
    'A new feature is one new layer that works with all the others.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['Mix features at runtime, in any order', 'A new feature is one class, not one per mix', 'Each layer is small and does one job'],
    cons: ['Many small objects to set up', 'Order mistakes are easy and silent', 'Stack traces go through every layer'],
    useWhen: ['Features are optional and combine freely', 'You want to add behaviour without touching the wrapped class'],
    avoidWhen: ['There is one fixed combination', 'The layers need to know about each other\'s internals'],
  },
  applications: [
    'Java and Node.js streams for buffering, compression and encryption',
    'HTTP middleware that adds logging, caching or auth around a handler',
    'Python decorators that wrap a function with timing or retries',
  ],
  commonMistakes: [
    'Stacking layers in the wrong order, such as encrypting before compressing.',
    'Writing a layer that forgets to call the inner object, so the data never arrives.',
    'Treating the XOR layer here as real encryption. Real code uses a library such as AES-GCM.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The client has called write on LoggingSink#1, which wraps a CompressingSink. After logging, what does LoggingSink#1 call?',
      view: steps[logged]!.view,
      options: ['CompressingSink#1.write', 'FileSink#1.write', 'compress itself', 'Nothing, it returns'],
      answer: 0,
      explanation: 'A layer calls the same method on the object it wraps, which here is the compressing layer.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Without the pattern, adding encryption took the sink classes from 4 to how many?',
      options: ['8', '5', '6', '16'],
      answer: 0,
      explanation: 'Each existing mix needs an encrypting version, because subclasses can\'t be combined.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line makes CompressingSink a layer rather than a file?',
      options: ['return this.inner.write(compress(data));', 'return super.write(compress(data));', 'this.stored = data;', 'constructor(private inner: Sink) {}'],
      answer: 0,
      explanation: 'It does its own work and then hands the result to the object it wraps. super.write is the naive subclass, fixed to one parent.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'Why does encrypting before compressing store 48 bytes instead of 6?',
      options: ['Encryption breaks up the repeated letters', 'Encryption doubles every byte', 'Compression runs twice', 'The log adds bytes'],
      answer: 0,
      explanation: 'Compression squeezes runs of the same letter. After XOR with a 3-letter key there are no runs left.',
    },
  ],
  summary: [
    'A decorator wraps an object and adds one behaviour.',
    'Layers share the same method, so they stack in any mix.',
    'Encryption cost 4 new classes without the pattern, and 1 with it.',
    'The order of layers changes the result.',
  ],
};

export default content;
