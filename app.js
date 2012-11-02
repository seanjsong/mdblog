/**
 * @fileoverview This is the main entrance of mdblog module, require('mdblog') returns a function.
 * Calling this function and you'll get an express app, which is configured by the parameters
 * you passed into the function. You can listen on the returned express app alone, or you can
 * mount the app to your express root app.
 * @author songjinshan@gmail.com (Seann Soong)
 */

var express = require('express'),
    path = require('path'),
    routes = require('./routes'),
    db = require('./db');

/**
 * The function constructing an express app is exported
 * @param {string} urlPrefix such as '/blog', set this to '' if you wanna use this app directly as root app
 * @param {string} articlesDir the absolute path where you put blog categories, articles and article attachments
 * @param {string} staticDir the absolute path where you put html/js/css files
 * @return {express app}
 */
module.exports = function(urlPrefix, articlesDir, staticDir) {
  // update database from articles in filesystem first
  db.updateDb(articlesDir, function(err) {
    if (err) {
      console.log(err);
      process.exit(1);
    }
  });

  var blogApp = express();

  /**
   * A middleware intercepting all requests with a ?_escaped_fragment= query param. We'll return a static html file
   * to crawlers rather than a page containing JavaScript generated content.
   * @see https://developers.google.com/webmasters/ajax-crawling/docs/specification
   */
  function ajaxCrawling(req, res, next) {
    if (!req.query._escaped_fragment_) {next(); return;}

    var content = '',
        url =  req.protocol + '://' + req.get('Host') + urlPrefix + '/index.html#!' + req.query._escaped_fragment_,
        phantom = require('child_process').spawn('phantomjs', [__dirname + '/phantom-script.js', url]);

    phantom.stdout.setEncoding('utf8');
    phantom.stdout.on('data', function(data) {
      content += data.toString();
    });
    phantom.stderr.on('data', function(data) {
      console.log('stderr: ' + data);
    });
    phantom.on('exit', function(code) {
      if (code !== 0) {
        res.send(500);
      } else {
        res.send(content);
      }
    });
  }

  blogApp.configure(function(){
    blogApp.use(express.logger('dev'));
    blogApp.use(ajaxCrawling);
    blogApp.use(blogApp.router);
    blogApp.use(express.static(staticDir, {maxAge: 3600000*24}));
  });

  blogApp.configure('development', function(){
    blogApp.use(express.errorHandler());
  });

  // an express routing middleware to insert trailing slashes into urls (after path, before query string and hash) and redirect
  function appendSlashRedirect(req, res, next) {
    if (req.path[req.path.length-1] !== '/') {
      res.writeHead(301, {'Location': urlPrefix + req.path + '/' + req.url.substr(req.path.length)});
      res.end();
      return;
    }
    next();
  }

  // index.html is served by express.static middleware, which loads the frontend single-page app
  // #! is always present to help crawlers identifying pages of dynamic content
  blogApp.get('/', function(req, res) {
    res.writeHead(301, {'Location': urlPrefix + '/index.html#!/'});
    res.end();
    return;
  });

  blogApp.get(/^\/api\/categories\/?$/, appendSlashRedirect, routes.categories);
  blogApp.get(/^\/api\/articles\/?$/, appendSlashRedirect, routes.index);
  blogApp.get(/^\/api\/articles\/([a-z0-9-]+)\/?$/, appendSlashRedirect, routes.category);
  blogApp.get(/^\/api\/article\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/, appendSlashRedirect, routes.article);
  blogApp.get(/^\/api\/article\/([a-z0-9-]+\/[a-z0-9-]+\/.+\.[a-zA-Z0-9]{1,4})$/, function(req, res) {
    res.sendfile(req.params[0], {root: articlesDir, maxAge: 3600000*24});
  });

  return blogApp;
};
