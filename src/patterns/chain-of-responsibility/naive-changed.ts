export class ExpenseDesk {
  approve(amount: number) {
    if (amount <= 500) return 'Team lead';
    if (amount <= 5000) return 'Manager';
    if (amount <= 50000) return 'Director';
    if (amount <= 200000) return 'CFO';
    return 'Rejected';
  }
}
