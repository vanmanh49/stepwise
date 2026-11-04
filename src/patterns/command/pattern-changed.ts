type Command = { execute(): void; undo(): void };

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

export class TypeCommand {
  constructor(public editor: Editor, public text: string) {}

  execute() {
    this.editor.insert(this.text);
  }

  undo() {
    this.editor.remove(this.text.length);
  }
}

export class DeleteCommand {
  removed = '';
  constructor(public editor: Editor, public count: number) {}

  execute() {
    this.removed = this.editor.remove(this.count);
  }

  undo() {
    this.editor.insert(this.removed);
  }
}

export class History {
  done: Command[] = [];
  run(command: Command) {
    command.execute();
    this.done.push(command);
  }

  undo() {
    this.done.pop()?.undo();
  }
}

export class MacroCommand {
  constructor(public commands: Command[]) {}

  execute() {
    for (const command of this.commands) command.execute();
  }

  undo() {
    for (const command of this.commands.toReversed()) command.undo();
  }
}

export class Toolbar {
  constructor(public editor: Editor, public history: History) {}

  type(s: string) {
    this.history.run(new TypeCommand(this.editor, s));
  }
}

export class Shortcuts {
  constructor(public editor: Editor, public history: History) {}

  backspace() {
    this.history.run(new DeleteCommand(this.editor, 1));
  }
}
