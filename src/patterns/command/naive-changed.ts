export class Editor {
  text = '';
  insert(s: string) {
    this.text += s;
  }

  remove(count: number) {
    const removed = this.text.slice(this.text.length - Math.min(count, this.text.length));
    this.text = this.text.slice(0, this.text.length - removed.length);
    return removed;
  }
}

export class Macro {
  steps: { kind: string; value: string }[] = [];

  record(kind: string, value: string) {
    this.steps.push({ kind, value });
  }

  replay(editor: Editor) {
    for (const step of this.steps) {
      if (step.kind === 'type') editor.insert(step.value);
      else if (step.kind === 'delete') editor.remove(Number(step.value));
    }
  }
}

export class Toolbar {
  constructor(
    public editor: Editor,
    public macro: Macro,
  ) {}

  type(s: string) {
    this.editor.insert(s);
    this.macro.record('type', s);
  }
}

export class Shortcuts {
  constructor(
    public editor: Editor,
    public macro: Macro,
  ) {}

  backspace() {
    this.editor.remove(1);
    this.macro.record('delete', '1');
  }
}
