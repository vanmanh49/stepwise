import { describe, expect, it } from 'vitest';
import { FILES, FILES_ROOT, resolvePath, runShell } from './shell';

describe('runShell', () => {
  it('runs one command', () => {
    const run = runShell('ping -c 1 8.8.8.8');
    expect(run.commands).toEqual(['ping -c 1 8.8.8.8']);
    expect(run.output).toContain('8.8.8.8');
  });

  it('runs two with a semicolon and prints the file', () => {
    const run = runShell('ping -c 1 8.8.8.8; cat /app/.env');
    expect(run.commands).toEqual(['ping -c 1 8.8.8.8', 'cat /app/.env']);
    expect(run.output).toContain('DB_PASSWORD=fake-password');
  });

  it('runs on after a failure with a semicolon', () => {
    expect(runShell('cat /nope; whoami').commands).toEqual(['cat /nope', 'whoami']);
  });

  it('stops && after a failed command', () => {
    expect(runShell('cat /nope && whoami').commands).toEqual(['cat /nope']);
  });

  it('goes on past && after a command that worked', () => {
    expect(runShell('whoami && id').commands).toEqual(['whoami', 'id']);
  });

  it('runs || only after a failure', () => {
    expect(runShell('whoami || id').commands).toEqual(['whoami']);
    expect(runShell('cat /nope || id').commands).toEqual(['cat /nope', 'id']);
  });

  it('treats a lone & as a separator', () => {
    expect(runShell('whoami & id').commands).toEqual(['whoami', 'id']);
  });

  it('passes output down a pipe, so cat with no file prints it', () => {
    const run = runShell('whoami | cat');
    expect(run.commands).toEqual(['whoami', 'cat']);
    expect(run.output).toBe('www-data');
  });

  it('shows only the last command of a pipe', () => {
    const run = runShell('cat /etc/passwd | wc');
    expect(run.commands).toEqual(['cat /etc/passwd', 'wc']);
    expect(run.output).toBe('wc: command not found');
  });

  it('replaces $(...) with its output', () => {
    const run = runShell('echo $(whoami)');
    expect(run.commands).toEqual(['whoami', 'echo www-data']);
    expect(run.output).toBe('www-data');
  });

  it('nests three deep', () => {
    expect(runShell('echo $(echo $(echo $(whoami)))').output).toBe('www-data');
  });

  it('leaves a fourth level as plain text', () => {
    const run = runShell('echo $(echo $(echo $(echo $(whoami))))');
    expect(run.output).toBe('$(whoami)');
    expect(run.commands).not.toContain('whoami');
  });

  it('keeps a separator inside $(...) to that command', () => {
    expect(runShell('echo $(whoami; id)').commands).toEqual(['whoami', 'id', expect.stringContaining('echo www-data')]);
  });

  it('replaces backticks with their output, as $(...) does', () => {
    expect(runShell('echo `whoami`').commands).toEqual(['whoami', 'echo www-data']);
    expect(runShell('echo `whoami; id`').commands).toEqual(['whoami', 'id', expect.stringContaining('echo www-data')]);
  });

  it('leaves an unclosed backtick and single-quoted backticks as text', () => {
    expect(runShell('echo `whoami').commands).toHaveLength(1);
    expect(runShell("echo '`whoami`'").output).toBe('`whoami`');
  });

  it('keeps a separator inside quotes', () => {
    const run = runShell("echo 'a; cat /app/.env'");
    expect(run.commands).toHaveLength(1);
    expect(run.output).toBe('a; cat /app/.env');
  });

  it('does not expand inside single quotes', () => {
    expect(runShell("echo '$(whoami)'").output).toBe('$(whoami)');
  });

  it('gives command not found for unknown commands', () => {
    expect(runShell('rm -rf /').output).toBe('rm: command not found');
  });

  it.each(['echo $(', 'echo $(whoami', "echo 'x", 'echo "x', '$(', '$', ';', '&&', '|', '', '   ', '))'])('does not throw on %j', (line) => {
    expect(() => runShell(line)).not.toThrow();
  });

  it('survives a long $( chain', () => {
    expect(() => runShell('$('.repeat(40))).not.toThrow();
    expect(() => runShell(`${'$('.repeat(40)}whoami${')'.repeat(40)}`)).not.toThrow();
  });

  it('lists a directory', () => {
    expect(runShell('ls').output.split('\n')).toEqual(['invoice.txt', 'manual.txt']);
    expect(runShell('ls /etc').output).toBe('passwd');
  });

  it('lists the root as folders, once each', () => {
    expect(runShell('ls /').output.split('\n')).toEqual(['srv', 'etc', 'app']);
  });

  it('says who it is', () => {
    expect(runShell('whoami').output).toBe('www-data');
    expect(runShell('id').output).toContain('uid=33(www-data)');
  });

  it('reports a missing file', () => {
    expect(runShell('cat /nope').output).toBe('cat: /nope: No such file or directory');
  });

  it('reads a file relative to the folder', () => {
    expect(runShell('cat invoice.txt').output).toBe(FILES[`${FILES_ROOT}/invoice.txt`]);
  });

  it('leaks a substitution through ping, which uses its last argument', () => {
    expect(runShell('ping -c 1 8.8.8.8 $(whoami)').output).toContain('www-data');
  });
});

describe('resolvePath', () => {
  it.each([
    ['../../etc/passwd', '/etc/passwd'],
    ['invoice.txt', '/srv/files/invoice.txt'],
    ['./invoice.txt', '/srv/files/invoice.txt'],
    ['a/../invoice.txt', '/srv/files/invoice.txt'],
    ['../../../../../etc/passwd', '/etc/passwd'],
    ['/etc/passwd', '/etc/passwd'],
    ['../../..', '/'],
    ['', '/srv/files'],
  ])('%s', (path, resolved) => {
    expect(resolvePath(FILES_ROOT, path)).toBe(resolved);
  });
});
