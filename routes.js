var fs = require('fs'),
    path = require('path'),
    step = require('./step'),
    db = require('./db');

exports.index = function (req, res) {
  step(
    function () {
      db.buckets(this);
    },
    function (err, categories) {
      if (err) { req.next(err); return; }

      categories = categories.buckets.sort();
      this.parallel()(undefined, categories);

      var group = this.group();
      categories.forEach(function (category) {
        db.getAll(category, group());
      });
    },
    function (err, categories, articles) {
      if (err) { req.next(err); return; }

      // flatten articles coming from different categories, then extract the data portion
      articles = Array.prototype.concat.apply([], articles).map(function (article) {
        return article.data;
      }).sort(function (a, b) {
        return b.mtime - a.mtime;
      });

      res.render('index', { title: '', categories: categories, articles: articles });
    }
  );
};

exports.category = function (req, res) {
  var category = req.params[0];

  step(
    function () {
      db.buckets(this);
    },
    function (err, categories) {
      if (err) { req.next(err); return; }

      categories = categories.buckets.sort();
      if (!~categories.indexOf(category)) { res.send(404); return; }

      this.parallel()(undefined, categories);
      db.getAll(category, this.parallel());
    },
    function (err, categories, articles) {
      if (err) { req.next(err); return; }

      articles = articles.map(function (article) {
        return article.data;
      }).sort(function (a, b) {
        return b.mtime - a.mtime;
      });

      res.render('index', { title: category, categories: categories, articles: articles });
    }
  );
};

exports.article = function (req, res) {
  var category = req.params[0],
      slug = req.params[1];

  step(
    function () {
      db.buckets(this);
    },
    function (err, categories) {
      if (err) { req.next(err); return; }

      categories = categories.buckets.sort();
      if (!~categories.indexOf(category)) { res.send(404); return; }

      this.parallel()(undefined, categories);
      db.get(category, slug, this.parallel());
    },
    function (err, categories, article) {
      if (err) { req.next(err); return; }

      res.render('article', { title: article.title, categories: categories, article: article });
    }
  );
};
