var _    = require('lodash');
var push = Array.prototype.push;

var Helpers = require('../helpers').Helpers;

var components = [
  'columns', 'joins', 'wheres', 'groups',
  'havings', 'orders', 'limit', 'offset', 'unions'
];

var Compiler = module.exports = function(builder) {
  this.builder    = builder;
  this.grouped    = _.groupBy(builder.statements, 'type');
  this.statements = builder.statements;
};

Compiler.prototype = {

  // The keyword identifier wrapper format.
  wrapValue: function(value) {
    return (value !== '*' ? Helpers.format('"%s"', value) : "*");
  },

  compiled: function(target) {
    return this[target]();
  },

  // Compiles the `select` statement, or nested sub-selects
  // by calling each of the component compilers, trimming out
  // the empties, and returning a generated query string.
  select: function() {
    var sql = [];
    for (var i = 0, l = components.length; i < l; i++) {
      var fn = this[components[i]];
      if (fn) sql.push(fn.call(this));
    }
    // If there is a transaction, and we have either `forUpdate` or `forShare` specified,
    // call the appropriate additions to the select statement.
    sql.push({sql: _.pluck(this.grouped.lock, 'value')});

    return {
      sql: _.compact(_.pluck(sql, 'sql')).join(' '),
      bindings: _.reduce(_.pluck(sql, 'bindings'), function(memo, val) {
        if (!_.isEmpty(val)) push.apply(memo, val);
        return memo;
      }, [])
    };
  },

  // Compiles an `insert` query, allowing for multiple
  // inserts using a single query statement.
  insert: function() {
    var insertData = this.grouped.insert[0];
    return {
      sql: 'insert into ' + this.table() + ' ' +
        insertData.columns + ' values ' + insertData.value,
      bindings: insertData.bindings
    };
  },

  // Gets the table value defined for the query,
  // or an empty string if none is set.
  table: function() {
    return this.builder._table();
  },

  // Compiles the columns in the query, specifying if an item was distinct.
  columns: function() {
    var distinct = false;
    var bindings = [];
    var sql = _.compact(_.map(this.grouped.columns, function(block) {
      if (block.distinct) distinct = true;
      bindings.push(block.bindings);
      return block.value;
    }, this));
    return {
      sql: 'select ' + (distinct ? 'distinct ' : '') +
        (sql.join(', ') || '* ') + ' from ' + this.table(),
      bindings: _.flatten(bindings)
    };
  },

  // Compiles all each of the `join` clauses on the query,
  // including any nested join queries.
  joins: function() {
    return {
      sql: _.map(this.grouped.join, function(item, i) {
        var sql = '';
        if (i > 0) sql += item.bool;
        return sql + item.value;
      }).join(' ')
    };
  },

  // Compiles all `where` statements on the query.
  wheres: function() {
    return this._havingWhere('where');
  },

  groups: function() {
    return this._groupsOrders('group');
  },

  orders: function() {
    return this._groupsOrders('order');
  },

  // Compiles the `having` statements.
  havings: function() {
    return this._havingWhere('having');
  },

  // Compile the "union" queries attached to the main query.
  unions: function(qb) {
    return _.pluck(this.grouped.union, 'value').join(' ');
  },

  // Compiles the `order by` statements.
  _groupsOrders: function(type) {
    var items = _.pluck(this.grouped[type], 'value');
    if (items.length > 0) {
      return {
        sql: type + ' by ' + items.join(', ')
      };
    }
    return {};
  },

  // The same logic is used for compiling "where" statements as it is
  // for "having" statements.
  _havingWhere: function(type) {
    var bindings = [];
    return {
      sql: _.map(this.grouped[type], function(item, i) {
        bindings.push(item.bindings);
        return (i === 0 ? type + ' ' : '') + item.bool + ' ' + item.value;
      }).join(' ').replace(/and |or /, ''),
      bindings: _.flatten(bindings)
    };
  },

  // Compiles an `update` query.
  update: function(qb) {

  // _compileUpdate: function() {
  //   if (returning) this.returning(returning);
  //   var obj = Helpers.sortObject(values);
  //   var bindings = [];
  //   for (var i = 0, l = obj.length; i < l; i++) {
  //     bindings[i] = obj[i][1];
  //   }
  //   this.bindings = bindings.concat(this.bindings || []);
  //   this.values   = obj;
  // },

    var values = qb.values;
    var table = Helpers.wrapTable(qb.table), columns = [];
    for (var i=0, l = values.length; i < l; i++) {
      var value = values[i];
      columns.push(Helpers.wrap(value[0]) + ' = ' + Helpers.parameter(value[1]));
    }
    return 'update ' + table + ' set ' + columns.join(', ') + ' ' + this.compileWheres(qb);
  },

  // Compiles a `delete` query.
  delete: function(qb) {
    var table = Helpers.wrapTable(qb.table);
    var where = !_.isEmpty(qb.wheres) ? this.compileWheres(qb) : '';
    return 'delete from ' + table + ' ' + where;
  },

  // Compiles a `truncate` query.
  truncate: function() {
    return {
      sql: 'truncate ' + this.table()
    };
  }
};

Compiler.extend = Helpers.extend;