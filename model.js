var fs = require('fs'),
    path = require('path'),
    marked = require('marked'),
    step = require('./step');

exports.readCategories = function (callback) {
  var root = path.join(__dirname, 'articles'),
      files;

  step(
    function () {
      fs.readdir(root, this);
    },
    function (err, _files) {
      if (err) { callback(err); return; }

      files = _files;
      var group = this.group();
      files.forEach(function (file) { fs.stat(path.join(root, file), group()); });
    },
    function (err, stats) {
      if (err) { callback(err); return; }

      callback(null, files.filter(function (file, i) {
        return stats[i].isDirectory();
      }));
    }
  );
};

exports.readCategoryArticles = function (category, callback) {
  var root = path.join(__dirname, 'articles', category),
      files;

  step(
    function () {
      fs.readdir(root, this);
    },
    function (err, _files) {
      if (err) { callback(err); return; }

      files = _files;
      var group = this.group();
      files.forEach(function (file) { fs.stat(path.join(root, file), group()); });
    },
    function (err, stats) {
      if (err) { callback(err); return; }
      debugger;
      var group = this.group();
      files.filter(function (file, i) {
        return stats[i].isFile() && path.extname(file) == '.md';
      }).map(function (file) {
        return path.basename(file, '.md');
      }).forEach(function (slug) { exports.readArticle(category, slug, group()); });
    },
    function (err, articles) {
      if (err) { callback(err); return; }
      debugger;
      callback(null, articles);
    }
  );
};

// key is /home/user/mdblog/articles/cat/slug
// value is {mtime: <Date>, category: <String>, slug: <String>, title: <String>, excerpt: <html String>, content: <html String>}
var cache = {};

exports.readArticle = function (category, slug, callback) { // callback(err, article)
  var article_path = path.join(__dirname, 'articles', category, slug) + ".md";
  var article = {};

  step(
    function () {
      fs.stat(article_path, this);
    },
    function (err, stats) {
      if (err) { callback(err); return; }
      if (!stats.isFile()) { callback(new Error("Article is not a regular file")); return; }

      var cached_article = cache[article_path];
      if (cached_article && cached_article.mtime >= stats.mtime)
        callback(null, cached_article);

      article.mtime = stats.mtime;
      article.category = category;
      article.slug = slug;

      fs.readFile(article_path, this);
    },
    function (err, buf) {
      if (err) { callback(err); return; }

      var content = buf.toString();
      var title_pattern = /^# (.+)\n/g;
      var title_match = title_pattern.exec(content);
      if (!title_match) { callback(new Error('Article title absent')); return; }
      article.title = title_match[1];

      var excerpt_end_pos = content.substring(title_pattern.lastIndex).search(/^## (.+)$/m);
      if (~excerpt_end_pos)
        article.excerpt =
          marked(content.substr(title_pattern.lastIndex, excerpt_end_pos).trim()).
          replace(/<code class="lang-([a-z0-9]+)">/g, '<code class="brush: $1">'); // to facilitate syntaxhighlighter on client side
      else
        article.excerpt = '';

      article.content = marked(content).replace(/<code class="lang-([a-z0-9]+)">/g, '<code class="brush: $1">');
      cache[article_path] = article;
      debugger;
      callback(null, article);
    }
  );
};
