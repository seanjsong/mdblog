var path = require('path'),
    fs = require('fs'),
    marked = require('marked'),
    _ = require('underscore'),
    step = require('./step');

// // a workaround for https://github.com/mostlyserious/riak-js/issues/112
// // since I decide to stick with https://github.com/nullobject/riak-js, I no longer need this workaround
// var http = require('http');
// http.globalAgent.maxSockets = 100;

exports = module.exports = require('riak-js').getClient({host: "localhost", port: "8098"});

exports.updateDb = function (articlesDir, callback) {
  var db = this;

  step(
    function () {
      readCategories(articlesDir, this);
    },

    function (err, categories) {
      if (err) { callback(err); return; }

      var group = this.group();
      categories.forEach(function (category) {
        readCategorySlugs(articlesDir, category, group());
      });

      db.keys('blog', this.parallel());
    },

    function (err, slugs_fs, slugs_db) {
      function db_remove(key) {
        db.remove('blog', key , function (err) {
          if (err) { console.log('Removing: ' + key + ' ' + err); return; }
          console.log('Removed: ' + key);
        });
      }

      if (err) { callback(err); return; }

      // slugs from filesystem: [{'category1_slug1': mtime1}, {'category1_slug2': mtime2}, {'category2_slug1': mtime3} ...]
      slugs_fs = _.extend.apply(null, _.flatten(slugs_fs)); // {'category1_slug1': mtime1, 'category1_slug2': mtime2, 'category2_slug1': mtime3 ...}

      // slugs from db: ['category1_slug1_mtime1', 'category1_slug2_mtime2', 'category2_slug1_mtime3' ...]
      slugs_db = slugs_db.filter(function (key) { // sanitizing step
        var key_components = key.split('_'),
            category = key_components[0],
            slug = key_components[1],
            mtime = parseInt(key_components[2]);
        if (!category || !slug || !mtime) {
          db_remove(key);
          return false;
        } else return true;
      }).map(function (key) { // [{'category1_slug1': mtime1}, {'category1_slug2': mtime2}, {'category2_slug1': mtime3} ...]
        var key_components = key.split('_'),
            category = key_components[0],
            slug = key_components[1],
            mtime = parseInt(key_components[2]),
            o = {};
        o[category + '_' + slug] = mtime;
        return o;
      }).reduce(function (obj1, obj2) { // {'category1_slug1': mtime1, 'category1_slug2': mtime2, 'category2_slug1': mtime3 ...}
        var category_slug = Object.keys(obj2)[0];

        if (!obj1[category_slug]) { // extend
          obj1[category_slug] = obj2[category_slug];

        } else if (obj1[category_slug] < obj2[category_slug]) { // de-dup, remove obj1
          db_remove(category_slug + '_' + obj1[category_slug]);
          obj1[category_slug] = obj2[category_slug];

        } else {                // de-dup, remove obj2
          db_remove(category_slug + '_' + obj2[category_slug]);
        }

        return obj1;
      }, {});

      // remove invalid keys from db
      _.each(slugs_db, function (mtime, category_slug) {
        if (!slugs_fs[category_slug] || slugs_fs[category_slug] !== mtime) db_remove(category_slug + '_' + mtime);
      });

      var group = this.group();
      _.each(slugs_fs, function (mtime, category_slug) {
        if (!slugs_db[category_slug])
          updateArticle(db, articlesDir, category_slug + '_' + mtime, group());
      });
    },

    function (err) {
      callback(err);
    }
  );
};

function readCategories(articlesDir, callback) {
  step(
    function () {
      fs.readdir(articlesDir, this);
    },
    function (err, files) {
      if (err) { callback(err); return; }

      this.parallel()(undefined, files);

      var group = this.group();
      files.forEach(function (file) { fs.stat(path.join(articlesDir, file), group()); });
    },
    function (err, files, stats) {
      if (err) { callback(err); return; }

      callback(undefined, files.filter(function (file, i) {
        return stats[i].isDirectory();
      }));
    }
  );
}

function readCategorySlugs(articlesDir, category, callback) {
  var root = path.join(articlesDir, category);

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
        _.zip(files, stats).filter(function (file_stats) { // [['slug1.md', stats1], ['slug2.md', stats2] ...]
          return file_stats[1].isFile() && path.extname(file_stats[0]) === '.md';
        }).map(function (file_stats) { // [{'category1_slug1': mtime1}, {'category1_slug2': mtime2} ...]
          var o = {};
          o[category + '_' + path.basename(file_stats[0], '.md')] = file_stats[1].mtime.getTime();
          return o;
        })
      );
    }
  );
}

// article value is {title: <String>, excerpt: <html String>, content: <html String>}
// callback(err)
function updateArticle(db, articlesDir, key, callback) {
  var key_components = key.split('_'),
      category = key_components[0],
      slug = key_components[1],
      mtime = parseInt(key_components[2]),
      article_path = path.join(articlesDir, category, slug) + ".md";

  step(
    function () {
      fs.readFile(article_path, this);
    },
    function (err, buf) {
      if (err) { callback(err); return; }

      var article = {category: category, slug: slug, mtime: mtime},
          content = buf.toString(),
          title_pattern = /^# (.+)\n/g,
          title_match = title_pattern.exec(content);

      if (!title_match) { callback(new Error('Article title absent')); return; }
      article.title = title_match[1];

      var excerpt_end_pos = content.substring(title_pattern.lastIndex).search(/^## (.+)$/m);
      if (~excerpt_end_pos)
        article.excerpt =
          marked(content.substr(title_pattern.lastIndex, excerpt_end_pos).trim()).
          replace(/<code class="lang-([a-z0-9]+)">/g, '<code class="brush: $1">'); // to facilitate syntaxhighlighter on client side
      else
        article.excerpt = '';

      article.content =
        marked(content)
        .replace(/<code class="lang-([a-z0-9]+)">/g, '<code class="brush: $1">')
        .replace(/<img src="([^"]+)"/g, '<img src="' + 'api/article/' + category + '/' + slug + '/' + '$1"');

      db.save('blog', key, article, function(err) { if (!err) console.log('Saved: '+ key); callback(err); });
    }
  );
};
