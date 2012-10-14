var fs = require('fs'),
    path = require('path'),
    step = require('step'),
    model = require('./model');

exports.index = function (req, res) {
  var categories;

  step(
    function () {
      model.readCategories(this);
    },
    function (err, _categories) {
      if (err) { req.next(err); return; }

      categories = _categories;
      categories.sort();
      var group = this.group();
      categories.forEach(function (category) {
        model.readCategoryArticles(category, group());
      });
    },
    function (err, articles) {
      if (err) { req.next(err); return; }

      articles = Array.prototype.concat.apply([], articles); // flatten articles coming from different categories
      articles.sort(function (a, b) {
        return b.mtime.getTime() - a.mtime.getTime();
      });
      res.render('index', { title: '', categories: categories, articles: articles });
    }
  );
};

exports.category = function (req, res) {
  var category = req.params[0],
      categories;

  step(
    function () {
      model.readCategories(this);
    },
    function (err, _categories) {
      if (err) { req.next(err); return; }
      if (!~_categories.indexOf(category)) { res.send(404); return; }

      categories = _categories;
      categories.sort();
      model.readCategoryArticles(category, this);
    },
    function (err, articles) {
      if (err) { req.next(err); return; }

      articles.sort(function (a, b) {
        return b.mtime.getTime() - a.mtime.getTime();
      });
      res.render('index', { title: category, categories: categories, articles: articles });
    }
  );
};

exports.article = function (req, res) {
  var category = req.params[0],
      slug = req.params[1],
      categories;

  step(
    function () {
      model.readCategories(this);
    },
    function (err, _categories) {
      if (err) { req.next(err); return; }
      if (!~_categories.indexOf(category)) { res.send(404); return; }

      categories = _categories;
      categories.sort();
      model.readArticle(category, slug, this);
    },
    function (err, article) {
      if (err) { req.next(err); return; }

      res.render('article', { title: article.title, categories: categories, article: article });
    }
  );
};
