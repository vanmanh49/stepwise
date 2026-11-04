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

export class Toolbar {
  constructor(public editor: Editor) {}

  type(s: string) {
    this.editor.insert(s);
  }
}

export class Shortcuts {
  constructor(public editor: Editor) {}

  backspace() {
    this.editor.remove(1);
  }
}
