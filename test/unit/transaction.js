var Transaction = require('../../lib/transaction');
var Promise     = testPromise;

var conn = {
  conn_obj: true
};

var knex = {
  client: {
    name: 'mysql',
    startTransaction: function() {
      return Promise.fulfilled(conn);
    }
  }
};

describe('Transaction', function () {

  describe('constructor', function() {
    it('saves the current client off the knex instance', function() {
      var transaction = new Transaction(knex);
      expect(transaction.client).to.eql(knex.client);
    });
  });

  describe('run', function() {
    var transaction;
    beforeEach(function() {
      transaction = new Transaction(knex);
    });
    it('should call the client startTransaction', function() {
      var spy  = sinon.spy(knex.client, 'startTransaction');
      var spy2 = sinon.spy(transaction, 'getContainerObject');
      var stub = sinon.stub(transaction, 'initiateDeferred', function() {
        return function() {
          expect(arguments[0]).to.include.keys('commit','rollback','connection');
        };
      });
      return transaction.run(function() {}).then(function() {
        knex.client.startTransaction.restore();
        spy.should.have.been.calledOnce;
        spy2.should.have.been.calledOnce;
        spy2.should.have.been.calledWithExactly(conn);
        stub.should.have.been.calledOnce;
      });
    });
  });

});