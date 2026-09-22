import Database from 'better-sqlite3'
import { DateTime } from 'luxon'

// A saved chat conversation. `messages` is opaque JSON owned by the client (roles,
// content, citations); `docIds` are the focused uploadIds.
export interface Conversation {
  id: number
  title: string
  messages: unknown
  docIds: string[]
  createdAt: string
  updatedAt: string
}

interface ConversationRow {
  id: number
  title: string
  messages: string
  docIds: string
  createdAt: string
  updatedAt: string
}

const rowToConversation = (row: ConversationRow): Conversation => ({
  id: row.id,
  title: row.title,
  messages: JSON.parse(row.messages),
  docIds: JSON.parse(row.docIds),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt
})

export const createConversation = (db: Database.Database, title: string, messages: unknown, docIds: string[]): number => {
  const now = DateTime.now().toISO()
  const info = db
    .prepare('INSERT INTO chats (title, messages, docIds, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)')
    .run(title, JSON.stringify(messages), JSON.stringify(docIds), now, now)
  return Number(info.lastInsertRowid)
}

// List summaries (no message bodies) for the conversation switcher, newest first.
export const listConversations = (db: Database.Database): { id: number; title: string; updatedAt: string }[] =>
  db.prepare('SELECT id, title, updatedAt FROM chats ORDER BY updatedAt DESC').all() as {
    id: number
    title: string
    updatedAt: string
  }[]

export const getConversation = (db: Database.Database, id: number): Conversation | null => {
  const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(id) as ConversationRow | undefined
  return row ? rowToConversation(row) : null
}

export const saveConversation = (
  db: Database.Database,
  id: number,
  fields: { title?: string; messages: unknown; docIds: string[] }
): void => {
  const now = DateTime.now().toISO()
  if (fields.title !== undefined) {
    db.prepare('UPDATE chats SET title = ?, messages = ?, docIds = ?, updatedAt = ? WHERE id = ?').run(
      fields.title,
      JSON.stringify(fields.messages),
      JSON.stringify(fields.docIds),
      now,
      id
    )
  } else {
    db.prepare('UPDATE chats SET messages = ?, docIds = ?, updatedAt = ? WHERE id = ?').run(
      JSON.stringify(fields.messages),
      JSON.stringify(fields.docIds),
      now,
      id
    )
  }
}

export const deleteConversation = (db: Database.Database, id: number): void => {
  db.prepare('DELETE FROM chats WHERE id = ?').run(id)
}
