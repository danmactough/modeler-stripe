var modeler = require('modeler')
  , Stripe = require('stripe')
  , hydration = require('hydration')
  , _ = require('lodash');

module.exports = function (_opts) {
  var api = modeler(_opts)
    , internalProps = [ 'rev', 'created', 'updated' ]
    , stripe
    , collection;

  if (!api.options.secret_key) throw new Error('secret key required');
  if (!api.options.name) throw new Error('name required');
  if (!api.options.name.match(/^(?:customers)/)) throw new Error('collection not supported: ' + api.options.name);

  stripe = Stripe(api.options.secret_key);
  if (api.options.apiVersion) stripe.setApiVersion(api.options.apiVersion);
  collection = stripe[api.options.name];

  api._loadMulti = function (results, cb) {
    cb(null, results.map(api._afterLoad));
  };

  api._beforeSave = function (entity) {
    var e = api.copy(entity)
      , metadata = {};

    e.metadata || (e.metadata = {});
    if (e.rev > 1) {
      delete e.id;
    }
    // stash modeler's internal props in metadata
    // or stripe will barf
    Object.keys(e).forEach(function (prop) {
      var idx;
      if (prop === 'metadata') return;
      if (~internalProps.indexOf(prop)) {
        metadata[prop] = e[prop];
        delete e[prop];
      }
      // restore Stripe properties with namespace collisions
      else if ((idx = prop.indexOf('_stripe')) > -1) {
        e[prop.substr(0, idx)] = e[prop];
        delete e[prop];
      }
    });
    try {
      e.metadata.modeler = JSON.stringify(hydration.dehydrate(metadata));
    }
    catch (e) {} // shouldn't happen, but don't throw
    return e;
  };

  api._afterSave = function (entity) {
    var e = _.omit(entity, 'id', internalProps);
    // move Stripe properties with namespace collisions
    Object.keys(entity).forEach(function (prop) {
      if (~internalProps.indexOf(prop)) {
        e[prop + '_stripe'] = e[prop];
      }
    });
    return e;
  };

  api._afterLoad = function (entity) {
    var e = api._afterSave(entity)
      , metadata;
    e.id = entity.id;
    // restore modeler's internal props from metadata
    if (entity.metadata && entity.metadata.modeler) {
      try {
        metadata = JSON.parse(entity.metadata.modeler);
        metadata = hydration.hydrate(metadata);
      }
      catch (e) {} // shouldn't happen, but don't throw
      internalProps.forEach(function (prop) {
        if (prop in metadata) {
          e[prop] = metadata[prop];
        }
      });
    }
    return e;
  };

  api._head = function (offset, count, cb) {
    return cb(new Error('head() is not supported for Stripe lists - please use tail() instead'));
  };

  api._tail = function (offset, count, cb) {
    (function fetchNext () {
      var params = {
        offset: offset ? offset : 0
      };
      // Stripe API requires count to be from 1 to 100
      if (count && count >= 1 && count <= 100) params.count = count;
      collection.list(params, function (err, entities) {
        if (err) return cb(err);
        offset += entities.data.length;
        cb(null, entities.data, fetchNext);
      });
    })();
  };

  api._save = function (entity, cb) {
    if (entity.rev > 1) {
      collection.update(entity.id, api._beforeSave(entity), function (err, savedEntity) {
        if (err) return cb(err);
        cb(null, api._afterSave(savedEntity));
      });
    }
    else {
      collection.create(api._beforeSave(entity), function (err, savedEntity) {
        if (err) return cb(err);
        cb(null, api._afterSave(savedEntity));
      });
    }
  };

  api._load = function (id, cb) {
    collection.retrieve(id, function (err, savedEntity) {
      if (err && !err.message.match(/No such (?:customer|card)/)) return cb(err);
      cb(null, savedEntity ? api._afterLoad(savedEntity) : null);
    });
  };

  api._destroy = function (id, cb) {
    collection.del(id, function (err, confirmation) {
      if (err) return cb(err);
      if (!confirmation || !confirmation.deleted) {
        cb(new Error('Delete failed'));
      }
      else cb();
    });
  };

  return api;
};
