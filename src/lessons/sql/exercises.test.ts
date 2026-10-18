import { describe, expect, it } from 'vitest';
import { checkExercise, describeCheck } from '../../sql/check';
import { datasets, type DatasetId } from '../../sql/datasets';
import type { Lesson, SqlExercise } from '../../types/lesson';
import { constraints } from './constraints';
import { deleteLesson } from './delete';

function exercise(lesson: Lesson, id: string): { db: (typeof datasets)[DatasetId]; exercise: SqlExercise } {
  const config = lesson.visualization;
  if (config.kind !== 'sql') throw new Error('not a SQL lesson');
  return { db: datasets[config.dataset], exercise: config.exercises.find((e) => e.id === id)! };
}

describe('write exercises judge behaviour', () => {
  it('members-email needs the self-numbering id the prompt asks for', () => {
    const { db, exercise: ex } = exercise(constraints, 'members-email');
    expect(checkExercise(db, 'CREATE TABLE members (id INTEGER, email TEXT NOT NULL UNIQUE)', ex).status).not.toBe('correct');
    expect(checkExercise(db, 'CREATE TABLE members (email TEXT NOT NULL UNIQUE)', ex).status).not.toBe('correct');
  });

  it('memberships accepts UNIQUE as well as PRIMARY KEY for "each pair only once"', () => {
    const { db, exercise: ex } = exercise(constraints, 'memberships');
    const unique =
      'CREATE TABLE memberships (student_id INTEGER REFERENCES students(id), course_id INTEGER REFERENCES courses(id), UNIQUE (student_id, course_id))';
    expect(checkExercise(db, unique, ex)).toEqual({ status: 'correct' });
  });

  it('cancelled-items must not delete the orders too', () => {
    const { db, exercise: ex } = exercise(deleteLesson, 'cancelled-items');
    const tooMuch =
      "DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');\nDELETE FROM orders WHERE status = 'cancelled';";
    expect(checkExercise(db, tooMuch, ex).status).not.toBe('correct');
  });

  it('names both rules when a probe fails with the wrong one', () => {
    const { db, exercise: ex } = exercise(constraints, 'members-email');
    const result = checkExercise(db, "CREATE TABLE members (id INTEGER PRIMARY KEY, email TEXT NOT NULL CHECK (email <> 'a@club.vn'))", ex);
    expect(describeCheck(result)).toBe(
      "`INSERT INTO members (email) VALUES ('a@club.vn'), ('a@club.vn')` should fail with UNIQUE, but your table failed it with CHECK.",
    );
  });
});

describe('Constraints lesson', () => {
  it('explains that a PRIMARY KEY other than INTEGER PRIMARY KEY still allows NULL in SQLite', () => {
    expect(constraints.concept.join(' ')).toContain('still allows NULL');
  });
});
