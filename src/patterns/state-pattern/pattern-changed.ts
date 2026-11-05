export abstract class State {
  abstract name: string;

  submit(doc: Doc) {
    return doc.refuse('submit');
  }

  approve(doc: Doc) {
    return doc.refuse('approve');
  }

  reject(doc: Doc) {
    return doc.refuse('reject');
  }
}

export class Draft extends State {
  name = 'Draft';

  submit(doc: Doc) {
    return doc.moveTo(new InReview());
  }
}

export class InReview extends State {
  name = 'In review';

  approve(doc: Doc) {
    return doc.moveTo(new LegalReview());
  }

  reject(doc: Doc) {
    return doc.moveTo(new Draft());
  }
}

export class Published extends State {
  name = 'Published';
}

export class LegalReview extends State {
  name = 'Legal review';

  approve(doc: Doc) {
    return doc.moveTo(new Published());
  }

  reject(doc: Doc) {
    return doc.moveTo(new Draft());
  }
}

export class Doc {
  state: State = new Draft();
  history: string[] = ['Draft'];

  submit() {
    return this.state.submit(this);
  }

  approve() {
    return this.state.approve(this);
  }

  reject() {
    return this.state.reject(this);
  }

  moveTo(state: State) {
    this.state = state;
    this.history.push(state.name);
    return state.name;
  }

  refuse(action: string) {
    return `Can't ${action} now: status is ${this.state.name}`;
  }
}
