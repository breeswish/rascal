'use strict'

var _ = require('lodash').runInContext().mixin({ 'defaultsDeep': require('merge-defaults') })
var defaultConfig = require('./lib/config/defaults')
var testConfig = require('./lib/config/tests')
var Broker = require('./lib/amqp/Broker')
var Publication = require('./lib/amqp/Publication')
var SubscriberSession = require('./lib/amqp/SubscriberSession')
var Subscription = require('./lib/amqp/Subscription')
var Vhost = require('./lib/amqp/Vhost')

module.exports = (function() {
    return {
        Broker: Broker,
        Publication: Publication,
        SubscriberSession: SubscriberSession,
        Subscription: Subscription,
        Vhost: Vhost,
        createBroker: Broker.create,
        defaultConfig: defaultConfig,
        testConfig: testConfig,
        withDefaultConfig: function(config) {
            return _.defaultsDeep({}, config, defaultConfig)
        },
        withTestConfig: function(config) {
            return _.defaultsDeep({}, config, testConfig)
        },
        counters: require('./lib/counters')
    }
})()
