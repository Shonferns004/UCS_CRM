import { api } from './auth'

export async function getMyTarget() {
  return api('/fro/target', { _prefix: 'ucs' })
}
