var debug = require('debug')('rascal:Broker')
var format = require('util').format
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var _ = require('lodash')
var async = require('async')
var tasks = require('./tasks')
var configure = require('../config/configure')
var validate = require('../config/validate')
var fqn = require('../config/fqn')
var preflight = async.compose(validate, configure)
var stub = require('../counters/stub')
var inMemory = require('../counters/inMemory')
var inMemoryCluster = require('../counters/inMemoryCluster').worker

var init = async.compose(tasks.initShovels, tasks.initSubscriptions, tasks.initPublications, tasks.initCounters, tasks.initVhosts)
var nuke = async.compose(tasks.disconnectVhost, tasks.nukeVhost)
var purge = tasks.purgeVhost
var disconnect = tasks.disconnectVhost
var bounce = tasks.bounceVhost

function Broker(config, components) {
    this.config = config
    this.vhosts = {}
    this.publications = {}
    this.subscriptions = {}
    this.counters = _.defaults({}, components.counters, { stub: stub, inMemory: inMemory, inMemoryCluster: inMemoryCluster })
}

inherits(Broker, EventEmitter)

Broker.create = function(config, components, next) {
    if (arguments.length === 2) return this.create(config, {}, arguments[1])
    preflight(_.cloneDeep(config), function(err, config) {
        if (err) return next(err)
        new Broker(config, components).init(next)
    })
}

Broker.prototype.init = function(next) {
    var self = this
    debug('Initialising broker')
    init(self.config, { broker: self, components: { counters: self.counters } }, function(err, config, ctx) {
        self.vhosts = ctx.vhosts
        self.publications = ctx.publications
        self.subscriptions = ctx.subscriptions
        setImmediate(function() {
            next(err, self)
        })
    })
    return this
}

Broker.prototype.nuke = function(next) {
    var self = this
    debug('Nuking broker')
    async.eachSeries(_.values(self.vhosts), function(vhost, callback) {
        nuke(self.config, { vhost: vhost }, callback)
    }, function(err) {
        if (err) return next(err)
        self.vhosts = self.publications = self.subscriptions = {}
        debug('Finished nuking broker')
        next()
    })
    return this
}

Broker.prototype.purge = function(next) {
    var self = this
    debug('Purging all queues in all vhosts')
    async.eachSeries(_.values(self.vhosts), function(vhost, callback) {
        purge(self.config, { vhost: vhost }, callback)
    }, function(err) {
        if (err) return next(err)
        debug('Finished purging all queues in all vhosts')
        next()
    })
    return this
}

Broker.prototype.shutdown = function(next) {
    var self = this
    debug('Shutting down broker')
    async.eachSeries(_.values(self.vhosts), function(vhost, callback) {
        disconnect(self.config, { vhost: vhost }, callback)
    }, function(err) {
        if (err) return next(err)
        debug('Finished shutting down broker')
        next()
    })
    return this
}

Broker.prototype.bounce = function(next) {
    var self = this
    debug('Bouncing broker')
    async.eachSeries(_.values(self.vhosts), function(vhost, callback) {
        bounce(self.config, { vhost: vhost }, callback)
    }, function(err) {
        if (err) return next(err)
        debug('Finished bouncing broker')
        next()
    })
    return this
}

Broker.prototype.publish = function(name, message, overrides, next) {
    var self = this
    if (arguments.length === 3) return self.publish(name, message, {}, arguments[2])
    if (_.isString(overrides)) return self.publish(name, message, { routingKey: overrides }, next)
    if (!self.publications[name]) return next(new Error(format('Unknown publication: %s', name)))
    self.publications[name].publish(message, overrides, next)
    return this
}

Broker.prototype.forward = function(name, message, overrides, next) {
    var self = this
    if (arguments.length === 3) return self.forward(name, message, {}, arguments[2])
    if (_.isString(overrides)) return self.forward(name, message, { routingKey: overrides }, next)
    if (!self.config.publications[name]) return next(new Error(format('Unknown publication: %s', name)))
    self.publications[name].forward(message, overrides, next)
    return this
}

Broker.prototype.subscribe = function(name, overrides, next) {
    var self = this
    if (arguments.length === 2) return self.subscribe(name, {}, arguments[1])
    if (!self.subscriptions[name]) return next(new Error(format('Unknown subscription: %s', name)))
    self.subscriptions[name].subscribe(overrides, next)
    return this
}

Broker.prototype.getFullyQualifiedName = this.qualify = function(vhost, name) {
    var self = this
    return fqn.qualify(name, self.config.vhosts[vhost].namespace)
}

module.exports = Broker

