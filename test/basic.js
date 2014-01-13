describe('basic test', function () {
  var modeler = require('../')
    , customers
    , customer;

  var testRunId = idgen() // so we can cleanup only this test's data
    , getEmail = function () {
      return 'test-' + testRunId + '-customer-' + idgen() + '@modeler-stripe-test.com';
    };

  before(function () {
    customers = modeler({ name: 'customers', secret_key: process.env.STRIPE_SECRET_KEY });
  });

  it('can create a customer', function (done) {
    customer = customers.create({
      email: getEmail()
    });
    customers.save(customer, function (err, savedCustomer) {
      assert.ifError(err);
      assert(savedCustomer);
      assert.deepEqual(savedCustomer, customer);
      done();
    });
  });

  it('can load a customer', function (done) {
    customers.load(customer.id, function (err, loadedCustomer) {
      assert.ifError(err);
      assert.deepEqual(loadedCustomer, customer);
      done();
    });
  });

  it('can list customers', function (done) {
    customers.list({ reverse: true, load: true }, function (err, savedCustomers) {
      assert.ifError(err);
      assert(Array.isArray(savedCustomers));
      assert(savedCustomers.length);
      assert.deepEqual(savedCustomers[0], customer);
      done();
    });
  });

  it('can update a customer', function (done) {
    var newEmail = customer.email = getEmail();
    customers.save(_.pick(customer, 'id', 'rev', 'created', 'updated', 'email'), function (err, savedCustomer) {
      assert.ifError(err);
      assert(savedCustomer);
      assert.equal(savedCustomer.email, newEmail);
      assert.equal(customer.rev, 1);
      assert.equal(savedCustomer.rev, 2);
      assert.deepEqual(_.omit(savedCustomer, 'rev', 'updated', 'metadata'), _.omit(customer, 'rev', 'updated', 'metadata'));
      done();
    });
  });

  it('can remove a customer', function (done) {
    customers.destroy(customer.id, function (err) {
      assert.ifError(err);
      done();
    });
  });
});
