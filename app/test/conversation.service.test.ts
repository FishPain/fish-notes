import { describe, it, expect } from 'vitest'
import { openDb } from '../src/db.js'
import {
  createConversation,
  listConversations,
  getConversation,
  saveConversation,
  deleteConversation
} from '../src/conversation.service.js'

describe('conversation.service', () => {
  it('creates, reads, updates, lists, and deletes a conversation', () => {
    const db = openDb(':memory:')
    const msgs = [{ role: 'user', content: 'hi' }]
    const id = createConversation(db, 'First chat', msgs, ['U1'])

    const got = getConversation(db, id)!
    expect(got.title).toBe('First chat')
    expect(got.messages).toEqual(msgs)
    expect(got.docIds).toEqual(['U1'])

    saveConversation(db, id, { messages: [...msgs, { role: 'assistant', content: 'hello' }], docIds: [] })
    expect((getConversation(db, id)!.messages as unknown[]).length).toBe(2)
    expect(getConversation(db, id)!.docIds).toEqual([])

    expect(listConversations(db).map((c) => c.id)).toContain(id)

    deleteConversation(db, id)
    expect(getConversation(db, id)).toBeNull()
    db.close()
  })
})
