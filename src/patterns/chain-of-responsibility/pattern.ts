export abstract class Approver {
  abstract name: string;
  abstract limit: number;
  next?: Approver;

  setNext(approver: Approver) {
    this.next = approver;
    return approver;
  }

  handle(amount: number): string {
    if (amount <= this.limit) return this.name;
    return this.next ? this.next.handle(amount) : 'Rejected';
  }
}

export class TeamLead extends Approver {
  name = 'Team lead';
  limit = 500;
}

export class Manager extends Approver {
  name = 'Manager';
  limit = 5000;
}

export class Director extends Approver {
  name = 'Director';
  limit = 50000;
}

export class ExpenseDesk {
  first = new TeamLead();

  constructor() {
    this.first.setNext(new Manager()).setNext(new Director());
  }

  approve(amount: number) {
    return this.first.handle(amount);
  }
}
