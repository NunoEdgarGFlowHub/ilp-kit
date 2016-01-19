"use strict"

module.exports = PaymentFactory

const _ = require('lodash')
const Container = require('constitute').Container
const Model = require('five-bells-shared').Model
const InvalidBodyError = require('five-bells-shared/errors/invalid-body-error')
const PersistentModelMixin = require('five-bells-shared').PersistentModelMixin
const Database = require('../lib/db')
const Config = require('../lib/config')
const Validator = require('five-bells-shared/lib/validator')
const Sequelize = require('sequelize')
const UserFactory = require('./user')

PaymentFactory.constitute = [Database, Validator, Container, Config, UserFactory]
function PaymentFactory (sequelize, validator, container, config, User) {
  class Payment extends Model {
    static convertFromExternal (data) {
      return data
    }

    static convertToExternal (data) {
      return data
    }

    static convertFromPersistent (data) {
      delete data.created_at
      delete data.updated_at
      data = _.omit(data, _.isNull)
      return data
    }

    static convertToPersistent (data) {
      return data
    }

    static createBodyParser () {
      const Self = this

      return function * (next) {
        let json = this.body
        const validationResult = Self.validateExternal(json)
        if (validationResult.valid !== true) {
          const message = validationResult.schema
            ? 'Body did not match schema ' + validationResult.schema
            : 'Body did not pass validation'
          throw new InvalidBodyError(message, validationResult.errors)
        }

        const model = new Self()
        model.setDataExternal(json)
        this.body = model

        yield next
      }
    }

    /**
     * Collection methods
     */
    static getUserPayments (user) {
      return Payment.findAll({
        // This is how we get a flat object that includes user username
        attributes: {include: [
          [Sequelize.col('SourceUser.username'), 'sourceUserUsername'],
          [Sequelize.col('DestinationUser.username'), 'destinationUserUsername']
        ]},
        where: {
          $or: [
            {source_user: user.id},
            {destination_user: user.id},
            {destination_account: user.username}
          ]
        },
        include: [
          // attributes: [] because we want a flat object. See above
          { model: User.DbModel, as: 'SourceUser', attributes: [] },
          { model: User.DbModel, as: 'DestinationUser', attributes: [] }
        ]
      })
    }

    static * getPayment (paymentId) {
      return Payment.findOne({
        attributes: {include: [
          [Sequelize.col('SourceUser.username'), 'sourceUserUsername']
        ]},
        where: {
          id: paymentId
        },
        include: [{
          model: User.DbModel, as: 'SourceUser', attributes: []
        }]
      })
    }
  }

  Payment.validateExternal = validator.create('Payment')

  PersistentModelMixin(Payment, sequelize, {
    id: {
      type: Sequelize.UUID,
      primaryKey: true,
      defaultValue: Sequelize.UUIDV4
    },
    source_user: Sequelize.INTEGER,
    destination_user: Sequelize.INTEGER,
    destination_account: Sequelize.STRING(1024),
    transfers: Sequelize.ARRAY(Sequelize.STRING(1024)),
    state: Sequelize.ENUM('pending', 'success', 'fail'),
    source_amount: Sequelize.STRING(1024), // TODO put the right type
    destination_amount: Sequelize.STRING(1024), // TODO put the right type
    created_at: Sequelize.DATE,
    completed_at: Sequelize.DATE
  })

  container.schedulePostConstructor((User) => {
    Payment.DbModel.belongsTo(User.DbModel, {
      foreignKey: 'source_user',
      as: 'SourceUser'
    })
    Payment.DbModel.belongsTo(User.DbModel, {
      foreignKey: 'destination_user',
      as: 'DestinationUser'
    })
  }, [ UserFactory ])

  return Payment
}