import { getDb } from './DatabaseManager'
import { Person } from '../../shared/types'

export class PersonDAO {
  getAll(): Person[] {
    return getDb().prepare('SELECT * FROM person ORDER BY name').all() as Person[]
  }

  getById(id: number): Person | undefined {
    return getDb().prepare('SELECT * FROM person WHERE id = ?').get(id) as Person | undefined
  }

  create(person: Omit<Person, 'id'>): Person {
    const stmt = getDb().prepare(
      'INSERT INTO person (name, anzahl_dienste, arbeits_tage, verfuegbare_dienst_arten) VALUES (?, ?, ?, ?)'
    )
    const result = stmt.run(
      person.name,
      person.anzahl_dienste,
      person.arbeits_tage,
      person.verfuegbare_dienst_arten
    )
    return this.getById(result.lastInsertRowid as number)!
  }

  update(person: Person): Person {
    getDb()
      .prepare(
        'UPDATE person SET name = ?, anzahl_dienste = ?, arbeits_tage = ?, verfuegbare_dienst_arten = ? WHERE id = ?'
      )
      .run(
        person.name,
        person.anzahl_dienste,
        person.arbeits_tage,
        person.verfuegbare_dienst_arten,
        person.id
      )
    return this.getById(person.id)!
  }

  delete(id: number): void {
    getDb().prepare('DELETE FROM person WHERE id = ?').run(id)
  }
}
