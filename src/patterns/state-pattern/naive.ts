export class Doc {
  status = 'Draft';
  history: string[] = ['Draft'];

  submit() {
    switch (this.status) {
      case 'Draft':
        return this.move('In review');
      default:
        return this.refuse('submit');
    }
  }

  approve() {
    switch (this.status) {
      case 'In review':
        return this.move('Published');
      default:
        return this.refuse('approve');
    }
  }

  reject() {
    switch (this.status) {
      case 'In review':
        return this.move('Draft');
      default:
        return this.refuse('reject');
    }
  }

  move(status: string) {
    this.status = status;
    this.history.push(status);
    return status;
  }

  refuse(action: string) {
    return `Can't ${action} now: status is ${this.status}`;
  }
}
