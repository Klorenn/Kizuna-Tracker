import { describe, expect, test } from 'vitest'
import { balanceCopy, friendStatusText, pairRecord, viewerState } from '@/lib/friend-view'

describe('viewerState', () => {
  const f = (requester: string, addressee: string, status: string) => ({
    requester_id: requester,
    addressee_id: addressee,
    status,
  })
  test('sin sesión', () => expect(viewerState(null, 'beto', null)).toBe('anon'))
  test('uno mismo', () => expect(viewerState('ana', 'ana', null)).toBe('self'))
  test('amigos aceptados, sin importar quién pidió', () => {
    expect(viewerState('ana', 'beto', f('ana', 'beto', 'accepted'))).toBe('friend')
    expect(viewerState('ana', 'beto', f('beto', 'ana', 'accepted'))).toBe('friend')
  })
  test('solicitud pendiente: recibida o enviada', () => {
    expect(viewerState('ana', 'beto', f('beto', 'ana', 'pending'))).toBe('incoming')
    expect(viewerState('ana', 'beto', f('ana', 'beto', 'pending'))).toBe('outgoing')
  })
  test('desconocido, o una fila que no es de este par', () => {
    expect(viewerState('ana', 'beto', null)).toBe('stranger')
    expect(viewerState('ana', 'beto', f('ana', 'carla', 'accepted'))).toBe('stranger')
  })
})

describe('pairRecord', () => {
  const challenges = [
    { id: 'c1', creator_id: 'ana', rival_id: 'beto', status: 'finished' },
    { id: 'c2', creator_id: 'beto', rival_id: 'ana', status: 'finished' },
    { id: 'c3', creator_id: 'ana', rival_id: 'beto', status: 'finished' },
    { id: 'c4', creator_id: 'ana', rival_id: 'carla', status: 'finished' },
    { id: 'c5', creator_id: 'ana', rival_id: 'beto', status: 'active' },
  ]
  const debt = (challenge: string, debtor: string, creditor: string, amount: number, paid = false) => ({
    challenge_id: challenge,
    debtor_id: debtor,
    creditor_id: creditor,
    amount,
    paid_at: paid ? '2026-11-20T00:00:00Z' : null,
  })
  const debts = [
    debt('c1', 'beto', 'ana', 2500), // ana won c1
    debt('c1', 'beto', 'ana', 2500, true),
    debt('c2', 'ana', 'beto', 1000), // ana lost c2
    // c3: tie (no debts)
    debt('c4', 'carla', 'ana', 9000), // other pair: ignored
    debt('c5', 'ana', 'beto', 500), // active challenge: counts for the balance, not the record
  ]
  test('ganados y perdidos desde mi punto de vista, solo entre los dos', () => {
    expect(pairRecord('ana', 'beto', challenges, debts)).toEqual({ won: 1, lost: 1, balance: 2500 - 1000 - 500 })
  })
  test('desde el otro lado', () => {
    expect(pairRecord('beto', 'ana', challenges, debts)).toEqual({ won: 1, lost: 1, balance: -1000 })
  })
  test('sin retos', () => expect(pairRecord('ana', 'beto', [], [])).toEqual({ won: 0, lost: 0, balance: 0 }))
})

describe('balanceCopy', () => {
  test('me debe', () => expect(balanceCopy(2500, 'Beto')).toBe('Beto te debe $2.500'))
  test('le debo', () => expect(balanceCopy(-2500, 'Beto')).toBe('Le debes $2.500 a Beto'))
  test('en cero no se muestra', () => expect(balanceCopy(0, 'Beto')).toBeNull())
})

describe('friendStatusText', () => {
  test('racha activa', () => {
    expect(friendStatusText({ value: 21, unit: 'days' })).toBe('Racha de 21 días')
    expect(friendStatusText({ value: 1, unit: 'days' })).toBe('Racha de 1 día')
    expect(friendStatusText({ value: 3, unit: 'weeks' })).toBe('Racha de 3 semanas')
  })
  test('una racha que llena la ventana se muestra con "+"', () => {
    expect(friendStatusText({ value: 120, unit: 'days', capped: true })).toBe('Racha de 120+ días')
    expect(friendStatusText({ value: 16, unit: 'weeks', capped: true })).toBe('Racha de 16+ semanas')
  })
  test('sin racha', () => expect(friendStatusText({ value: 0, unit: 'days' })).toBe('Sin racha activa'))
})
