var fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    step = require('./step'),
    db = require('./db');

// memoized get categories
var getCategories = (function () {
  var _categories;
  return function (callback) {
    if (_categories) { callback(undefined, _categories); return; }

    step(
      function () {
        db.add('blog').map(function (v) {
          return [v.key.split('_')[0]];
        }).reduce(function (vals) {
          var result = {};
          vals.forEach(function (v) {
            if (v in result) result[v] += 1;
            else result[v] = 1;
          });
          return result;
        }).run(this);
      },
      function (err, categories) {
        if (err) { callback(err); return; }

        _categories = categories;
        callback(undefined, _categories);
      }
    );
  };
})();

function month_to_interval(month) {
  return {
    start: Date.UTC(parseInt(month.split('-')[0]),
                    parseInt(month.split('-')[1]) - 1,
                    1, 0, 0, 0, 0),
    end: Date.UTC(parseInt(month.split('-')[0]),
                  parseInt(month.split('-')[1]),
                  1, 0, 0, 0, 0) - 1
  };
}

exports.categories = function (req, res) {
  step(
    function () {
      getCategories(this);
    },
    function (err, categories) {
      categories = _.pairs(categories).sort(function (a, b) { return a[0] > b[0]; });
      res.json({ categories: categories });
    }
  );
};

exports.index = function (req, res) {
  if (!req.query.month)
    req.query.month = new Date().toISOString().substring(0,7);

  var interval = month_to_interval(req.query.month);

  step(
    function () {
      db.add({ bucket: 'blog',
               key_filters: [['tokenize', '_', 3], ['string_to_int'], ['between', interval.start, interval.end]] })
        .map(function(v){return [Riak.mapValuesJson(v)[0]];}).run(this);
    },
    function (err, articles) {
      if (err) { req.next(err); return; }

      articles = articles.map(function (article) {
        delete article.content;
        return article;
      }).sort(function (a, b) { return b.mtime - a.mtime; });
      res.json({ articles: articles });
    }
  );
};

exports.category = function (req, res) {
  if (!req.query.month)
    req.query.month = new Date().toISOString().substring(0,7);

  var category = req.params[0],
      interval = month_to_interval(req.query.month);

  step(
    function () {
      getCategories(this);
    },
    function (err, categories) {
      if (err) { req.next(err); return; }
      if (!(category in categories)) { res.send(404); return; }

      db.add({ bucket: 'blog',
               key_filters: [['and',
                              [['tokenize', '_', 1], ['eq', category]],
                              [['tokenize', '_', 3], ['string_to_int'], ['between', interval.start, interval.end]]
                             ]] })
        .map(function(v){return [Riak.mapValuesJson(v)[0]];}).run(this);
    },
    function (err, articles) {
      if (err) { req.next(err); return; }

      articles = articles.map(function (article) {
        delete article.content;
        return article;
      }).sort(function (a, b) { return b.mtime - a.mtime; });
      res.json({ articles: articles });
    }
  );
};

exports.article = function (req, res) {
  var category = req.params[0],
      slug = req.params[1];

  step(
    function () {
      getCategories(this);
    },
    function (err, categories) {
      if (err) { req.next(err); return; }
      if (!(category in categories)) { res.send(404); return; }

      db.add({ bucket: 'blog',
               key_filters: [['and',
                              [['tokenize', '_', 1], ['eq', category]],
                              [['tokenize', '_', 2], ['eq', slug]]
                             ]] })
        .map(function(v){return [Riak.mapValuesJson(v)[0]];}).run(this);
    },
    function (err, articles) {
      if (err) { req.next(err); return; }
      if (articles.length === 0) { res.send(404); return; }

      var article;
      if (articles.length > 1) // just in case db is not completely sanitized
        article = _.max(articles, function (article) { return article.mtime; });
      else
        article = articles[0];

      res.json({ article: article });
    }
  );
};
