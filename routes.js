/**
 * @fileoverview This module exports various routing handlers for app
 */

var fs = require('fs'),
    path = require('path'),
    _ = require('underscore'),
    step = require('./step'),
    db = require('./db');

/**
 * helper function, memoized get categories
 * the type of callback is {Function(Error=, Object.<string, number>)}
 * string is category name, number is the amount of articles within this category
 */
var getCategories = (function() {
  var _categories;
  return function(callback) {
    if (_categories) {callback(undefined, _categories); return;}

    step(
      function() {
        db.mapreduce.add('blog').map(function(v) {
          return [v.key.split('_')[0]];
        }).reduce(function(vals) {
          var result = {};
          vals.forEach(function(v) {
            if (v in result) result[v] += 1;
            else result[v] = 1;
          });
          return result;
        }).run(this);
      },
      function(err, categories) {
        if (err) {callback(err); return;}

        _categories = categories;
        callback(undefined, _categories);
      }
    );
  };
})();

/**
 * response with category list
 * response format is {categories: Array.<Tuple<string, number>>}
 * string is category name, number is the amount of articles within this category
 * sorted in alphabetical order of category name
 */
exports.categories = function(req, res) {
  step(
    function() {
      getCategories(this);
    },
    function(err, categories) {
      categories = _.pairs(categories).sort(function(a, b) {return a[0] > b[0];});
      res.set('Cache-Control', 'public, max-age=' + (3600*24));
      res.json({categories: categories});
    }
  );
};

/**
 * helper function, given page number and total articles, calculate start the end article number
 * @param {number} page
 * @param {number} total
 * @return {{start: number, end: number}}
 */
function pageToInterval(page, total) {
  var PER_PAGE = 10;
  if ((page-1) * PER_PAGE >= total)
    return null;
  else
    return {start: (page-1) * PER_PAGE, end: _.min([total, page * PER_PAGE])};
}

/**
 * response with article list of all articles within a specified page number
 * page is specified in query string like this: ?page=4 (default to 1 if absent)
 * response format is {articles: Array.<Article>}
 * see updateArticle in db.js for the type of Article
 */
exports.index = function(req, res) {
  var page = req.query.page ? parseInt(req.query.page) : 1;
  var search = req.query.search;

  step(
    function() {
      if (search) {
        db.search.find('blog', 'content:'+search, this);
      } else {
        db.count('blog', this);
      }
    },
    function(err, total) {
      if (err) {req.next(err); return;}

      var interval;
      if (search) {
        interval = pageToInterval(page, total.docs.length);
        if (!interval) {res.send(404); return;}
        this(undefined,
             total.docs.map(function(doc) {doc.fields.mtime = parseInt(doc.fields.mtime); return doc.fields;})
             .slice(interval.start, interval.end));
      } else {
        interval = pageToInterval(page, total);
        if (!interval) {res.send(404); return;}
        db.mapreduce.add('blog')
          .map('Riak.mapValuesJson')
          .reduce('Riak.reduceSort', 'function(a,b){return b.mtime - a.mtime;}')
          .reduce('Riak.reduceSlice', [interval.start, interval.end]).run(this);
      }
    },
    function(err, articles) {
      if (err) {req.next(err); return;}

      articles = articles.map(function(article) {
        delete article.content;
        return article;
      });

      res.set('Last-Modified', (new Date(articles[0].mtime)).toGMTString());
      res.json({articles: articles});
    }
  );
};

// same as exports.index, except that response only contains article list of a particular category
exports.category = function(req, res) {
  var category = req.params[0],
      page = req.query.page ? parseInt(req.query.page) : 1;

  step(
    function() {
      getCategories(this);
    },
    function(err, categories) {
      if (err) {req.next(err); return;}
      if (!(category in categories)) {res.send(404); return;}

      db.mapreduce.add({bucket: 'blog', key_filters: [['tokenize', '_', 1], ['eq', category]]})
        .map(function(){return [1];})
        .reduce('Riak.reduceSum').run(this);
    },
    function(err, total) {
      if (err) {req.next(err); return;}

      var interval = pageToInterval(page, total);
      if (!interval) {res.send(404); return;}

      db.mapreduce.add({bucket: 'blog', key_filters: [['tokenize', '_', 1], ['eq', category]]})
        .map('Riak.mapValuesJson')
        .reduce('Riak.reduceSort', 'function(a,b){return b.mtime - a.mtime;}')
        .reduce('Riak.reduceSlice', [interval.start, interval.end]).run(this);
    },

    function(err, articles) {
      if (err) {req.next(err); return;}

      articles = articles.map(function(article) {
        delete article.content;
        return article;
      });

      res.set('Last-Modified', (new Date(articles[0].mtime)).toGMTString());
      res.json({articles: articles});
    }
  );
};

/**
 * response with an article, response format is {article: Article}
 * see updateArticle in db.js for the type of Article
 */
exports.article = function(req, res) {
  var category = req.params[0],
      slug = req.params[1];

  step(
    function() {
      getCategories(this);
    },
    function(err, categories) {
      if (err) {req.next(err); return;}
      if (!(category in categories)) {res.send(404); return;}

      db.mapreduce.add({bucket: 'blog',
                        key_filters: [['and',
                                       [['tokenize', '_', 1], ['eq', category]],
                                       [['tokenize', '_', 2], ['eq', slug]]
                                      ]]})
        .map(function(v){return [Riak.mapValuesJson(v)[0]];}).run(this);
    },
    function(err, articles) {
      if (err) {req.next(err); return;}
      if (articles.length === 0) {res.send(404); return;}

      var article;
      if (articles.length > 1) // just in case db is not completely sanitized
        article = _.max(articles, function(article) {return article.mtime;});
      else
        article = articles[0];

      res.set('Last-Modified', (new Date(article.mtime)).toGMTString());
      res.json({article: article});
    }
  );
};
