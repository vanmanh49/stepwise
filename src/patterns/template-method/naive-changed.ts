type User = { name: string; email: string };

export class CsvExport {
  run(users: User[]) {
    const sorted = users.filter((u) => u.email !== '').toSorted((a, b) => a.name.localeCompare(b.name));
    const rows = sorted.map((u) => `${u.name},${u.email}`);
    return ['name,email', ...rows].join('\n');
  }
}

export class JsonExport {
  run(users: User[]) {
    const sorted = users.filter((u) => u.email !== '').toSorted((a, b) => a.name.localeCompare(b.name));
    const rows = sorted.map((u) => `  ${JSON.stringify({ name: u.name, email: u.email })}`);
    return ['[', rows.join(',\n'), ']'].join('\n');
  }
}

export class MarkdownExport {
  run(users: User[]) {
    const sorted = users.filter((u) => u.email !== '').toSorted((a, b) => a.name.localeCompare(b.name));
    const rows = sorted.map((u) => `| ${u.name} | ${u.email} |`);
    return ['| name | email |', '|---|---|', ...rows].join('\n');
  }
}
