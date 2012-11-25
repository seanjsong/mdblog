/**
 * @fileoverview This module exports a riak-js client connecting to localhost:8098
 * and attach updateDb() method to it.
 */

var path = require('path'),
    fs = require('fs'),
    marked = require('marked'),
    _ = require('underscore'),
    step = require('./step');

exports = module.exports = require('riak-js').getClient({host: "localhost", port: "8098"});

/**
 * This method update database from articles in filesystem. In datebase, all blog entries are under 'blog' bucket.
 * Outdated articles in database will be updated. Articles removed from filesystem will be removed from database.
 * New articles from filesystem will be inserted into database.
 * @param {string} articlesDir the absolute path where you put blog categories, articles and article attachments
 * @param {Function(Error=)} callback on success the callback will be passed undefined, on error it'll be passed an Error
 */
exports.updateDb = function(articlesDir, callback) {
  var db = this;

  step(
    function() {
      readCategories(articlesDir, this);
    },

    function(err, categories) {
      if (err) {callback(err); return;}

      var group = this.group();
      categories.forEach(function(category) {
        readCategorySlugs(articlesDir, category, group());
      });

      var blogKeys = [];
      var callNextStep = this.parallel();
      db.keys('blog', {keys: 'stream'})
        .on('keys', function(keyStream) {blogKeys = blogKeys.concat(keyStream);})
        .on('end', function() {callNextStep(undefined, blogKeys);})
        .start();
    },

    function(err, slugsFs, slugsDb) {
      function dbRemove(key) {
        db.remove('blog', key , function(err) {
          if (err) {console.log('Removing: ' + key + ' ' + err); return;}
          console.log('Removed: ' + key);
        });
      }

      if (err) {callback(err); return;}

      // slugs from filesystem: [{'category1_slug1': mtime1}, {'category1_slug2': mtime2}, {'category2_slug1': mtime3} ...]
      slugsFs = _.extend.apply(null, _.flatten(slugsFs)); // {'category1_slug1': mtime1, 'category1_slug2': mtime2, 'category2_slug1': mtime3 ...}

      // slugs from db: ['category1_slug1_mtime1', 'category1_slug2_mtime2', 'category2_slug1_mtime3' ...]
      slugsDb = slugsDb.filter(function(key) { // sanitizing step
        var keyComponents = key.split('_'),
            category = keyComponents[0],
            slug = keyComponents[1],
            mtime = parseInt(keyComponents[2]);
        if (!category || !slug || !mtime) {
          dbRemove(key);
          return false;
        } else return true;
      }).map(function(key) { // [{'category1_slug1': mtime1}, {'category1_slug2': mtime2}, {'category2_slug1': mtime3} ...]
        var keyComponents = key.split('_'),
            category = keyComponents[0],
            slug = keyComponents[1],
            mtime = parseInt(keyComponents[2]),
            o = {};
        o[category + '_' + slug] = mtime;
        return o;
      }).reduce(function(obj1, obj2) { // {'category1_slug1': mtime1, 'category1_slug2': mtime2, 'category2_slug1': mtime3 ...}
        var categorySlug = Object.keys(obj2)[0];

        if (!obj1[categorySlug]) { // extend
          obj1[categorySlug] = obj2[categorySlug];

        } else if (obj1[categorySlug] < obj2[categorySlug]) { // de-dup, remove obj1
          dbRemove(categorySlug + '_' + obj1[categorySlug]);
          obj1[categorySlug] = obj2[categorySlug];

        } else {                // de-dup, remove obj2
          dbRemove(categorySlug + '_' + obj2[categorySlug]);
        }

        return obj1;
      }, {});

      // remove invalid keys from db
      _.each(slugsDb, function(mtime, categorySlug) {
        if (!slugsFs[categorySlug] || slugsFs[categorySlug] !== mtime)
          dbRemove(categorySlug + '_' + mtime);
      });

      var group = this.group();
      _.each(slugsFs, function(mtime, categorySlug) {
        if (!slugsDb[categorySlug])
          updateArticle(db, articlesDir, categorySlug + '_' + mtime, group());
      });
    },

    function(err) {
      callback(err);
    }
  );
};

// helper function for updateDb
function readCategories(articlesDir, callback) {
  step(
    function() {
      fs.readdir(articlesDir, this);
    },
    function(err, files) {
      if (err) {callback(err); return;}

      this.parallel()(undefined, files);

      var group = this.group();
      files.forEach(function(file) {fs.stat(path.join(articlesDir, file), group());});
    },
    function(err, files, stats) {
      if (err) {callback(err); return;}

      callback(undefined, files.filter(function(file, i) {
        return stats[i].isDirectory();
      }));
    }
  );
}

// helper function for updateDb
function readCategorySlugs(articlesDir, category, callback) {
  var root = path.join(articlesDir, category);

  step(
    function() {
      fs.readdir(root, this);
    },
    function(err, files) {
      if (err) {callback(err); return;}

      this.parallel()(undefined, files);

      var group = this.group();
      files.forEach(function(file) {fs.stat(path.join(root, file), group());});
    },
    function(err, files, stats) {
      if (err) {callback(err); return;}

      callback(
        undefined,
        _.zip(files, stats).filter(function(fileStats) { // [['slug1.md', stats1], ['slug2.md', stats2] ...]
          return fileStats[1].isFile() && path.extname(fileStats[0]) === '.md';
        }).map(function(fileStats) { // [{'category1_slug1': mtime1}, {'category1_slug2': mtime2} ...]
          var o = {};
          o[category + '_' + path.basename(fileStats[0], '.md')] = fileStats[1].mtime.getTime();
          return o;
        })
      );
    }
  );
}

// helper function for updateDb
function updateArticle(db, articlesDir, key, callback) {
  var keyComponents = key.split('_'),
      category = keyComponents[0],
      slug = keyComponents[1],
      mtime = parseInt(keyComponents[2]),
      articlePath = path.join(articlesDir, category, slug) + ".md";

  step(
    function() {
      fs.readFile(articlePath, this);
    },
    function(err, buf) {
      if (err) {callback(err); return;}

      /**
       * article object
       * @type {{category: string, slug: string, mtime: number, title: string, excerpt: html string, content: html string}}
       */
      var article = {category: category, slug: slug, mtime: mtime},
          content = buf.toString(),
          titlePattern = /^# (.+)\n/g,
          titleMatch = titlePattern.exec(content);

      if (!titleMatch) {callback(new Error('Article title absent')); return;}
      article.title = titleMatch[1];

      var excerptEndPos = content.substring(titlePattern.lastIndex).search(/^## (.+)$/m);
      if (~excerptEndPos)
        article.excerpt =
          marked(content.substr(titlePattern.lastIndex, excerptEndPos).trim()).
          replace(/<code class="lang-([a-z0-9]+)">/g, '<code class="brush: $1">'); // to facilitate syntaxhighlighter on client side
      else
        article.excerpt = '';

      article.content =
        marked(content)
        .replace(/<code class="lang-([a-z0-9]+)">/g, '<code class="brush: $1">')
        .replace(/<img src="([^"]+)"/g, '<img src="' + 'api/article/' + category + '/' + slug + '/' + '$1"');

      db.save('blog', key, article, function(err) {if (!err) console.log('Saved: '+ key); callback(err);});
    }
  );
};
