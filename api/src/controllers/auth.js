"use strict"

module.exports = AuthsControllerFactory

const request = require('five-bells-shared/utils/request')
const passport = require('koa-passport')
const Auth = require('../lib/auth')
const Log = require('../lib/log')
const Ledger = require('../lib/ledger')
const UserFactory = require('../models/user')
const UsernameTakenError = require('../errors/username-taken-error')

AuthsControllerFactory.constitute = [Auth, UserFactory, Log, Ledger]
function AuthsControllerFactory (Auth, User, log, ledger) {
  log = log('auth')

  return class AuthController {
    static init (router) {
      router.get('/auth/load', Auth.isAuth, this.load)
      router.get('/auth/logout', this.logout)
      router.post('/auth/register', User.createBodyParser(), this.register)
      router.post('/auth/login', passport.authenticate('local'), this.load)
    }

    static * register () {
      let username = this.body.username
      request.validateUriParameter('username', username, 'Identifier')
      username = username.toLowerCase()

      let user = yield User.findOne({where: {username: username}})

      // Username is already taken
      if (user) {
        throw new UsernameTakenError("Username is already taken")
      }

      // Create a ledger account
      // TODO handle exceptions
      const ledgerUser = yield ledger.createAccount(this.body)

      user = yield User.createExternal(this.body)

      // TODO load balance in req.login
      this.body.balance = ledgerUser.balance
      this.body.id = user.id

      // TODO callbacks?
      this.req.logIn(this.body, function (err) {})

      log.debug('created user ' + username)

      this.body = this.body.getDataExternal()
      this.status = 201
    }

    // TODO load the ledger balance
    static * load () {
      let user = this.req.user

      // There's no active session
      if (!user) {
        this.status = 404
        return
      }

      // Get account balance
      const ledgerUser = yield ledger.getAccount(user)
      user.balance = ledgerUser.balance

      this.body = user
    }

    static logout () {
      this.session = null
      this.body = {}
    }
  }
}
