// core/auth-manager-interface.js
export default class IAuthManager {
  async register(userData) { throw new Error('Not implemented'); }
  async login(credentials) { throw new Error('Not implemented'); }
  async logout() { throw new Error('Not implemented'); }
  async getCurrentUser() { throw new Error('Not implemented'); }
  async isAuthenticated() { throw new Error('Not implemented'); }
  async hasPermission(permission) { throw new Error('Not implemented'); }
}
