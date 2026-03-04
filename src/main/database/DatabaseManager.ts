import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

let db: Database.Database

export function getDb(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized')
  }
  return db
}

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  const dbPath = path.join(userDataPath, 'dienstplan.db')

  // Ensure directory exists
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true })
  }

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createSchema()
  console.log('Database initialized at:', dbPath)
}

function createSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS person (
      id                       INTEGER PRIMARY KEY AUTOINCREMENT,
      name                     TEXT NOT NULL UNIQUE,
      anzahl_dienste           INTEGER DEFAULT 0,
      arbeits_tage             TEXT DEFAULT 'MONTAG,DIENSTAG,MITTWOCH,DONNERSTAG,FREITAG,SAMSTAG,SONNTAG',
      verfuegbare_dienst_arten TEXT DEFAULT 'DIENST_24H,VISTEN,DAVINCI'
    );

    CREATE TABLE IF NOT EXISTS dienstplan (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT,
      monat_jahr     TEXT,
      erstellt_am    TEXT,
      letztes_update TEXT,
      status         TEXT DEFAULT 'ENTWURF',
      bemerkung      TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS dienst (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      dienstplan_id INTEGER NOT NULL,
      datum         TEXT NOT NULL,
      art           TEXT NOT NULL,
      person_id     INTEGER NULL,
      person_name   TEXT NULL,
      status        TEXT DEFAULT 'GEPLANT',
      bemerkung     TEXT NULL,
      FOREIGN KEY (dienstplan_id) REFERENCES dienstplan(id) ON DELETE CASCADE,
      FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS monats_wunsch (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id    INTEGER NOT NULL,
      person_name  TEXT NOT NULL,
      datum        TEXT NOT NULL,
      monat_jahr   TEXT NOT NULL,
      typ          TEXT NOT NULL,
      erfuellt     INTEGER NULL,
      FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS fairness_historie (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      person_id          INTEGER NOT NULL,
      person_name        TEXT NOT NULL,
      monat_jahr         TEXT NOT NULL,
      anzahl_wuensche    INTEGER DEFAULT 0,
      erfuellte_wuensche INTEGER DEFAULT 0,
      FOREIGN KEY (person_id) REFERENCES person(id) ON DELETE CASCADE
    );
  `)
}
