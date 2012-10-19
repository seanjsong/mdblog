var step = require('./step'),
    path = require('path'),
    fs = require('fs'),
    marked = require('marked');

// a temporary solution for https://github.com/mostlyserious/riak-js/issues/112
var http = require('http');
http.globalAgent.maxSockets = 100;

exports = module.exports = require('riak-js').getClient({host: "localhost", port: "8098"});

exports.updateDb = function (callback) {
  var db = this;

  step(
    function () {
      readCategories(this.parallel());
      db.buckets(this.parallel());
    },
    function (err, categories, buckets) {
      if (err) { callback(err); return; }

      // remove from db those invalid categories
      buckets.buckets.forEach(function (bucket) {
        if (!~categories.indexOf(bucket))
          db.keys(bucket, function (err, keys) {
            if (err) { console.log(err); return; }
            keys.forEach(function (key) {
              db.remove(bucket, key, function (err) {
                if (err) { console.log(err); return; }
                console.log('Removed: '+bucket+'/'+key);
              });
            });
          });
      });

      this.parallel()(undefined, categories);

      var group = this.group();
      categories.forEach(function (category) {
        readCategorySlugs(category, group());
      });
    },
    function (err, categories, slugs) {
      if (err) { callback(err); return; }

      var bucket_key_pairs = [];
      categories.forEach(function (category, i) {
        // remove from db those invalid articles of each category
        db.keys(category, function (err, keys) {
          if (err) { console.log(err); return; }
          keys.forEach(function (key) {
            if (!~slugs[i].indexOf(key))
              db.remove(category, key, function (err) {
                if (err) { console.log(err); return; }
                console.log('Removed: '+category+'/'+key);
              });
          });
        });

        // flatten all (category, slug) pairs to bucket_key_pairs
        slugs[i].forEach(function (slug) {
          bucket_key_pairs.push({ bucket: category, key: slug });
        });
      });

      // read file and update db if necessary
      var group = this.group();
      bucket_key_pairs.forEach(function (bucket_key_pair) {
        updateArticle(db, bucket_key_pair.bucket, bucket_key_pair.key, group());
      });
    },
    function (err) {
      callback(err);
    }
  );
};

function readCategories(callback) {
  var root = path.join(__dirname, 'articles');

  step(
    function () {
      fs.readdir(root, this);
    },
    function (err, files) {
      if (err) { callback(err); return; }

      this.parallel()(undefined, files);

      var group = this.group();
      files.forEach(function (file) { fs.stat(path.join(root, file), group()); });
    },
    function (err, files, stats) {
      if (err) { callback(err); return; }

      callback(undefined, files.filter(function (file, i) {
        return stats[i].isDirectory();
      }));
    }
  );
}

function readCategorySlugs (category, callback) {
  var root = path.join(__dirname, 'articles', category);

  step(
    function () {
      fs.readdir(root, this);
    },
    function (err, files) {
      if (err) { callback(err); return; }

      this.parallel()(undefined, files);

      var group = this.group();
      files.forEach(function (file) { fs.stat(path.join(root, file), group()); });
    },
    function (err, files, stats) {
      if (err) { callback(err); return; }

      callback(
        undefined,
        files.filter(function (file, i) {
          return stats[i].isFile() && path.extname(file) == '.md';
        }).map(function (file) {
          return path.basename(file, '.md');
        })
      );
    }
  );
}

// article value is {mtime: <Date>, category: <String>, slug: <String>, title: <String>, excerpt: <html String>, content: <html String>}
function updateArticle (db, category, slug, callback) { // callback(err, article)
  var article_path = path.join(__dirname, 'articles', category, slug) + ".md";
  var article = {};

  step(
    function () {
      db.get(category, slug, this);
    },
    function (err, dbArticle) {
      if (err) {
        if (err.statusCode == 404)
          dbArticle = null;
        else { callback(err); return; }
      }

      fs.stat(article_path, this.parallel());
      this.parallel()(undefined, dbArticle);
    },
    function (err, stats, dbArticle) {
      if (err) { callback(err); return; }
      if (!stats.isFile()) { callback(new Error("Article is not a regular file")); return; }

      if (dbArticle && dbArticle.mtime >= stats.mtime.getTime()) { callback(undefined); return; }

      article.mtime = stats.mtime.getTime();
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
      db.save(category, slug, article, function(err) { if (!err) console.log('Saved '+category+'/'+slug); callback(err); });
    }
  );
};
