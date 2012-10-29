var express = require('express'),
    path = require('path'),
    routes = require('./routes'),
    db = require('./db');

// if you wanna serve this app directly under root, set this to ''
module.exports = function (urlPrefix, articlesDir, staticDir) {

  db.updateDb(articlesDir, function (err) {
    if (err) {
      console.log(err);
      process.exit(1);
    }
  });

  var blogApp = express();


  var getContent = function(url, callback) {
  };

  function ajaxCrawling(req, res, next) {
    if (!req.query._escaped_fragment_) { next(); return; }

    var content = '',
        url =  req.protocol + '://' + req.host + urlPrefix + '/index.html#!' + req.query._escaped_fragment_,
        phantom = require('child_process').spawn('phantomjs', [__dirname + '/phantom_script.js', url]);

    phantom.stdout.setEncoding('utf8');
    phantom.stdout.on('data', function(data) {
      content += data.toString();
    });
    phantom.stderr.on('data', function (data) {
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
    blogApp.use(express.static(staticDir));
  });

  blogApp.configure('development', function(){
    blogApp.use(express.errorHandler());
  });

//  function redirectRoot

  function appendSlashRedirect(req, res, next) {
    if (req.path[req.path.length-1] !== '/') {
      res.writeHead(301, { 'Location': urlPrefix + req.path + '/' + req.url.substr(req.path.length) });
      res.end();
      return;
    }
    next();
  }

  blogApp.get('/', function (req, res) {
    res.writeHead(301, { 'Location': urlPrefix + '/index.html#!/' });
    res.end();
    return;
  });
// function(req, res) { // this is where our single-page application starts
//     res.sendfile(path.join(staticDir, 'index.html'));
//   });
  blogApp.get(/^\/api\/categories\/?$/, appendSlashRedirect, routes.categories);
  blogApp.get(/^\/api\/articles\/?$/, appendSlashRedirect, routes.index);
  blogApp.get(/^\/api\/articles\/([a-z0-9-]+)\/?$/, appendSlashRedirect, routes.category);
  blogApp.get(/^\/api\/article\/([a-z0-9-]+)\/([a-z0-9-]+)\/?$/, appendSlashRedirect, routes.article);
  blogApp.get(/^\/api\/article\/([a-z0-9-]+\/[a-z0-9-]+\/.+\.[a-zA-Z0-9]{1,4})$/, function (req, res) {
    res.sendfile(path.join(articlesDir, req.params[0]));
  });

  return blogApp;
};
