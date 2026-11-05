type User = { name: string; email: string };

export abstract class Export {
  run(users: User[]) {
    const sorted = users.toSorted((a, b) => a.name.localeCompare(b.name));
    return [this.header(), sorted.map((u) => this.row(u)).join(this.separator()), this.footer()]
      .filter((part) => part !== '')
      .join('\n');
  }

  abstract header(): string;
  abstract row(user: User): string;

  separator() {
    return '\n';
  }

  footer() {
    return '';
  }
}

export class CsvExport extends Export {
  header() {
    return 'name,email';
  }

  row(u: User) {
    return `${u.name},${u.email}`;
  }
}

export class JsonExport extends Export {
  header() {
    return '[';
  }

  row(u: User) {
    return `  ${JSON.stringify({ name: u.name, email: u.email })}`;
  }

  separator() {
    return ',\n';
  }

  footer() {
    return ']';
  }
}

export class MarkdownExport extends Export {
  header() {
    return '| name | email |\n|---|---|';
  }

  row(u: User) {
    return `| ${u.name} | ${u.email} |`;
  }
}
