import { mementoLesson as lesson } from '../../patterns/memento/scenario';
import { patternCode, patternFields, patternPresets, patternSteps } from '../../patterns/steps';
import type { LessonContent } from '../../types/lesson';

const steps = patternSteps(lesson, { design: 'Pattern', change: 'None', outcome: 'Lose and load the save' });
const gotSave = steps.findIndex((step) => step.title === 'SaveSlots#1 returns HeroMemento#1');

const content: LessonContent = {
  overview:
    'Saving and loading, undo and checkpoints all need a copy of an object\'s state to go back to. The Memento pattern lets the object make that copy itself, as a snapshot that the rest of the program keeps but never opens. This lesson saves a game hero with 100 health, 50 gold and position 3 before a boss fight, loses the fight, loads the save, then gives the hero an inventory.',
  concept: [
    'In the naive design, SaveSlot does the saving from outside. save(hero) reads hp, gold and x out of the hero, and load(hero) writes them back. It works, but the hero\'s fields have to be public, and SaveSlot has to know every one of them.',
    'With the pattern, the hero keeps its fields private. Hero.save() returns a HeroMemento holding a copy of the hero\'s state, and Hero.restore(memento) copies it back. SaveSlots, the caretaker, keeps mementos and hands them back without looking inside. Run "Lose and load the save": the hero drops to 0 health, 20 gold at position 9, then restore puts it back to 100, 50 and 3.',
    'Loading the same save twice gives the same hero both times. The memento holds a copy, and restore copies it again, so nothing the hero does after loading can change the save.',
    'The inventory shows the cost. Without the pattern, both Hero and SaveSlot change, 6 lines added and 3 removed, because SaveSlot copies fields by name and must learn the new one, including copying the array so the save does not share it. With the pattern, only Hero changes, 3 lines added and 1 removed: the snapshot copies the whole state, so the new field is saved without touching the memento or the caretaker.',
    'In real code, editors and drawing apps keep snapshots of a document for undo and autosave, games write save files the same way, and JavaScript\'s structuredClone, used here, is a common way to take a deep copy for one. Redux DevTools\' time travel replays stored snapshots of the state.',
  ],
  howItWorks: [
    'The object whose state is saved, the originator, makes its own snapshot: the memento.',
    'The memento holds a copy of the state and offers nothing to change it.',
    'A caretaker keeps mementos and hands them back, without reading them.',
    'To go back, the originator restores itself from a memento, copying it again.',
    'A new field changes only the originator, because the snapshot covers its whole state.',
  ],
  visualization: {
    kind: 'form',
    fields: patternFields(lesson),
    presets: patternPresets(lesson),
    generate: (values) => patternSteps(lesson, values),
  },
  code: patternCode(lesson),
  prosCons: {
    pros: ['The object\'s fields can stay private', 'Saves and restores whole states, whatever changed', 'The caretaker works for any state without knowing it'],
    cons: ['Every snapshot is a full copy, which costs memory for big state', 'Copying must be deep, or the save shares data with the live object', 'Keeping many snapshots needs a limit or they pile up'],
    useWhen: ['You need undo, checkpoints or save games', 'Code outside the object should not see or depend on its fields'],
    avoidWhen: ['The state is large and changes often, so a command that reverses its own change is cheaper', 'Only one field ever needs to go back'],
  },
  applications: [
    'Undo and autosave snapshots in editors and drawing apps',
    'Save games and checkpoints',
    'Time travel debugging over stored states',
  ],
  commonMistakes: [
    'Copying an array or object by reference, so later changes leak into the save.',
    'Letting the caretaker read or edit what is inside the memento.',
    'Keeping every snapshot forever, which grows memory without limit.',
  ],
  quiz: [
    {
      id: 'q1',
      type: 'predict-next',
      prompt: 'The game got the latest save, HeroMemento#1, back from SaveSlots#1. What does it do with it?',
      view: steps[gotSave]!.view,
      options: ['client calls Hero#1.restore(HeroMemento#1)', 'SaveSlots#1 reads hp from HeroMemento#1', 'client calls Hero#1.save()', 'client calls Hero#1.fight(false)'],
      answer: 0,
      explanation: 'Only the hero reads a memento. The game hands it to the hero, and the hero copies the saved state back into itself.',
    },
    {
      id: 'q2',
      type: 'multiple-choice',
      prompt: 'Adding the inventory without the pattern, which classes had to change?',
      options: ['Hero and SaveSlot', 'Hero only', 'SaveSlot only', 'None'],
      answer: 0,
      explanation: 'The hero gained the field, and SaveSlot copies fields by name, so it had to copy the new one in save and load.',
    },
    {
      id: 'q3',
      type: 'code',
      prompt: 'Which line means a new field is saved without editing anything else?',
      options: ['return new HeroMemento(structuredClone({ ...this }));', 'this.saved = { hp: hero.hp, gold: hero.gold, x: hero.x };', 'this.saves.push(memento);', 'hero.hp = this.saved.hp;'],
      answer: 0,
      explanation: 'The hero copies its whole state into the memento, so a field added later is included. The naive save lists fields by name.',
    },
    {
      id: 'q4',
      type: 'multiple-choice',
      prompt: 'How is a memento different from a command\'s undo?',
      options: ['A memento stores the whole state; a command knows how to reverse its own change', 'They are the same thing', 'A command stores the whole state; a memento reverses one change', 'A memento only works for numbers'],
      answer: 0,
      explanation: 'A command undoes what it did, such as deleting the text it typed. A memento goes back to a saved copy, whatever happened since.',
    },
  ],
  summary: [
    'Memento lets an object save and restore its own state.',
    'The caretaker keeps snapshots without reading them.',
    'Loading the same save twice gave the same hero both times.',
    'The inventory edited 2 classes without the pattern and 1 with it.',
  ],
};

export default content;
